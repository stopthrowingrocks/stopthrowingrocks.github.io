import { applyStep, assume, isSolved } from './engine';
import {
  boardAdvancingMoves, forcedMoves, proofCost, splitMoves, statementCost, type Move, type SearchOptions,
} from './search';
import { signedMoves } from './signed';
import type { Block, BoolExpr, Fact, PState, Puzzle } from './types';

/**
 * Solving by saturation rather than by search.
 *
 * Every statement only adds knowledge, so when several are available there is nothing to
 * choose between them — applying them all is sound, and exploring the orderings is pure
 * waste. Measured on the old search, around 70% of the states it generated were ones it had
 * already reached by a different order.
 *
 * So the loop here is breadth-first over *cost*: sweep the whole board for statements
 * costing 1, apply every one that gains ground, and only when nothing at that price works
 * anywhere does the price go up. Any progress drops the price back to 1, because settling a
 * few cells usually re-enables the cheap moves. The ceiling stops being a parameter and
 * becomes the loop variable, and every statement in the result is the cheapest available
 * anywhere on the board at the moment it was used.
 *
 * Within a price, the tools are tried cheapest-to-run first: a bare fact that settles
 * itself, then signed elimination, then the exhaustive constructor, then decomposition.
 * The dear tools only run when the cheap ones see nothing, which is what makes them
 * affordable.
 */

export interface SaturateOptions extends SearchOptions {
  /** The dearest statement worth considering before giving up on arithmetic. */
  maxCeiling?: number;
  /** States to explore inside a case split before abandoning it. */
  caseCeiling?: number;
  /** Give up on case analysis entirely. */
  noCases?: boolean;
  timeLimitMs?: number;
  onProgress?: (note: string) => void;
}

const settled = (state: PState): number => state.cells.reduce((n, c) => n + (c === null ? 0 : 1), 0);
const factSignature = (fact: Fact): string => `${fact.op}${fact.target}:${fact.cells.join(',')}`;

/** Did this step teach us anything — a cell settled, or a hypothesis we did not hold? */
function gainsGround(before: PState, after: PState): boolean {
  if (settled(after) > settled(before)) return true;
  if (after.contradiction && !before.contradiction) return true;
  const had = new Set(before.facts.map(factSignature));
  return after.facts.some(fact => !had.has(factSignature(fact)));
}

/**
 * The statements available at exactly this price, from the cheapest tool that can see any.
 *
 * Order matters: a bare fact costs nothing to find, signed elimination is 37x faster than
 * the exhaustive constructor and finds nearly as much, and decomposition comes last because
 * it settles no cells — it pays off later by making other facts tractable.
 */
export function levelMoves(puzzle: Puzzle, state: PState, level: number, options: SaturateOptions): Move[] {
  const at = (moves: Move[]) => moves.filter(move => move.cost === level);

  if (level === 1) {
    const forced = at(forcedMoves(puzzle, state, options));
    if (forced.length > 0) return forced;
  }
  const signed = at(signedMoves(puzzle, state, { ...options, maxStatementCost: level }));
  if (signed.length > 0) return signed;

  const exhaustive = at(boardAdvancingMoves(puzzle, state, { ...options, maxStatementCost: level }));
  if (exhaustive.length > 0) return exhaustive;

  return at(splitMoves(puzzle, state, options));
}

export interface SaturateResult {
  blocks: Block[];
  state: PState;
  /** The price at which the board stopped yielding; undefined if the goal was reached. */
  stuckAt?: number;
}

/**
 * Sweep the board at rising prices until the goal is reached or nothing is left to try.
 */
