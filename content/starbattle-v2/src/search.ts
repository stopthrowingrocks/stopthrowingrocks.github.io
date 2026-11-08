import { applyStep, assume, isSolved } from './engine';
import { neighbors } from './puzzles';
import type { Block, BoolExpr, Fact, FactOp, HypExpr, NumExpr, PState, Puzzle } from './types';

/**
 * A search for the cheapest proof in the block language.
 *
 * The shape of the problem, measured on the 5x5 boards: nothing is forced at the start —
 * every line fact is "exactly k stars among these cells" — so the first move is always a
 * derivation. What makes the search tractable is that a statement carries its derivation
 * inline, so the search runs over *board-advancing statements* only: every edge resolves at
 * least one cell, putting the depth at the number of real proof steps rather than the
 * number of facts ever written down.
 *
 * Moves are generated semantically rather than by enumerating expressions. Every derivation
 * this language can express with `+` and `-` has the same shape — take some disjoint facts,
 * subtract some disjoint facts that sit inside them, and the counts subtract too — so the
 * generator picks those two sets, works out the resulting count with integer arithmetic,
 * and only writes an expression when the result forces a cell. Evaluating candidate
 * expressions through the engine instead would be both slower and biased toward whatever
 * syntactic shapes the enumerator happened to cover.
 *
 * Everything is parameterized the way a future `suppose` block will need: the goal is a
 * predicate over states, and moves come from a list of generators, so a new kind of step is
 * a new generator rather than a change to the search.
 */

// ── Cost ────────────────────────────────────────────────────────────────────────

/**
 * What an expression costs: one for each operator and each clique or bound, nothing for
 * naming a hypothesis you already have. Referring to a fact is free; deriving one is work.
 */
export function exprCost(expr: HypExpr | null): number {
  if (!expr) return 0;
  switch (expr.kind) {
    case 'ref': return 0;
    case 'clique': case 'bound': return 1;
    default: return 1 + exprCost(expr.left) + exprCost(expr.right);
  }
}

/** What a counted quantity costs: the count itself, and any arithmetic over it. */
function numCost(expr: NumExpr | null): number {
  if (!expr) return 0;
  switch (expr.kind) {
    case 'lit': return 0;
    case 'count': return 1;
    default: return 1 + numCost(expr.a) + numCost(expr.b);
  }
}

/** What a claim's predicate costs, on the same footing as a hypothesis expression. */
export function boolCost(pred: BoolExpr | null): number {
  if (!pred) return 0;
  switch (pred.kind) {
    case 'is_star': case 'is_elim': return 1;
    case 'not': return 1 + boolCost(pred.a);
    case 'and': case 'or': return 1 + boolCost(pred.a) + boolCost(pred.b);
    case 'cmp': return 1 + numCost(pred.a) + numCost(pred.b);
  }
}

/**
 * A statement costs one, plus whatever it carries: its expressions, its predicate, and the
 * statements nested inside it. So proving a cell empty by contradiction — a claim, a
 * predicate, and a by-contradiction naming the hypothesis that breaks — costs the same
 * three as crossing cells out through a clique.
 */
export function statementCost(block: Block): number {
  switch (block.type) {
    case 'stars': case 'elims': case 'define': case 'replace':
      return 1 + exprCost(block.expr);
    case 'split':
      return 1 + exprCost(block.expr) + block.parts.reduce((total, part) => total + exprCost(part), 0);
    case 'claim':
      return 1 + boolCost(block.pred) + proofCost(block.body);
    case 'by_contradiction':
      return 1 + exprCost(block.contradiction) + proofCost(block.body);
    case 'argument':
      return 1 + proofCost(block.body);
    case 'constructor':
      return 1 + proofCost(block.left) + proofCost(block.right);
    case 'by_cases':
      return 1 + proofCost(block.positive) + proofCost(block.negative);
    default:
      return 1;
  }
}

export const proofCost = (blocks: Block[]): number =>
  blocks.reduce((total, block) => total + statementCost(block), 0);

