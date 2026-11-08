import { applyStep, assume, isSolved } from './engine';
import {
  boardAdvancingMoves, forcedMoves, proofCost, splitMoves, statementCost, tally, newProbe, probeTotal,
  type Move, type SearchOptions,
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
  /**
   * Let an argument outbid arithmetic when it is the better buy per cell settled, rather
   * than waiting for arithmetic to exhaust its ceiling.
   *
   * Off by default, because measurement says it rarely wins. An argument is available at
   * body ceiling 1 on every board that stalls, and costs 3 against arithmetic's 4 to 6 — so
   * by statement cost it looks like the bargain. Per cell settled it is not: an argument
   * settles exactly one cell, while a dear arithmetic statement can settle several, which
   * comes to 3.00 per cell against 2.00. Arithmetic is the better buy at 31 of 36 stalls
   * where both can move, so exhausting it first is right about 86% of the time by accident.
   */
  bidCases?: boolean;
  timeLimitMs?: number;
  onProgress?: (note: string) => void;
  /**
   * Shuffle statements of equal price before applying them. Saturation is order-independent
   * in what it *proves*, but not in what it costs: whichever equally-priced move happens to
   * go first can make the others redundant. Varying the order measures how much of a reported
   * cost is the board and how much is the draw.
   */
  shuffleSeed?: number;
}

/** Order-16 LCG — enough to reshuffle a move list, small enough to be reproducible. */
function shuffled<T>(items: T[], seed: number): T[] {
  const out = items.slice();
  let x = (seed * 2654435761) >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    x = (x * 1664525 + 1013904223) >>> 0;
    const j = x % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
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
  /** The dearest price that ever bought progress — which tool the board forced us to reach for. */
  peakLevel: number;
  /** How many times a case had to be argued rather than derived. */
  cases: number;
}

/**
 * Case analysis carried across the sweep, so arguing can share the ladder with arithmetic.
 *
 * Arguing a cell is just another tool with a price: a claim costs one for itself, one for
 * the contradiction, and the body it needs. The cheapest possible one comes to about four,
 * which undercuts arithmetic at levels five and six — so running arithmetic to its ceiling
 * before arguing anything gets the order wrong, and measurably so.
 *
 * What is carried: which cells have been asked at which price, and the cheapest argument
 * found but not yet affordable. Both are useless without the other — the first stops dead
 * cells being re-asked, the second stops a found argument being thrown away and re-derived
 * at every level until it comes into budget.
 */
export interface CaseContext {
  attempted: Map<string, number>;
  pending: Move | null;
  argued: number;
}

export const newCaseContext = (): CaseContext => ({ attempted: new Map(), pending: null, argued: 0 });

/**
 * Sweep the board at rising prices until the goal is reached or nothing is left to try.
 */
export function saturate(
  puzzle: Puzzle,
  start: PState,
  goal: (state: PState) => boolean,
  options: SaturateOptions = {},
  /** Supply this to let arguing compete with arithmetic at each price. */
  cases: CaseContext | null = null,
): SaturateResult {
  const maxCeiling = options.maxCeiling ?? 6;
  const deadline = Date.now() + (options.timeLimitMs ?? 300000);
  const blocks: Block[] = [];
  let state = start;
  let level = 1;
  let peakLevel = 0;
  const argued0 = cases?.argued ?? 0;

  while (!goal(state)) {
    if (Date.now() > deadline) break;
    let advanced = false;
    const available = levelMoves(puzzle, state, level, options).sort((a, b) => a.cost - b.cost);
    const sweep = options.shuffleSeed === undefined
      ? available
      : shuffled(available, options.shuffleSeed + blocks.length + level);
    for (const move of sweep) {
      // Re-check: an earlier move in this sweep may have consumed what this one names.
      const step = applyStep(puzzle, state, move.block);
      if (step.status !== 'ok' || !gainsGround(state, step.state)) continue;
      blocks.push(move.block);
      state = step.state;
      advanced = true;
      peakLevel = Math.max(peakLevel, level);
      options.onProgress?.(`${level}: ${move.block.type} (${settled(state)} settled)`);
      if (goal(state)) break;
    }
    if (advanced) {
      level = 1;              // cheap tools are worth another look now
      continue;
    }

    // Arithmetic at this price is spent. An argument at this price may not be, and at the
    // dearer levels it is usually the better buy — so it is offered the same budget before
    // the price goes up, rather than waiting for arithmetic to exhaust its whole ceiling.
    const argument = cases && !options.noCases && options.bidCases
      ? winningCase(puzzle, state, level, maxCeiling, options, cases)
      : null;
    if (argument) {
      const step = applyStep(puzzle, state, argument.block);
      if (step.status === 'ok' && gainsGround(state, step.state)) {
        blocks.push(argument.block);
        forgetAround(state, step.state, cases!.attempted);
        state = step.state;
        cases!.pending = null;
        cases!.argued += 1;
        peakLevel = Math.max(peakLevel, level);
        options.onProgress?.(`${level}: argued a case for ${argument.cost} (${settled(state)} settled)`);
        level = 1;
        continue;
      }
      cases!.pending = null;
    }

    if (++level > maxCeiling) {
      // The ceiling is a budget for arithmetic, not a refusal to finish. An argument dearer
      // than any level is still worth having once nothing cheaper exists anywhere, so it is
      // taken at whatever it costs rather than abandoning a board we can actually prove.
      const last = cases && !options.noCases
        ? cases.pending ?? findCase(puzzle, state, { ...options, caseCeiling: options.caseCeiling ?? 4 }, cases.attempted)
        : null;
      if (!last) {
        return { blocks, state, stuckAt: maxCeiling, peakLevel, cases: (cases?.argued ?? 0) - argued0 };
      }
      const step = applyStep(puzzle, state, last.block);
      if (step.status !== 'ok' || !gainsGround(state, step.state)) {
        cases!.pending = null;
        return { blocks, state, stuckAt: maxCeiling, peakLevel, cases: (cases?.argued ?? 0) - argued0 };
      }
      blocks.push(last.block);
      forgetAround(state, step.state, cases!.attempted);
      state = step.state;
      cases!.pending = null;
      cases!.argued += 1;
      peakLevel = Math.max(peakLevel, level - 1);
      options.onProgress?.(`over ceiling: argued a case for ${last.cost} (${settled(state)} settled)`);
      level = 1;
    }
  }
  return { blocks, state, peakLevel, cases: (cases?.argued ?? 0) - argued0 };
}

