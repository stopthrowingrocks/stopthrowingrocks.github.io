/**
 * Learn pairwise exclusions by refutation, to feed the arithmetic something new.
 *
 * Signed elimination combines the facts it is given. On a hard board it stalls not because
 * it combines them badly but because the pool is thin: line and region counts, plus cliques,
 * which only exist where cells happen to be mutually adjacent. This manufactures more of the
 * useful kind. For a pair of cells that cannot both hold stars, `★{X Y} <= 1` is exactly a
 * clique bound — but justified by argument rather than by adjacency, so it reaches pairs that
 * are nowhere near each other.
 *
 * Only pairs sharing a line or a region are tried: a pair with no constraint connecting them
 * has nothing to derive a contradiction from. Adjacent pairs are skipped because `clique`
 * already states those for free.
 *
 *   npx tsx scripts/pair-exclusions.ts <index> <proofFile> [--stars "..."] [--slice i/n]
 *            [--time MS] [--nodes N] [--ceiling N] [--out FILE]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { assume, evaluate } from '../src/engine';
import { parseProof, printProof } from '../src/proofText';
import { cellLabelToIndex, parseLevels, posLabel } from '../src/puzzles';
import { boardAdvancingMoves, forcedMoves, search } from '../src/search';
import levelsData from '../src/levels.json';
import type { Block, BoolExpr, Puzzle, RawLevel } from '../src/types';

const args = process.argv.slice(2);
const str = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
};
const num = (name: string, fallback: number) => Number(str(name) ?? fallback);

const index = Number(args[0]);
const file = args[1];
const puzzle: Puzzle = parseLevels(levelsData as RawLevel[])[index];
if (!puzzle || !file) { console.error('usage: pair-exclusions <index> <proofFile>'); process.exit(1); }

const N = puzzle.size;
const blocks = parseProof(readFileSync(file, 'utf8'), puzzle);
const { final } = evaluate(puzzle, blocks);

/** Cells that share a row, a column, or a region — the only pairs worth asking about. */
const related = (a: number, b: number) =>
  Math.floor(a / N) === Math.floor(b / N) || a % N === b % N || puzzle.regions[a] === puzzle.regions[b];
const adjacent = (a: number, b: number) =>
  Math.abs(Math.floor(a / N) - Math.floor(b / N)) <= 1 && Math.abs((a % N) - (b % N)) <= 1;

// A known solution, when given, skips pairs that really are both stars: those can never be
// refuted, so asking burns the budget. Without it every related pair is tried.
const starsArg = str('stars');
const starCells = new Set((starsArg ?? '').trim().split(/[\s,]+/).filter(Boolean).map(label => {
  const c = cellLabelToIndex(label, N);
  if (c === null) throw new Error(`${label} is not a cell on this board`);
  return c;
}));

const open: number[] = [];
for (let c = 0; c < N * N; c++) if (final.cells[c] === null) open.push(c);

let pairs: Array<[number, number]> = [];
for (let i = 0; i < open.length; i++) {
  for (let j = i + 1; j < open.length; j++) {
    const [a, b] = [open[i], open[j]];
    if (adjacent(a, b) || !related(a, b)) continue;
    if (starCells.size && starCells.has(a) && starCells.has(b)) continue;
    pairs.push([a, b]);
  }
}
const slice = str('slice');
if (slice) {
  const [part, of] = slice.split('/').map(Number);
  pairs = pairs.filter((_, i) => i % of === part);
}

const ceiling = num('ceiling', 4);
const nodes = num('nodes', 120);
const timeLimitMs = num('time', 8000);
console.log(`${puzzle.name} #${puzzle.categoryIndex}: ${open.length} open cell(s), `
  + `asking ${pairs.length} related non-adjacent pair(s)${slice ? ` (slice ${slice})` : ''}\n`);

const found: Block[] = [];
for (const [a, b] of pairs) {
  const label = `${posLabel(a, N)}+${posLabel(b, N)}`;
  // "At most one of the two", whose negation is "both", which is what gets assumed.
  const pred: BoolExpr = {
    eid: `p${a}_${b}`, kind: 'cmp', op: '<=',
    a: { eid: `c${a}_${b}`, kind: 'count', cells: [a, b] },
    b: { eid: `l${a}_${b}`, kind: 'lit', value: 1 },
  };
  const opened = assume(puzzle, final, { eid: `n${a}_${b}`, kind: 'not', a: pred });
  if ('error' in opened) continue;

  const result = search(puzzle, opened.state, {
    goal: state => state.contradiction,
    generators: [forcedMoves, boardAdvancingMoves],
    maxStatementCost: ceiling,
    maxNodes: nodes,
    timeLimitMs,
  });
  if (!result.found) continue;

  const broken = result.best.facts.find(f => f.impossible);
  found.push({
    id: `pe-${a}-${b}`,
    type: 'claim',
    pred,
    body: [{
      id: `pe-bc-${a}-${b}`,
      type: 'by_contradiction',
      body: result.blocks,
      // A contradiction in the cells leaves nothing to name, which the engine now accepts.
      contradiction: broken ? { eid: `v${a}_${b}`, kind: 'ref', factId: broken.id } : null,
    }],
  });
  console.log(`${label.padEnd(10)} excluded in ${result.blocks.length} step(s)`);
}

console.log(`\n${found.length}/${pairs.length} pair(s) excluded`);
const out = str('out');
if (out && found.length) {
  writeFileSync(out, `${printProof(found, puzzle)}\n`, 'utf8');
  console.log(`written to ${out}`);
}