// ── Leaves ──────────────────────────────────────────────────────────────────────

/** A hypothesis the search can name directly: a fact in the pool, or a king-move clique. */
interface Leaf {
  expr: HypExpr;
  cells: number[];
  cellSet: Set<number>;
  op: FactOp;
  target: number;
  cost: number;
}

let exprCounter = 0;
const exprId = () => `t${++exprCounter}`;

const cliqueCache = new Map<number, number[][]>();
/** Every king-move clique of two or more cells. Fixed per board size, so worth caching. */
export function boardCliques(puzzle: Puzzle): number[][] {
  const cached = cliqueCache.get(puzzle.size);
  if (cached) return cached;
  const found: number[][] = [];
  const grow = (current: number[], candidates: number[]) => {
    if (current.length >= 2) found.push([...current]);
    candidates.forEach((cell, index) =>
      grow([...current, cell], candidates.slice(index + 1).filter(c => neighbors(cell, puzzle.size).includes(c))));
  };
  const all = [...Array(puzzle.size * puzzle.size).keys()];
  all.forEach((cell, index) =>
    grow([cell], all.slice(index + 1).filter(c => neighbors(cell, puzzle.size).includes(c))));
  cliqueCache.set(puzzle.size, found);
  return found;
}

const hasUpper = (op: FactOp): boolean => op === '=' || op === '<=';
const hasLower = (op: FactOp): boolean => op === '=' || op === '>=';

function leavesOf(puzzle: Puzzle, state: PState, shuffleSeed?: number): Leaf[] {
  const leaves: Leaf[] = state.facts
    .filter(fact => fact.op !== '!=')
    .map(fact => ({
      expr: { eid: exprId(), kind: 'ref', factId: fact.id } as HypExpr,
      cells: fact.cells,
      cellSet: new Set(fact.cells),
      op: fact.op,
      target: fact.target,
      cost: 1,
    }));
  // A clique earns its place only if it meets a fact: either it sits inside one, so it can
  // be subtracted from it, or one sits inside it, so it can be the outer term instead.
  const unresolved = (cells: number[]) => cells.every(c => state.cells[c] === null);
  for (const cells of boardCliques(puzzle)) {
    if (!unresolved(cells)) continue;
    const cellSet = new Set(cells);
    const meets = leaves.some(leaf =>
      cells.every(c => leaf.cellSet.has(c)) || leaf.cells.every(c => cellSet.has(c)));
    if (!meets) continue;
    leaves.push({
      expr: { eid: exprId(), kind: 'clique', cells: [...cells] },
      cells, cellSet, op: '<=', target: 1, cost: 2,
    });
  }
  // `cost` above counts the leaf itself; a bare reference is free, a clique costs one.
  for (const leaf of leaves) leaf.cost = leaf.expr.kind === 'ref' ? 0 : 1;
  return shuffleSeed === undefined ? leaves : shuffleWith(leaves, shuffleSeed);
}

// ── Moves ───────────────────────────────────────────────────────────────────────

export interface Move {
  block: Block;
  cost: number;
  state: PState;
  /**
   * What this move is, independent of where it was generated: two moves with the same
   * signature prove the same thing and have the same effect.
   */
  signature: string;
  /**
   * The cells this move depends on and the cells it settles. Two moves commute when
   * neither writes where the other reads or writes, which is what lets the search explore
   * one order of them and skip the rest.
   */
  reads: Set<number>;
  writes: Set<number>;
}

/** Moves commute when neither disturbs what the other depends on. */
export function commute(a: Move, b: Move): boolean {
  for (const cell of a.writes) if (b.reads.has(cell) || b.writes.has(cell)) return false;
  for (const cell of b.writes) if (a.reads.has(cell)) return false;
  return true;
}