export function saturate(
  puzzle: Puzzle,
  start: PState,
  goal: (state: PState) => boolean,
  options: SaturateOptions = {},
): SaturateResult {
  const maxCeiling = options.maxCeiling ?? 6;
  const deadline = Date.now() + (options.timeLimitMs ?? 300000);
  const blocks: Block[] = [];
  let state = start;
  let level = 1;

  while (!goal(state)) {
    if (Date.now() > deadline) break;
    let advanced = false;
    for (const move of levelMoves(puzzle, state, level, options).sort((a, b) => a.cost - b.cost)) {
      // Re-check: an earlier move in this sweep may have consumed what this one names.
      const step = applyStep(puzzle, state, move.block);
      if (step.status !== 'ok' || !gainsGround(state, step.state)) continue;
      blocks.push(move.block);
      state = step.state;
      advanced = true;
      options.onProgress?.(`${level}: ${move.block.type} (${settled(state)} settled)`);
      if (goal(state)) break;
    }
    if (advanced) {
      level = 1;              // cheap tools are worth another look now
    } else if (++level > maxCeiling) {
      return { blocks, state, stuckAt: maxCeiling };
    }
  }
  return { blocks, state };
}

// ── Pruning ─────────────────────────────────────────────────────────────────────

/** Rebuild a block with its nested bodies mapped. */
function mapBodies(block: Block, f: (body: Block[]) => Block[]): Block {
  switch (block.type) {
    case 'argument': case 'claim': case 'by_contradiction':
      return { ...block, body: f(block.body) };
    case 'constructor':
      return { ...block, left: f(block.left), right: f(block.right) };
    case 'by_cases':
      return { ...block, positive: f(block.positive), negative: f(block.negative) };
    default:
      return block;
  }
}

const without = (blocks: Block[], ids: Set<string>): Block[] =>
  blocks.filter(b => !ids.has(b.id)).map(b => mapBodies(b, body => without(body, ids)));

/** Every statement, nested ones included, in reading order. */
export function allStatements(blocks: Block[]): Block[] {
  const out: Block[] = [];
  const walk = (list: Block[]) => {
    for (const b of list) {
      out.push(b);
      mapBodies(b, body => { walk(body); return body; });
    }
  };
  walk(blocks);
  return out;
}

/**
 * Drop whatever the proof still holds without.
 *
 * Saturation applies every move it can see, so it leaves more behind than a person would:
 * later statements routinely subsume earlier ones, and a claim's body collects steps the
 * contradiction turned out not to need. Statements are dropped in shrinking groups rather
 * than one at a time, because a branch can be jointly removable while none of its parts is
 * removable alone — delta debugging, applied to a proof. Nested statements are included,
 * which is where most of the slack in a generated proof sits.
 */
export function prune(blocks: Block[], holds: (list: Block[]) => boolean): Block[] {
  if (!holds(blocks)) return blocks;
  let best = blocks;
  let size = Math.max(1, Math.floor(allStatements(best).length / 2));
  for (;;) {
    let dropped = false;
    const statements = allStatements(best);
    // Later first: a dead branch is usually kept alive by what follows it.
    for (let start = statements.length - size; start >= 0; start -= size) {
      const chunk = new Set(statements.slice(start, start + size).map(b => b.id));
      const candidate = without(best, chunk);
      if (candidate.length === 0 || !holds(candidate)) continue;
      best = candidate;
      dropped = true;
    }
    if (!dropped) {
      if (size === 1) return best;
      size = Math.max(1, Math.floor(size / 2));
    }
  }
}

// ── Case analysis ───────────────────────────────────────────────────────────────

const cellPred = (cell: number, kind: 'is_star' | 'is_elim'): BoolExpr => ({ eid: `c${cell}`, kind, cell });

/**
 * When arithmetic runs dry, argue about one cell: suppose it is the opposite of what we
 * want and saturate inside that supposition looking for a contradiction. The body is built
 * by the same rising-price sweep, so the first contradiction found is the cheapest one —
 * which matters, because a claim's cost is almost entirely its body.
 *
 * Cells are tried at a low price first and across the whole board before the price rises,
 * so an expensive argument is only attempted once every cheap one everywhere has failed.
 */
