import { applyStep } from './engine';
import { neighbors } from './puzzles';
import type { Block, FactOp, HypExpr, PState, Puzzle } from './types';
import { exprCost, tally, type Move, type MoveGenerator, type SearchOptions } from './search';

/**
 * A move constructor that eliminates rather than enumerates.
 *
 * The existing constructor builds every disjoint sum against every contained sum and costs
 * them afterwards, which is why its price runs away with the cost ceiling — seconds per
 * state on a 14x14. This one works the way the engine already thinks about claim
 * predicates in `lowerPred`: a hypothesis is a signed vector over cells with a constant,
 * and combining two of them cancels their overlap. Starting from one fact it repeatedly
 * takes whichever neighbouring fact shrinks the support most, keeping a beam of the best
 * partial combinations rather than all of them.
 *
 * What it can express is unchanged. A legal statement is still a sum of disjoint facts
 * minus a sum of disjoint facts inside them — the engine checks each step, so an
 * intermediate with a negative coefficient could never be written down. The difference is
 * that the combination is *found* by following shared cells instead of by trying
 * everything, so the work scales with how facts actually overlap.
 */

// ── Cell sets as bit masks ──────────────────────────────────────────────────────

type Mask = Uint32Array;

const makeMask = (words: number): Mask => new Uint32Array(words);

function maskOf(cells: number[], words: number): Mask {
  const mask = makeMask(words);
  for (const cell of cells) mask[cell >>> 5] |= 1 << (cell & 31);
  return mask;
}

const disjoint = (a: Mask, b: Mask): boolean => {
  for (let i = 0; i < a.length; i++) if ((a[i] & b[i]) !== 0) return false;
  return true;
};

const subset = (a: Mask, b: Mask): boolean => {
  for (let i = 0; i < a.length; i++) if ((a[i] & ~b[i]) !== 0) return false;
  return true;
};