/** Placing a star settles its neighbours too, so they belong to the footprint. */
function writeFootprint(puzzle: Puzzle, cells: number[], type: 'stars' | 'elims'): Set<number> {
  const writes = new Set(cells);
  if (type === 'stars') for (const cell of cells) for (const n of neighbors(cell, puzzle.size)) writes.add(n);
  return writes;
}

/** A move generator turns a state into the statements worth trying from it. */
export type MoveGenerator = (puzzle: Puzzle, state: PState, options: SearchOptions) => Move[];

const resolved = (state: PState): number => state.cells.reduce((n, c) => n + (c === null ? 0 : 1), 0);

let blockCounter = 0;
const blockId = () => `s${++blockCounter}`;

const sumExpr = (parts: Leaf[]): HypExpr =>
  parts.slice(1).reduce<HypExpr>(
    (left, leaf) => ({ eid: exprId(), kind: 'add', left, right: leaf.expr }),
    parts[0].expr);

/** `outer − inner`, as the engine would build it. */
function derivationExpr(outer: Leaf[], inner: Leaf[]): HypExpr {
  const left = sumExpr(outer);
  return inner.length === 0 ? left : { eid: exprId(), kind: 'sub', left, right: sumExpr(inner) };
}

/**
 * The statements worth trying from this state: take disjoint facts, subtract disjoint facts
 * that sit inside them, and keep the combinations whose resulting count forces every
 * remaining cell one way or the other. Only those are built into blocks and checked against
 * the engine, which is what collapses a root with ~130 single derivations down to a handful.
 */