export function findCase(
  puzzle: Puzzle,
  state: PState,
  options: SaturateOptions,
  /**
   * The dearest argument already attempted for each cell and direction. A cell that
   * yielded nothing is not worth asking again at the same price — the board has moved on,
   * but not around that cell, or the sweep before this one would have settled it. Without
   * this the scan restarts from scratch after every success, which is where nearly all the
   * time went on a 14x14: 18s of arithmetic against 886s of re-asking dead cells.
   */
  attempted: Map<string, number> = new Map(),
): Move | null {
  const unresolved = state.cells
    .map((cell, index) => (cell === null ? index : -1))
    .filter(index => index >= 0);
  const deadline = Date.now() + (options.timeLimitMs ?? 300000);

  for (let ceiling = 1; ceiling <= (options.caseCeiling ?? 4); ceiling++) {
    let best: Move | null = null;
    for (const cell of unresolved) {
      if (Date.now() > deadline) return best;
      for (const kind of ['is_elim', 'is_star'] as const) {
        const asked = `${cell}|${kind}`;
        if ((attempted.get(asked) ?? 0) >= ceiling) continue;
        const pred = cellPred(cell, kind);
        const opened = assume(puzzle, state, { eid: `n${cell}`, kind: 'not', a: pred });
        if ('error' in opened) continue;

        const inner = saturate(puzzle, opened.state, s => s.contradiction,
          { ...options, maxCeiling: ceiling, noCases: true, timeLimitMs: 15000 });
        attempted.set(asked, ceiling);
        if (!inner.state.contradiction) continue;
        const broken = inner.state.facts.find(fact => fact.impossible);
        if (!broken) continue;

        const block: Block = {
          id: `case-${cell}-${kind}`,
          type: 'claim',
          pred,
          body: [{
            id: `case-bc-${cell}`,
            type: 'by_contradiction',
            body: inner.blocks,
            contradiction: { eid: `v${cell}`, kind: 'ref', factId: broken.id },
          }],
        };
        const step = applyStep(puzzle, state, block);
        if (step.status !== 'ok' || !gainsGround(state, step.state)) continue;
        const cost = statementCost(block);
        if (!best || cost < best.cost) {
          best = { block, cost, state: step.state, signature: `case|${cell}|${kind}`, reads: new Set(), writes: new Set() };
        }
      }
    }
    // Cheapest price that produced anything wins — no point looking dearer.
    if (best) return best;
  }
  return null;
}

export interface ProveResult {
  blocks: Block[];
  state: PState;
  solved: boolean;
  cost: number;
  ms: number;
}

/** Saturate, and when that stalls, argue about a cell — then saturate again. */
export function prove(puzzle: Puzzle, start: PState, options: SaturateOptions = {}): ProveResult {
  const started = Date.now();
  const deadline = started + (options.timeLimitMs ?? 600000);
  const blocks: Block[] = [];
  let state = start;
  // Shared across rounds: a cell that gave nothing is not asked again at the same price.
  const attempted = new Map<string, number>();

  for (;;) {
    const round = saturate(puzzle, state, isSolved, { ...options, timeLimitMs: deadline - Date.now() });
    blocks.push(...round.blocks);
    state = round.state;
    if (isSolved(state) || options.noCases || Date.now() > deadline) break;

    options.onProgress?.(`stuck at ${settled(state)} cells — looking for a case to argue`);
    const argued = findCase(puzzle, state,
      { ...options, timeLimitMs: Math.min(120000, deadline - Date.now()) }, attempted);
    if (!argued) break;
    const before = state;
    blocks.push(argued.block);
    state = argued.state;
    // An argument that settles cells changes what is provable around them, so dead cells
    // sharing a line or region with the new information are worth asking about again.
    const fresh = state.cells
      .map((cell, index) => (cell !== null && before.cells[index] === null ? index : -1))
      .filter(index => index >= 0);
    // Precisely where the information landed: the cells of hypotheses that changed, plus
    // the cells just settled. Invalidating a whole row and region instead clears nearly the
    // board, which throws the saving away.
    const had = new Set(before.facts.map(factSignature));
    const touched = new Set<number>(fresh);
    for (const fact of state.facts) {
      if (had.has(factSignature(fact))) continue;
      for (const cell of fact.cells) touched.add(cell);
    }
    for (const key of [...attempted.keys()]) {
      if (touched.has(Number(key.split('|')[0]))) attempted.delete(key);
    }
    options.onProgress?.(`argued a case for ${argued.cost}`);
  }
  return { blocks, state, solved: isSolved(state), cost: proofCost(blocks), ms: Date.now() - started };
}
