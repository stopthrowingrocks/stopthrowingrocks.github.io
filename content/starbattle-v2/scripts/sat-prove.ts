/**
 * DPLL on a Star Battle board, with every inference written out as a proof statement.
 *
 * The mapping is close to exact, which is why this is worth doing at all:
 *
 *   unit propagation   a fact whose free cells equal its target forces stars; a fact whose
 *                      target has fallen to 0 forces eliminations. Assigning a cell also
 *                      eliminates its neighbours and `normalize` folds it out of every fact,
 *                      so one assignment cascades exactly as unit propagation does.
 *   conflict           `state.contradiction` — a count driven out of range, or a star forced
 *                      onto a crossed-out cell.
 *   learned unit       `(claim (is-elim X) (by-contradiction (body <the propagation trace>)))`.
 *                      The body *is* the conflict derivation, so the proof carries its own
 *                      justification rather than a solver's word for it.
 *   decision level     recursion depth. A branch that conflicts becomes a learned unit at the
 *                      level above, which is assumed and propagated — failed-literal
 *                      detection, applied recursively.
 *
 * It is deliberately blind: no solution is supplied and both polarities of a literal are
 * tried, so nothing here depends on knowing the answer.
 *
 * The point of comparison is the propagation operator, and only that:
 *   plain          `forcedMoves` alone — unit propagation, nothing else
 *   --arithmetic   `levelMoves` at rising prices, which adds signed elimination, subsum and
 *                  clique/split pigeonhole. Inferences a clause solver cannot make at all
 *                  without the counting structure being re-encoded.
 *
 *   npx tsx scripts/sat-prove.ts <index> [--arithmetic] [--depth N] [--branch-width N]
 *            [--max-ceiling N] [--time MS] [--out FILE] [--verbose]
 */
import { writeFileSync } from 'node:fs';
import { applyStep, assume, evaluate, initState, isSolved } from '../src/engine';
import { printProof } from '../src/proofText';
import { parseLevels, posLabel } from '../src/puzzles';
import { runProof } from '../src/agentTool';
import { forcedMoves, proofCost } from '../src/search';
import { levelMoves, allStatements } from '../src/saturate';
import levelsData from '../src/levels.json';
import type { Block, BoolExpr, PState, Puzzle, RawLevel } from '../src/types';

const args = process.argv.slice(2);
const str = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
};
const num = (name: string, fallback: number) => Number(str(name) ?? fallback);

const index = Number(args[0]);
const puzzle: Puzzle = parseLevels(levelsData as RawLevel[])[index];
if (!puzzle) { console.error('usage: sat-prove <index> [--arithmetic] [--depth N]'); process.exit(1); }

const arithmetic = args.includes('--arithmetic');
const maxDepth = num('depth', 2);
const branchWidth = num('branch-width', 24);
const maxCeiling = num('max-ceiling', 6);
const deadline = Date.now() + num('time', 900000);
const verbose = args.includes('--verbose');
const total = puzzle.size ** 2;

const stats = { propagations: 0, decisions: 0, conflicts: 0, learned: 0, deepest: 0, abandoned: 0 };

/*
 * A budget on the proof term, not on the search.
 *
 * A learned unit has to carry the derivation that justifies it, so a unit learned at one
 * level embeds the whole trace of the level below, whose own units embed the level below
 * that. Search cost grows linearly with depth; the written proof grows exponentially. An
 * uncapped dive on a 14x14 reaches depth 47 happily and then exhausts a 4GB heap building
 * the term for it. This is the one real asymmetry with a clause solver, which may discard a
 * conflict derivation once the clause is learned.
 */
const maxTermBlocks = num('max-term', 200000);
let termBlocks = 0;
const settled = (s: PState) => s.cells.reduce((n, c) => n + (c === null ? 0 : 1), 0);
let nextId = 0;
const newId = () => `sat${nextId++}`;

const cellPred = (cell: number, kind: 'is_star' | 'is_elim'): BoolExpr =>
  ({ eid: newId(), kind, cell });
const negate = (pred: BoolExpr): BoolExpr => ({ eid: newId(), kind: 'not', a: pred });

interface Trace { blocks: Block[]; state: PState }

/**
 * Run inference to fixpoint. Without `--arithmetic` this is unit propagation and nothing
 * else; with it, the price ladder from `levelMoves` is walked, which is where the counting
 * arguments live. Returns as soon as a conflict appears — there is nothing to learn past it.
 */