export const boardAdvancingMoves: MoveGenerator = (puzzle, state, options) => {
  // There is no cap on how many facts a statement may combine — operators simply cost, and
  // the statement's cost ceiling is what stops the enumeration. A sum of m facts costs m-1
  // operators; subtracting a sum of n more costs another n.
  const maxStatementCost = options.maxStatementCost ?? 5;
  const before = resolved(state);
  const leaves = leavesOf(puzzle, state, options.shuffleLeaves);
  const seen = new Map<string, {
    type: 'stars' | 'elims'; expr: HypExpr; cost: number; cells: number[]; reads: Set<number>;
  }>();

  /**
   * Several combinations derive the same fact, so candidates are collected by what they
   * prove and only the cheapest way of writing each is kept. Taking the first one
   * enumerated instead would make the search return proofs more expensive than they
   * need to be, which defeats the point of costing them.
   */
  const emit = (
    outer: Leaf[], inner: Leaf[],
    cells: number[], op: FactOp, target: number,
  ) => {
    // One combination of facts weighed — the unit of work this tool spends.
    tally(options.probe, 'arithmetic');
    if (cells.length === 0) return;
    // The only counts that force a cell: none left to place, or exactly as many as cells.
    const allElim = target === 0 && hasUpper(op);
    const allStar = target === cells.length && hasLower(op);
    if (!allElim && !allStar) return;
    const type = allStar ? 'stars' : 'elims';
    const key = `${type}|${op}${target}:${cells.join(',')}`;
    const expr = derivationExpr(outer, inner);
    const cost = 1 + exprCost(expr);
    const existing = seen.get(key);
    if (existing && existing.cost <= cost) return;
    // Everything the statement names is something it depends on.
    const reads = new Set<number>();
    for (const leaf of [...outer, ...inner]) for (const cell of leaf.cells) reads.add(cell);
    seen.set(key, { type, expr, cost, cells, reads });
  };

  /** Grow the subtracted sum, one disjoint insider at a time. */
  const growInner = (
    outer: Leaf[], outerCells: number[], outerOp: FactOp, outerTarget: number,
    insiders: Leaf[], from: number,
    inner: Leaf[], innerCells: Set<number>, innerOp: FactOp, innerTarget: number,
    spent: number,
  ) => {
    if (inner.length > 0) {
      // Subtracting flips the direction of the inner bound.
      const upper = hasUpper(outerOp) && hasLower(innerOp);
      const lower = hasLower(outerOp) && hasUpper(innerOp);
      if (upper || lower) {
        emit(outer, inner,
          outerCells.filter(c => !innerCells.has(c)),
          upper && lower ? '=' : upper ? '<=' : '>=',
          outerTarget - innerTarget);
      }
    }
    for (let i = from; i < insiders.length; i++) {
      const leaf = insiders[i];
      if (leaf.cells.some(c => innerCells.has(c))) continue;
      // Each extra term adds an operator, plus one for the `-` on the first of them.
      const cost = spent + 1 + leaf.cost;
      if (1 + cost > maxStatementCost) continue;
      growInner(outer, outerCells, outerOp, outerTarget, insiders, i + 1,
        [...inner, leaf], new Set([...innerCells, ...leaf.cells]),
        inner.length === 0 ? leaf.op : combineSums(innerOp, leaf.op),
        innerTarget + leaf.target, cost);
    }
  };

  /** Grow the outer sum, then try everything that can be subtracted from it. */
  const growOuter = (
    outer: Leaf[], outerCells: number[], outerOp: FactOp, outerTarget: number,
    from: number, spent: number,
  ) => {
    const outerSet = new Set(outerCells);
    emit(outer, [], outerCells, outerOp, outerTarget);
    if (1 + spent + 1 <= maxStatementCost) {
      const insiders = leaves.filter(leaf =>
        !outer.includes(leaf) && leaf.cells.length < outerCells.length && leaf.cells.every(c => outerSet.has(c)));
      growInner(outer, outerCells, outerOp, outerTarget, insiders, 0, [], new Set(), '=', 0, spent);
    }
    for (let i = from; i < leaves.length; i++) {
      const leaf = leaves[i];
      // Summing cliques as the outer term proves nothing a single one would not.
      if (leaf.expr.kind !== 'ref') continue;
      if (leaf.cells.some(c => outerSet.has(c))) continue;
      const cost = spent + 1 + leaf.cost;
      if (1 + cost > maxStatementCost) continue;
      growOuter([...outer, leaf], [...outerCells, ...leaf.cells],
        combineSums(outerOp, leaf.op), outerTarget + leaf.target, i + 1, cost);
    }
  };

  leaves.forEach((leaf, index) =>
    growOuter([leaf], leaf.cells, leaf.op, leaf.target, index + 1, leaf.cost));

  // Only now build the statements and put them to the engine, which is the expensive part.
  const moves: Move[] = [];
  for (const [signature, candidate] of seen) {
    const block: Block = { id: blockId(), type: candidate.type, expr: candidate.expr };
    const step = applyStep(puzzle, state, block);
    if (step.status !== 'ok' || resolved(step.state) <= before) continue;
    moves.push({
      block, cost: candidate.cost, state: step.state, signature,
      reads: candidate.reads,
      writes: writeFootprint(puzzle, candidate.cells, candidate.type),
    });
  }
  return moves;
};

/**
 * Every partition of `cells` into exactly `parts` king-cliques.
 *
 * In such a partition each part holds exactly one star — there are `parts` stars to place
 * and no clique can hold two — which is what makes the decomposition worth so much: a fact
 * permitting C(n, k) placements becomes k facts permitting a handful each.
 */
export function cliqueTilings(puzzle: Puzzle, cells: number[], parts: number): number[][][] {
  const key = `${puzzle.size}|${parts}|${cells.join(',')}`;
  const cached = tilingCache.get(key);
  if (cached) return cached;
  const found: number[][][] = [];
  const touch = (a: number, b: number) => neighbors(a, puzzle.size).includes(b);
  const search = (left: number[], acc: number[][]) => {
    if (left.length === 0) {
      if (acc.length === parts) found.push(acc.map(p => [...p]));
      return;
    }
    if (acc.length >= parts) return;
    const [head, ...rest] = left;
    const near = rest.filter(c => touch(head, c));
    for (let mask = 0; mask < (1 << near.length); mask++) {
      const extra = near.filter((_, i) => mask & (1 << i));
      if (!extra.every((a, i) => extra.slice(i + 1).every(b => touch(a, b)))) continue;
      search(rest.filter(c => !extra.includes(c)), [...acc, [head, ...extra]]);
    }
  };
  if (cells.length <= 20) search(cells, []);
  tilingCache.set(key, found);
  return found;
}
const tilingCache = new Map<string, number[][][]>();