function popcount(mask: Mask): number {
  let total = 0;
  for (let i = 0; i < mask.length; i++) {
    let v = mask[i];
    v = v - ((v >>> 1) & 0x55555555);
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
    total += (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  }
  return total;
}

const combineWith = (a: Mask, b: Mask, op: (x: number, y: number) => number): Mask => {
  const out = makeMask(a.length);
  for (let i = 0; i < a.length; i++) out[i] = op(a[i], b[i]) >>> 0;
  return out;
};

const keyOf = (mask: Mask): string => mask.join(',');

// ── Leaves ──────────────────────────────────────────────────────────────────────

interface SignedLeaf {
  expr: HypExpr;
  mask: Mask;
  cells: number[];
  op: FactOp;
  target: number;
  cost: number;
}

let exprCounter = 0;
const exprId = () => `v${++exprCounter}`;

const hasUpper = (op: FactOp) => op === '=' || op === '<=';
const hasLower = (op: FactOp) => op === '=' || op === '>=';
const sumOp = (a: FactOp, b: FactOp): FactOp => {
  const upper = hasUpper(a) && hasUpper(b), lower = hasLower(a) && hasLower(b);
  return upper && lower ? '=' : upper ? '<=' : '>=';
};

const cliqueCache = new Map<number, number[][]>();
function boardCliques(puzzle: Puzzle): number[][] {
  const cached = cliqueCache.get(puzzle.size);
  if (cached) return cached;
  const found: number[][] = [];
  const grow = (current: number[], candidates: number[]) => {
    if (current.length >= 1) found.push([...current]);
    candidates.forEach((cell, index) =>
      grow([...current, cell], candidates.slice(index + 1).filter(c => neighbors(cell, puzzle.size).includes(c))));
  };
  const all = [...Array(puzzle.size * puzzle.size).keys()];
  all.forEach((cell, index) =>
    grow([cell], all.slice(index + 1).filter(c => neighbors(cell, puzzle.size).includes(c))));
  cliqueCache.set(puzzle.size, found);
  return found;
}

function leavesOf(puzzle: Puzzle, state: PState, words: number): SignedLeaf[] {
  const leaves: SignedLeaf[] = [];
  for (const fact of state.facts) {
    if (fact.op === '!=') continue;
    leaves.push({
      expr: { eid: exprId(), kind: 'ref', factId: fact.id },
      mask: maskOf(fact.cells, words), cells: fact.cells,
      op: fact.op, target: fact.target, cost: 0,
    });
  }
  const live = (cells: number[]) => cells.every(c => state.cells[c] === null);
  for (const cells of boardCliques(puzzle)) {
    if (cells.length < 2 || !live(cells)) continue;
    const mask = maskOf(cells, words);
    // Only cliques that meet a fact can take part in a cancellation.
    if (!leaves.some(l => subset(mask, l.mask) || subset(l.mask, mask))) continue;
    leaves.push({
      expr: { eid: exprId(), kind: 'clique', cells: [...cells] },
      mask, cells, op: '<=', target: 1, cost: 1,
    });
  }
  return leaves;
}

// ── Elimination ─────────────────────────────────────────────────────────────────

interface Partial {
  mask: Mask;          // the cells still referenced, all with coefficient +1
  op: FactOp;
  target: number;
  positives: SignedLeaf[];
  negatives: SignedLeaf[];
  cost: number;        // operators and cliques so far
}

const sumExpr = (parts: SignedLeaf[]): HypExpr =>
  parts.slice(1).reduce<HypExpr>(
    (left, leaf) => ({ eid: exprId(), kind: 'add', left, right: leaf.expr }), parts[0].expr);

const exprFor = (partial: Partial): HypExpr =>
  partial.negatives.length === 0
    ? sumExpr(partial.positives)
    : { eid: exprId(), kind: 'sub', left: sumExpr(partial.positives), right: sumExpr(partial.negatives) };

/** How far this is from settling anything: zero means it forces. */
function distance(partial: Partial): number {
  const support = popcount(partial.mask);
  const toEmpty = hasUpper(partial.op) ? Math.abs(partial.target) : Infinity;
  const toFull = hasLower(partial.op) ? Math.abs(support - partial.target) : Infinity;
  return Math.min(toEmpty, toFull);
}

export interface SignedOptions extends SearchOptions {
  /** Partial combinations carried forward at each round. */
  beamWidth?: number;
}

/**
 * Combine facts by cancelling where they overlap, following the cells they share.
 *
 * Each round every partial combination is extended by the leaves that interact with it:
 * one sitting inside its support can be subtracted, which shrinks it, and a disjoint one
 * can be added, which grows it but may set up a later cancellation. Only the most
 * promising are carried forward, scored by how far they are from settling cells.
 */
export const signedMoves: MoveGenerator = (puzzle, state, options: SignedOptions = {}) => {
  const words = Math.ceil((puzzle.size * puzzle.size) / 32);
  const leaves = leavesOf(puzzle, state, words);
  const ceiling = options.maxStatementCost ?? 5;
  const beamWidth = options.beamWidth ?? 24;
  const before = state.cells.reduce((n, c) => n + (c === null ? 0 : 1), 0);

  // The cheapest way found to prove each forcing result.
  const forcing = new Map<string, { type: 'stars' | 'elims'; expr: HypExpr; cost: number }>();

  const record = (partial: Partial) => {
    // One signed combination weighed. The beam bounds this, which is the whole point of it.
    tally(options.probe, 'signed');
    const support = popcount(partial.mask);
    if (support === 0) return;
    const allElim = partial.target === 0 && hasUpper(partial.op);
    const allStar = partial.target === support && hasLower(partial.op);
    if (!allElim && !allStar) return;
    const type = allStar ? 'stars' : 'elims';
    const key = `${type}|${keyOf(partial.mask)}`;
    const expr = exprFor(partial);
    const cost = 1 + exprCost(expr);
    const seen = forcing.get(key);
    if (seen && seen.cost <= cost) return;
    forcing.set(key, { type, expr, cost });
  };

  let beam: Partial[] = leaves.map(leaf => ({
    mask: leaf.mask, op: leaf.op, target: leaf.target,
    positives: [leaf], negatives: [], cost: leaf.cost,
  }));
  for (const partial of beam) record(partial);

  const visited = new Set<string>();
  while (beam.length > 0) {
    const grown: Partial[] = [];
    for (const partial of beam) {
      for (const leaf of leaves) {
        const cost = partial.cost + 1 + leaf.cost;
        if (1 + cost > ceiling) continue;

        // Subtract: the leaf must sit inside what is left, and not overlap earlier ones.
        if (subset(leaf.mask, partial.mask)
          && partial.negatives.every(n => disjoint(n.mask, leaf.mask))
          && !partial.positives.includes(leaf)) {
          const upper = hasUpper(partial.op) && hasLower(leaf.op);
          const lower = hasLower(partial.op) && hasUpper(leaf.op);
          if (upper || lower) {
            grown.push({
              mask: combineWith(partial.mask, leaf.mask, (a, b) => a & ~b),
              op: upper && lower ? '=' : upper ? '<=' : '>=',
              target: partial.target - leaf.target,
              positives: partial.positives, negatives: [...partial.negatives, leaf], cost,
            });
          }
        }

        // Add: only whole facts, and only while nothing has been subtracted yet — the
        // legal shape is (sum of facts) minus (sum of facts inside them).
        if (leaf.expr.kind === 'ref' && partial.negatives.length === 0
          && disjoint(leaf.mask, partial.mask)) {
          grown.push({
            mask: combineWith(partial.mask, leaf.mask, (a, b) => a | b),
            op: sumOp(partial.op, leaf.op),
            target: partial.target + leaf.target,
            positives: [...partial.positives, leaf], negatives: [], cost,
          });
        }
      }
    }

    const fresh: Partial[] = [];
    for (const partial of grown) {
      const key = `${keyOf(partial.mask)}|${partial.op}${partial.target}|${partial.cost}`;
      if (visited.has(key)) continue;
      visited.add(key);
      record(partial);
      fresh.push(partial);
    }
    // Two things are worth carrying forward, and ranking by one loses the other. A
    // combination close to settling cells is the obvious one. The other is a combination
    // that has grown to enclose whole facts: summing facts always looks worse by distance,
    // since the support grows, yet enclosing three regions is exactly what lets three
    // subtractions cancel them. So half the beam goes to each.
    const byDistance = [...fresh].sort((a, b) =>
      distance(a) - distance(b) || popcount(a.mask) - popcount(b.mask) || a.cost - b.cost);
    const encloses = (partial: Partial) => leaves.reduce((n, leaf) =>
      n + (leaf.expr.kind === 'ref' && !partial.positives.includes(leaf) && subset(leaf.mask, partial.mask) ? 1 : 0), 0);
    const byPotential = fresh.length > beamWidth
      ? [...fresh].filter(p => p.negatives.length === 0)
        .map(p => ({ p, n: encloses(p) }))
        .sort((a, b) => b.n - a.n || a.p.cost - b.p.cost)
        .map(x => x.p)
      : [];
    const half = Math.ceil(beamWidth / 2);
    const picked = new Set<Partial>(byDistance.slice(0, beamWidth - Math.min(half, byPotential.length)));
    for (const partial of byPotential) {
      if (picked.size >= beamWidth) break;
      picked.add(partial);
    }
    beam = [...picked];
  }

  const moves: Move[] = [];
  for (const [signature, candidate] of forcing) {
    const block: Block = { id: `sg${++exprCounter}`, type: candidate.type, expr: candidate.expr };
    const step = applyStep(puzzle, state, block);
    if (step.status !== 'ok' || step.state.cells.reduce((n, c) => n + (c === null ? 0 : 1), 0) <= before) continue;
    moves.push({
      block, cost: candidate.cost, state: step.state, signature,
      reads: new Set<number>(), writes: new Set<number>(),
    });
  }
  return moves;
};