function propagate(state: PState, ceiling: number): Trace {
  const blocks: Block[] = [];
  let cur = state;
  let level = 1;
  for (;;) {
    if (cur.contradiction || Date.now() > deadline) return { blocks, state: cur };
    stats.propagations++;
    // Ceiling 0 means unit propagation only — no counting arguments at all.
    const moves = ceiling > 0
      ? levelMoves(puzzle, cur, level, { maxCeiling: ceiling })
      : forcedMoves(puzzle, cur, {});
    let advanced = false;
    for (const move of moves) {
      const step = applyStep(puzzle, cur, move.block);
      if (step.status !== 'ok') continue;
      if (!step.state.contradiction && settled(step.state) <= settled(cur)) continue;
      blocks.push(move.block);
      cur = step.state;
      advanced = true;
      if (cur.contradiction) return { blocks, state: cur };
    }
    if (advanced) { level = 1; continue; }
    if (ceiling <= 0 || level >= ceiling) return { blocks, state: cur };
    level++;
  }
}

/*
 * Two ceilings, because one is what made the first run meaningless.
 *
 * A clause solver propagates cheaply at every node and spends its expensive reasoning
 * sparingly. Calling the full counting ladder inside every branch instead costs some ten
 * thousand times a unit round, which is why the arithmetic arm first timed out in
 * propagation at depth 2 without ever reaching the deeper search it was supposed to measure.
 */
const rootCeiling = arithmetic ? maxCeiling : 0;
const bodyCeiling = arithmetic ? num('body-ceiling', 2) : 0;
/*
 * Two widths. The root scans for any refutable cell, so it wants to look everywhere;
 * a dive wants one cell per level, since its job is depth. Running the root at the dive
 * width meant it tried a single cell and gave up, which is why a search reaching depth 47
 * and 55,082 conflicts still settled nothing.
 */
const rootWidth = num('root-width', 196);

/** How many ways `k` stars can sit among `n` cells — the size of the disjunction. */
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return Infinity;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/**
 * Branch order: the lowest-count disjunction first.
 *
 * A clause solver branches on the shortest clause, and the counting analogue is the fact with
 * the fewest ways left to satisfy it. A fact with n free cells and target t is satisfiable
 * C(n,t) ways — three stars among four cells admits four arrangements, three among fourteen
 * admits 364 — so that count, not the raw cell total, is what makes a split cheap or dear.
 *
 * Ranking cells by the slack of the tightest fact containing them, which is what this did
 * first, is a different and worse thing: it discards which disjunction a cell belongs to, so
 * it cannot prefer splitting a nearly-decided line over a wide-open one of the same slack.
 */
function candidates(state: PState, width: number): number[] {
  const ranked = state.facts
    .map(fact => {
      const free = fact.cells.filter(cell => state.cells[cell] === null);
      return { free, ways: choose(free.length, fact.target) };
    })
    .filter(entry => entry.free.length > 0 && Number.isFinite(entry.ways))
    .sort((a, b) => a.ways - b.ways || a.free.length - b.free.length);

  const out: number[] = [];
  const seen = new Set<number>();
  for (const { free } of ranked) {
    for (const cell of free) {
      if (seen.has(cell)) continue;
      seen.add(cell);
      out.push(cell);
      if (out.length >= width) return out;
    }
  }
  return out;
}

/** A learned unit clause, carrying the conflict derivation that justifies it. */
function learnedUnit(pred: BoolExpr, conflict: Trace): Block {
  termBlocks += conflict.blocks.length + 2;
  const broken = conflict.state.facts.find(f => f.impossible);
  return {
    id: newId(),
    type: 'claim',
    pred,
    body: [{
      id: newId(),
      type: 'by_contradiction',
      body: conflict.blocks,
      // A conflict in the cells leaves no hypothesis to name, which is legal now.
      contradiction: broken ? { eid: newId(), kind: 'ref', factId: broken.id } : null,
    }],
  };
}

/**
 * Try to drive `state` to a conflict, branching up to `depth` levels.
 *
 * Each level does the same thing a DPLL level does: propagate, pick a literal, and if
 * assuming one polarity conflicts, assert the other and carry on. The difference is only
 * that asserting it writes a statement.
 */