/** Smallest parts first: a 1-cell part is a star outright, a 2-cell part is nearly one. */
const tilingRank = (tiling: number[][]): string =>
  tiling.map(p => p.length).sort((a, b) => a - b).join(',');

/**
 * Decompose a count into its parts, which is the one move that makes the proof state
 * simpler rather than larger. A fact of k stars over n cells permits C(n, k) placements;
 * tiled into k cliques it becomes k facts of one star each over a handful of cells.
 *
 * Unlike every other generator here these settle no cells at all, so they are invisible to
 * the "did it resolve something" test the others are pruned by. They pay off later, often
 * much later — in a hand proof, parts of one early split were still being used eighty
 * statements on.
 *
 * Only the best tiling per fact is offered. Where several exist they tend to cascade the
 * same way, and preferring the smallest parts picks the same decomposition a person does.
 */
export const splitMoves: MoveGenerator = (puzzle, state, options) => {
  const moves: Move[] = [];
  const facts = options.shuffleLeaves === undefined
    ? state.facts
    : shuffleWith(state.facts, options.shuffleLeaves);
  tally(options.probe, 'split', facts.length);
  for (const fact of facts) {
    // Splitting needs an exact count or a lower bound, and at least two parts to be worth it.
    if (fact.op !== '=' && fact.op !== '>=') continue;
    if (fact.target < 2 || fact.cells.length <= fact.target) continue;
    const tilings = cliqueTilings(puzzle, fact.cells, fact.target);
    if (tilings.length === 0) continue;
    const best = tilings.reduce((a, b) => (tilingRank(a) <= tilingRank(b) ? a : b));

    const block: Block = {
      id: blockId(),
      type: 'split',
      name: '',
      expr: { eid: exprId(), kind: 'ref', factId: fact.id },
      parts: best.map(cells => ({ eid: exprId(), kind: 'clique', cells: [...cells] })),
    };
    const step = applyStep(puzzle, state, block);
    if (step.status !== 'ok') continue;
    moves.push({
      block, cost: statementCost(block), state: step.state,
      signature: `split|${fact.op}${fact.target}:${fact.cells.join(',')}`,
      reads: new Set(fact.cells),
      writes: new Set(),
    });
  }
  return moves;
};

/**
 * Statements that need no derivation: a fact whose count already settles every cell it
 * covers. This is a small fraction of what `boardAdvancingMoves` considers, which is what
 * makes it the right generator for exploring inside an assumption, where the question is
 * only whether the assumption breaks — not how elegantly.
 */
export const forcedMoves: MoveGenerator = (puzzle, state, options) => {
  const before = resolved(state);
  const moves: Move[] = [];
  // One glance per hypothesis, and nothing else: the whole class is the fact pool.
  tally(options.probe, 'forced', state.facts.length);
  for (const fact of state.facts) {
    const allElim = fact.target === 0 && hasUpper(fact.op);
    const allStar = fact.target === fact.cells.length && hasLower(fact.op);
    if (!allElim && !allStar) continue;
    const block: Block = {
      id: blockId(),
      type: allStar ? 'stars' : 'elims',
      expr: { eid: exprId(), kind: 'ref', factId: fact.id },
    };
    const step = applyStep(puzzle, state, block);
    if (step.status !== 'ok' || resolved(step.state) <= before) continue;
    moves.push({
      block, cost: 1, state: step.state,
      signature: `${block.type}|${fact.op}${fact.target}:${fact.cells.join(',')}`,
      reads: new Set(fact.cells),
      writes: writeFootprint(puzzle, fact.cells, allStar ? 'stars' : 'elims'),
    });
  }
  return moves;
};

