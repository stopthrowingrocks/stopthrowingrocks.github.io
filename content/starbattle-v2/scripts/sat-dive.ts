/**
 * One DPLL dive, arithmetic-saturated at every level, stopping at the first contradiction.
 *
 * Shape of the proof it writes:
 *
 *   <root arithmetic>
 *   (suppose s1 (is-star E7)
 *     <arithmetic>
 *     (suppose s2 (is-star C3)
 *       <arithmetic>
 *       (claim (is-elim K11) (by-contradiction (body <arithmetic that contradicts>)))))
 *
 * Every decision but the last is a `suppose`: it records a conditional derivation and asserts
 * nothing, which is exactly a decision stack. The last decision is the one that dies, so it is
 * written as the inference it actually is — assuming `is-star K11` contradicts, therefore
 * `is-elim K11` — and that is proved inside the enclosing supposition rather than left as a
 * bare dead end.
 *
 * Why this is linear where the learning version was exponential: each level's body holds only
 * its own propagation plus the single block below it. Nothing embeds the subtree beneath it, so
 * a dive of depth 47 is 47 nested blocks rather than the 400,000 that learning at every level
 * cost. The price is that nothing is learned at top level — the dive refutes one assumption
 * chain, and the board outside keeps only what the root arithmetic proved.
 *
 * Arithmetic runs through `saturate` with `noCases`, not a hand-rolled loop. A loop that keeps
 * only cell-settling moves discards `split` and `define` — statements that settle nothing but
 * enable the next one — and then pays repeatedly for expensive generation that cannot progress.
 *
 *   npx tsx scripts/sat-dive.ts <index> [--max-ceiling N] [--max-depth N] [--time MS]
 *            [--polarity star|elim] [--out FILE] [--verbose]
 */
import { writeFileSync } from 'node:fs';
import { assume, evaluate, initState } from '../src/engine';
import { printProof } from '../src/proofText';
import { parseLevels, posLabel } from '../src/puzzles';
import { runProof } from '../src/agentTool';
import { proofCost } from '../src/search';
import { allStatements, saturate } from '../src/saturate';
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
if (!puzzle) { console.error('usage: sat-dive <index> [--max-ceiling N]'); process.exit(1); }

const maxCeiling = num('max-ceiling', 4);
const maxDepth = num('max-depth', 196);
const polarity: 'is_star' | 'is_elim' = str('polarity') === 'elim' ? 'is_elim' : 'is_star';
const deadline = Date.now() + num('time', 1800000);
const verbose = args.includes('--verbose');
const total = puzzle.size ** 2;

let nextId = 0;
const newId = () => `dive${nextId++}`;
const settled = (s: PState) => s.cells.reduce((n, c) => n + (c === null ? 0 : 1), 0);
const stats = { levels: 0, arithmeticRounds: 0, arithmeticMs: 0 };

/** Arithmetic to fixpoint, or until the board contradicts itself. */
function arithmetic(state: PState) {
  const at = Date.now();
  const run = saturate(puzzle, state, s => s.contradiction, { noCases: true, maxCeiling });
  stats.arithmeticMs += Date.now() - at;
  stats.arithmeticRounds++;
  return run;
}

/** How many ways k stars fit in n cells — the size of the disjunction being split. */
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return Infinity;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** The lowest-count disjunction's first free cell: the cheapest split available. */
function pick(state: PState): number | null {
  let best: { cell: number; ways: number } | null = null;
  for (const fact of state.facts) {
    const free = fact.cells.filter(cell => state.cells[cell] === null);
    if (!free.length) continue;
    const ways = choose(free.length, fact.target);
    if (!Number.isFinite(ways)) continue;
    if (!best || ways < best.ways) best = { cell: free[0], ways };
  }
  return best?.cell ?? null;
}

const flip = (kind: 'is_star' | 'is_elim') => (kind === 'is_star' ? 'is_elim' : 'is_star');

/**
 * Build this level and everything under it, or null if the dive cannot continue.
 *
 * Returns the single block that belongs at this level: a `claim` when the assumption dies
 * here, otherwise a `suppose` wrapping this level's arithmetic and the level below.
 */
function dive(state: PState, depth: number): Block | null {
  if (depth <= 0 || Date.now() > deadline) return null;
  const cell = pick(state);
  if (cell === null) return null;

  const pred: BoolExpr = { eid: newId(), kind: polarity, cell };
  const opened = assume(puzzle, state, pred);
  if ('error' in opened) return null;

  const under = arithmetic(opened.state);
  // Captured before recursing: the counter keeps rising underneath, so naming after the
  // recursion returns labels the outermost supposition with the depth of the deepest one.
  const level = ++stats.levels;
  const label = posLabel(cell, puzzle.size);

  if (under.state.contradiction) {
    // The bottom. Assuming `pred` contradicts, so its negation is proved here.
    const broken = under.state.facts.find(f => f.impossible);
    if (verbose) console.log(`  depth ${level}: ${label} ${polarity} contradicts — claiming the opposite`);
    return {
      id: newId(),
      type: 'claim',
      pred: { eid: newId(), kind: flip(polarity), cell },
      body: [{
        id: newId(),
        type: 'by_contradiction',
        body: under.blocks,
        // Omitted when the contradiction is in the cells and no hypothesis is impossible.
        contradiction: broken ? { eid: newId(), kind: 'ref', factId: broken.id } : null,
      }],
    };
  }

  if (verbose) {
    console.log(`  depth ${level}: suppose ${label} ${polarity}`
      + ` -> ${settled(under.state)}/${total} under it`);
  }
  const deeper = dive(under.state, depth - 1);
  if (!deeper) return null;
  return {
    id: newId(),
    type: 'suppose',
    name: `s${level}`,
    pred,
    body: [...under.blocks, deeper],
  };
}

// --- run ---------------------------------------------------------------------

const started = Date.now();
const root = arithmetic(initState(puzzle));
if (verbose) console.log(`root arithmetic: ${settled(root.state)}/${total} in ${stats.arithmeticMs}ms`);

const chain = dive(root.state, maxDepth);
const proof: Block[] = chain ? [...root.blocks, chain] : [...root.blocks];
const ms = Date.now() - started;

const text = printProof(proof, puzzle);
const check = runProof(puzzle, text);
const { final } = evaluate(puzzle, proof);

console.log(`\n${puzzle.name} #${puzzle.categoryIndex} — arithmetic-saturated dive, ceiling ${maxCeiling}`);
console.log(`  outcome    ${chain ? 'contradiction reached' : 'dive could not continue'}`);
console.log(`  depth      ${stats.levels} decision(s)`);
console.log(`  cells      ${check.cellsProven}/${total} at top level (the dive asserts nothing)`);
console.log(`  statements ${allStatements(proof).length} (${proof.length} top level), cost ${proofCost(proof)}`);
console.log(`  errors     ${check.errorCount}`);
console.log(`  arithmetic ${stats.arithmeticRounds} saturations, ${(stats.arithmeticMs / 1000).toFixed(1)}s of ${(ms / 1000).toFixed(1)}s`);
if (final.suppositions.length) {
  const s = final.suppositions[0];
  console.log(`  recorded   ${s.name}${s.contradiction ? ' (impossible)' : ''}`);
}

const out = str('out');
if (out) { writeFileSync(out, `${text}\n`, 'utf8'); console.log(`  written to ${out}`); }