function refute(state: PState, depth: number): Trace | null {
  const first = propagate(state, bodyCeiling);
  if (first.state.contradiction) { stats.conflicts++; return first; }
  if (depth <= 0 || Date.now() > deadline) return null;
  if (termBlocks > maxTermBlocks) { stats.abandoned++; return null; }
  stats.deepest = Math.max(stats.deepest, maxDepth - depth + 1);

  const blocks = [...first.blocks];
  let cur = first.state;
  /*
   * Keep learning at this level until it conflicts or runs dry, re-choosing the branch cell
   * after every unit — the board has moved, so the tightest disjunction has usually moved too.
   *
   * Taking one pass over a candidate list fixed in advance is what made the uncapped dive
   * useless: at width 1 a level could learn a single unit and then had nothing left to try,
   * so 44,715 units learned at depth reached the top as none. One unit rarely contradicts
   * anything by itself; it is the accumulation that does.
   */
  for (;;) {
    let learnedHere = false;
    for (const cell of candidates(cur, branchWidth)) {
      for (const kind of ['is_elim', 'is_star'] as const) {
        if (Date.now() > deadline) return null;
        if (cur.cells[cell] !== null) continue;
        const pred = cellPred(cell, kind);
        const opened = assume(puzzle, cur, negate(pred));
        if ('error' in opened) continue;
        stats.decisions++;
        const sub = refute(opened.state, depth - 1);
        if (!sub) continue;

        const unit = learnedUnit(pred, sub);
        const step = applyStep(puzzle, cur, unit);
        if (step.status !== 'ok') continue;
        stats.learned++;
        blocks.push(unit);
        cur = step.state;
        const after = propagate(cur, bodyCeiling);
        blocks.push(...after.blocks);
        cur = after.state;
        if (cur.contradiction) return { blocks, state: cur };
        learnedHere = true;
        break;
      }
      if (learnedHere) break;
    }
    if (!learnedHere) return null;
  }
}

// --- top level ---------------------------------------------------------------

const started = Date.now();
const proof: Block[] = [];
let state = initState(puzzle);

const opening = propagate(state, rootCeiling);
proof.push(...opening.blocks);
state = opening.state;
if (verbose) console.log(`propagation alone: ${settled(state)}/${total}`);

while (!isSolved(state) && Date.now() < deadline) {
  let progressed = false;
  for (const cell of candidates(state, rootWidth)) {
    for (const kind of ['is_elim', 'is_star'] as const) {
      if (state.cells[cell] !== null || Date.now() > deadline) continue;
      const pred = cellPred(cell, kind);
      const opened = assume(puzzle, state, negate(pred));
      if ('error' in opened) continue;
      stats.decisions++;
      const sub = refute(opened.state, maxDepth - 1);
      if (!sub) continue;

      const unit = learnedUnit(pred, sub);
      const step = applyStep(puzzle, state, unit);
      if (step.status !== 'ok') continue;
      stats.learned++;
      proof.push(unit);
      state = step.state;
      const after = propagate(state, rootCeiling);
      proof.push(...after.blocks);
      state = after.state;
      progressed = true;
      if (verbose) {
        console.log(`learned ${posLabel(cell, puzzle.size)} ${kind === 'is_elim' ? 'elim' : 'star'}`
          + ` -> ${settled(state)}/${total}`);
      }
      break;
    }
    if (progressed) break;
  }
  if (!progressed) break;
}

const ms = Date.now() - started;
const text = printProof(proof, puzzle);
const check = runProof(puzzle, text);
const { final } = evaluate(puzzle, proof);

console.log(`\n${puzzle.name} #${puzzle.categoryIndex} — ${arithmetic ? 'SAT + arithmetic' : 'plain SAT'}`
  + `, depth ${maxDepth}, branch width ${branchWidth}`);
console.log(`  cells      ${check.cellsProven}/${total}${check.solved ? '  SOLVED' : ''}`);
console.log(`  statements ${allStatements(proof).length} (${proof.length} top level), cost ${proofCost(proof)}`);
console.log(`  errors     ${check.errorCount}`);
console.log(`  decisions  ${stats.decisions}, conflicts ${stats.conflicts}, learned ${stats.learned}`);
console.log(`  propagate  ${stats.propagations} rounds, deepest level ${stats.deepest}`);
console.log(`  term       ${termBlocks} blocks built, ${stats.abandoned} branch(es) abandoned on budget`);
console.log(`  time       ${(ms / 1000).toFixed(1)}s`);
if (final.contradiction) console.log('  WARNING: the top-level state is contradictory');

const out = str('out');
if (out) { writeFileSync(out, `${text}\n`, 'utf8'); console.log(`  written to ${out}`); }