/**
 * Proof by contradiction, one cell at a time: suppose the cell is the opposite of what we
 * want to show, and look for a hypothesis that breaks. The cheap case needs no body at all
 * — the assumption alone makes some line impossible — and costs three, the same as a
 * clique derivation. Where it does not break immediately, a small nested search looks for
 * forced moves that make it break, and those statements are the body.
 *
 * This is the generator the search was parameterized for: its body comes from the same
 * `search`, aimed at a contradiction instead of a solved board.
 */
export const contradictionMoves: MoveGenerator = (puzzle, state, options) => {
  const bodyNodes = options.contradictionBodyNodes ?? 30;
  const before = resolved(state);
  const moves: Move[] = [];

  for (let cell = 0; cell < state.cells.length; cell++) {
    if (state.cells[cell] !== null) continue;
    for (const kind of ['is_elim', 'is_star'] as const) {
      const pred: BoolExpr = { eid: exprId(), kind, cell };
      // The body opens with the opposite of what the claim asserts.
      const opened = assume(puzzle, state, { eid: exprId(), kind: 'not', a: pred });
      if ('error' in opened) continue;
      // One supposition weighed against every hypothesis it could break: the cells-times-
      // hypotheses product that makes this tool dear to search, whatever the claim costs.
      tally(options.probe, 'contradiction', Math.max(1, opened.state.facts.length));

      let body: Block[] = [];
      let end = opened.state;
      if (!end.contradiction) {
        if (bodyNodes <= 0) continue;
        const inner = search(puzzle, end, {
          goal: s => s.contradiction,
          generators: options.contradictionBodyGenerators ?? [forcedMoves],
          maxNodes: bodyNodes,
          timeLimitMs: 2000,
        });
        if (!inner.found) continue;
        body = inner.blocks;
        end = inner.best;
      }
      // `via` has to name the hypothesis that broke; without one there is nothing to point at.
      const broken = end.facts.find(fact => fact.impossible);
      if (!broken) continue;

      const block: Block = {
        id: blockId(),
        type: 'claim',
        pred,
        body: [{
          id: blockId(),
          type: 'by_contradiction',
          body,
          contradiction: { eid: exprId(), kind: 'ref', factId: broken.id },
        }],
      };
      const step = applyStep(puzzle, state, block);
      if (step.status !== 'ok' || resolved(step.state) <= before) continue;
      // A claim's body can touch anything, so treat it as depending on the whole board:
      // conservative, and it simply means claims never take part in the reduction.
      const everywhere = new Set([...Array(state.cells.length).keys()]);
      moves.push({
        block, cost: statementCost(block), state: step.state,
        signature: `claim|${kind}|${cell}`,
        reads: everywhere, writes: everywhere,
      });
    }
  }
  return moves;
};

/** Adding counts keeps only the bound directions both sides share. */
function combineSums(left: FactOp, right: FactOp): FactOp {
  const upper = hasUpper(left) && hasUpper(right);
  const lower = hasLower(left) && hasLower(right);
  return upper && lower ? '=' : upper ? '<=' : '>=';
}

// ── Search ──────────────────────────────────────────────────────────────────────

/**
 * How much sifting each tool did, as opposed to what its result cost to write down.
 *
 * Statement cost prices the finished proof. It says nothing about the work of finding it:
 * checking every cell against every hypothesis for a one-step contradiction is 25x15 on a
 * 5x5 however short the claim that comes out. Two proofs of the same length are not equally
 * hard to come by, so the tools are compared on candidates examined per cell settled.
 */
export interface WorkProbe {
  /** Candidates examined, by tool. */
  tried: Map<string, number>;
}

export const newProbe = (): WorkProbe => ({ tried: new Map() });

export function tally(probe: WorkProbe | undefined, tool: string, n = 1): void {
  if (probe && n) probe.tried.set(tool, (probe.tried.get(tool) ?? 0) + n);
}