/** What a move charges per cell it settles — the only basis on which two tools compare. */
function perCell(cost: number, before: PState, after: PState): number {
  const gain = settled(after) - settled(before);
  return gain > 0 ? cost / gain : Infinity;
}

/**
 * An argument, but only if it beats every arithmetic statement still unbought.
 *
 * Arithmetic that costs more per statement can still cost less per cell, so the two tools
 * are compared on cells settled. The arithmetic side is a genuine lookahead: it enumerates
 * the dearer levels that have not been swept yet. That is work the rising level would do
 * anyway, so it is not extra in the common case — but it is why this is off by default.
 *
 * An argument found but outbid is kept rather than discarded, so the same search is not
 * paid for once per level.
 */
function winningCase(
  puzzle: Puzzle,
  state: PState,
  level: number,
  maxCeiling: number,
  options: SaturateOptions,
  cases: CaseContext,
): Move | null {
  if (!cases.pending) {
    cases.pending = findCase(puzzle, state, { ...options, caseCeiling: level }, cases.attempted);
  }
  const argument = cases.pending;
  if (!argument) return null;
  const bid = perCell(argument.cost, state, argument.state);
  if (!Number.isFinite(bid)) return null;

  for (let dearer = level; dearer <= maxCeiling; dearer += 1) {
    for (const move of levelMoves(puzzle, state, dearer, options)) {
      const step = applyStep(puzzle, state, move.block);
      if (step.status !== 'ok') continue;
      if (perCell(move.cost, state, step.state) <= bid) return null;
    }
  }
  return argument;
}

/**
 * An argument that settles cells changes what is provable around them, so cells that gave
 * nothing before are worth asking about again — but only those the new information touched.
 * Clearing the whole map instead throws away the saving it exists for: on a 14x14 that was
 * 18s of arithmetic against 886s of re-asking cells that were still dead.
 */
function forgetAround(before: PState, after: PState, attempted: Map<string, number>): void {
  const settledNow = after.cells
    .map((cell, index) => (cell !== null && before.cells[index] === null ? index : -1))
    .filter(index => index >= 0);
  const had = new Set(before.facts.map(factSignature));
  const touched = new Set<number>(settledNow);
  for (const fact of after.facts) {
    if (had.has(factSignature(fact))) continue;
    for (const cell of fact.cells) touched.add(cell);
  }
  for (const key of [...attempted.keys()]) {
    if (touched.has(Number(key.split('|')[0]))) attempted.delete(key);
  }
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
        // Cells times hypotheses: what this tool charges to be searched, which has nothing
        // to do with the three its claim costs to write.
        tally(options.probe, 'contradiction', Math.max(1, opened.state.facts.length));

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
  /** Dearest arithmetic tool the board forced us to reach for, across every round. */
  peakLevel: number;
  /** How many times arithmetic ran dry and a case had to be argued. */
  cases: number;
  /**
   * Candidates examined to find the whole proof, by tool, and in total.
   *
   * This is the board's price in search rather than in prose. The two come apart badly: a
   * one-step argument is three statements to write and some 6,600 candidates to find, while
   * the arithmetic it competes with is dearer to write and about 900 to find.
   */
  work: number;
  workByTool: Record<string, number>;
}

/**
 * Prove the board, arguing cases where that is cheaper than deriving.
 *
 * There is no phase structure left: arithmetic and argument are two tools on one price
 * ladder, and the sweep buys whichever is cheaper at each stall. A board that yields to a
 * cost-4 argument no longer has to sit through the whole cost-6 arithmetic enumeration first.
 */
export function prove(puzzle: Puzzle, start: PState, options: SaturateOptions = {}): ProveResult {
  const started = Date.now();
  const cases = options.noCases ? null : newCaseContext();
  const probe = options.probe ?? newProbe();
  const run = saturate(puzzle, start, isSolved,
    { ...options, probe, timeLimitMs: options.timeLimitMs ?? 600000 }, cases);
  return {
    blocks: run.blocks,
    state: run.state,
    solved: isSolved(run.state),
    cost: proofCost(run.blocks),
    ms: Date.now() - started,
    peakLevel: run.peakLevel,
    cases: run.cases,
    work: probeTotal(probe),
    workByTool: Object.fromEntries(probe.tried),
  };
}