export const probeTotal = (probe: WorkProbe): number =>
  [...probe.tried.values()].reduce((a, b) => a + b, 0);

/** Deterministic shuffle from a seed — for perturbing a search, not for cryptography. */
export function shuffleWith<T>(items: T[], seed: number): T[] {
  const out = items.slice();
  let x = (seed * 2654435761) >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    x = (x * 1664525 + 1013904223) >>> 0;
    const j = x % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface SearchOptions {
  /** Reached the target? Defaults to "every cell proven". */
  goal?: (state: PState) => boolean;
  generators?: MoveGenerator[];
  /** Collects candidates examined per tool. Measurement only — no effect on what is found. */
  probe?: WorkProbe;
  /**
   * Shuffle the hypothesis and clique pool before enumerating from it.
   *
   * A stronger perturbation than reordering the moves a sweep returns. An exhaustive sweep
   * examines the same candidates whatever order it walks them in, so its work count cannot
   * move; the signed beam, which keeps only its best 24 partials, can find different things
   * entirely. This is the lever for asking how much of a work figure is the board.
   */
  shuffleLeaves?: number;
  /**
   * The most one statement may cost. There is no separate limit on operators — combining
   * more facts simply costs more, and this is where that stops.
   */
  maxStatementCost?: number;
  /**
   * States the nested search may expand while looking for a body that breaks. Zero keeps
   * only the contradictions that need no body at all.
   */
  contradictionBodyNodes?: number;
  /** How a contradiction body is explored. Forced moves only, by default. */
  contradictionBodyGenerators?: MoveGenerator[];
  /**
   * Skip commuting moves whose order has already been explored. Off by default: measured
   * on the 5x5 boards, only about 6% of available move pairs commute, so the bookkeeping
   * costs more than it saves. The redundancy there is convergence — different statements
   * reaching the same state — which this does not address.
   */
  sleepSets?: boolean;
  maxCost?: number;
  maxNodes?: number;
  timeLimitMs?: number;
}

export interface SearchResult {
  found: boolean;
  blocks: Block[];
  cost: number;
  /** Why the search stopped, when it found nothing. */
  exhausted?: 'nodes' | 'time' | 'cost' | 'space';
  nodes: number;
  ms: number;
  /** Successor states generated, and how many were already known at no greater cost. */
  generated: number;
  merged: number;
  /** Successors never generated at all, because a commuting order was already explored. */
  slept: number;
  /** The best state reached, by cells resolved — what to look at when it found nothing. */
  best: PState;
}

const factKey = (fact: Fact): string => `${fact.op}${fact.target}:${fact.cells.join(',')}`;

/** Board plus hypotheses, by content: two states that know the same things are one node. */
function stateKey(state: PState): string {
  const board = state.cells.map(c => (c === 'star' ? '*' : c === 'elim' ? 'x' : '.')).join('');
  const facts = state.facts.map(factKey).sort().join(';');
  return `${board}|${state.contradiction ? '!' : ''}${facts}`;
}

/** A binary heap, so the frontier stays ordered by cost without re-sorting it. */
class Frontier<T> {
  private readonly items: { cost: number; seq: number; value: T }[] = [];
  private seq = 0;

  push(cost: number, value: T): void {
    const item = { cost, seq: this.seq++, value };
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.before(this.items[index], this.items[parent])) break;
      [this.items[index], this.items[parent]] = [this.items[parent], this.items[index]];
      index = parent;
    }
  }

  pop(): { cost: number; value: T } | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1, right = left + 1;
        let smallest = index;
        if (left < this.items.length && this.before(this.items[left], this.items[smallest])) smallest = left;
        if (right < this.items.length && this.before(this.items[right], this.items[smallest])) smallest = right;
        if (smallest === index) break;
        [this.items[index], this.items[smallest]] = [this.items[smallest], this.items[index]];
        index = smallest;
      }
    }
    return { cost: top.cost, value: top.value };
  }

  /** Ties break on insertion order, so a search run twice returns the same proof. */
  private before(a: { cost: number; seq: number }, b: { cost: number; seq: number }): boolean {
    return a.cost !== b.cost ? a.cost < b.cost : a.seq < b.seq;
  }
}

/**
 * Cheapest-first search over proof states. Every move only adds knowledge, so a state is
 * worth keeping once, at the lowest cost that reaches it; expanding in cost order then makes
 * the first proof found the cheapest one the move set can express.
 */
export function search(puzzle: Puzzle, state: PState, options: SearchOptions = {}): SearchResult {
  const goal = options.goal ?? isSolved;
  const generators = options.generators ?? [boardAdvancingMoves, splitMoves, contradictionMoves];
  const maxNodes = options.maxNodes ?? 20000;
  const timeLimitMs = options.timeLimitMs ?? 20000;
  const started = Date.now();

  const frontier = new Frontier<{ state: PState; blocks: Block[]; sleep: Set<string> }>();
  const seenStates = new Map<string, { cost: number; sleep: Set<string> }>();
  frontier.push(0, { state, blocks: [], sleep: new Set() });
  seenStates.set(stateKey(state), { cost: 0, sleep: new Set() });

  let nodes = 0;
  let generated = 0;
  let merged = 0;
  let slept = 0;
  let best = state;
  let exhausted: SearchResult['exhausted'] = 'space';

  for (;;) {
    const next = frontier.pop();
    if (!next) break;
    const { cost, value } = next;
    if (options.maxCost !== undefined && cost > options.maxCost) { exhausted = 'cost'; break; }
    if (goal(value.state)) {
      return { found: true, blocks: value.blocks, cost, nodes, generated, merged, slept, ms: Date.now() - started, best: value.state };
    }
    if (resolved(value.state) > resolved(best)) best = value.state;
    nodes++;
    if (nodes >= maxNodes) { exhausted = 'nodes'; break; }
    if (Date.now() - started > timeLimitMs) { exhausted = 'time'; break; }

    // Sleep sets: statements that commute can be taken in any order for the same result,
    // so having explored one order here, refuse the rest. A move is put to sleep in a
    // child only while it still commutes with everything taken since.
    const enabled: Move[] = [];
    for (const generate of generators) enabled.push(...generate(puzzle, value.state, options));
    enabled.sort((a, b) => a.cost - b.cost || a.signature.localeCompare(b.signature));

    const useSleep = options.sleepSets ?? false;
    const taken: Move[] = [];
    for (const move of enabled) {
      if (useSleep && value.sleep.has(move.signature)) { slept++; continue; }
      const childSleep = new Set<string>();
      if (useSleep) {
        for (const other of taken) if (commute(move, other)) childSleep.add(other.signature);
        for (const signature of value.sleep) {
          const sleeping = enabled.find(m => m.signature === signature);
          if (sleeping && commute(move, sleeping)) childSleep.add(signature);
        }
        taken.push(move);
      }

      const key = stateKey(move.state);
      const reached = cost + move.cost;
      generated++;
      const known = seenStates.get(key);
      // Re-expand a state already seen only when this path is cheaper, or lets moves
      // through that the earlier path had asleep — otherwise the reduction could hide the
      // only route to the cheapest proof.
      const lessAsleep = useSleep && known !== undefined && [...known.sleep].some(sig => !childSleep.has(sig));
      if (known !== undefined && known.cost <= reached && !lessAsleep) { merged++; continue; }
      seenStates.set(key, {
        cost: Math.min(reached, known?.cost ?? reached),
        sleep: known === undefined || reached < known.cost
          ? childSleep
          : new Set([...known.sleep].filter(sig => childSleep.has(sig))),
      });
      frontier.push(reached, { state: move.state, blocks: [...value.blocks, move.block], sleep: childSleep });
    }
  }
  return { found: false, blocks: [], cost: 0, exhausted, nodes, generated, merged, slept, ms: Date.now() - started, best };
}
