/**
 * How much of the difficulty scale is the board, and how much is the beam width?
 *
 *   npx tsx scripts/beam-sweep.ts <graded.json> [boards]
 *
 * Signed elimination carries forward only its best `beamWidth` partial combinations, set to
 * 24 when it was written and never tuned — it was checked end to end (97 of 98 statements
 * reproduced, 37x faster than the exhaustive constructor) and left there. But the beam bounds
 * the class the tool sifts, so it bounds the work figure that difficulty is now measured in.
 * If the scale moves with the width, the scale is partly an artefact of the width.
 */
import { readFileSync } from 'node:fs';
import { initState } from '../src/engine';
import { parseLevels } from '../src/puzzles';
import { prove } from '../src/saturate';
import type { Puzzle, RawLevel } from '../src/types';

const loaded: unknown[] = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const entries = loaded.map((e, index) => (Array.isArray(e)
  ? { shape: e as string[], band: '?', work: 0, index }
  : { ...(e as { shape: string[]; band: string; work: number }), index }));
const BOARDS = Number(process.argv[3] ?? 24);
const WIDTHS = [6, 12, 24, 48, 96];

const asPuzzle = (shape: string[], index: number): Puzzle =>
  parseLevels([{
    name: `corpus ${index}`, difficulty: 'corpus', stars: 1,
    size: shape.length, shapes: shape,
  } as RawLevel])[0];

const ranked = entries.filter(e => e.work > 0).sort((a, b) => a.work - b.work);
const pool = ranked.length ? ranked : entries;
const picked = Array.from({ length: Math.min(BOARDS, pool.length) }, (_, i) =>
  pool[Math.floor((i * (pool.length - 1)) / Math.max(1, BOARDS - 1))]);

interface Row { solved: number; work: number[]; cost: number[]; ms: number }
const rows = new Map<number, Row>(WIDTHS.map(w => [w, { solved: 0, work: [], cost: [], ms: 0 }]));
// Per board, so the question "does the ranking survive" can be asked, not just the totals.
const perBoard = new Map<number, Map<number, number>>();

for (const entry of picked) {
  const puzzle = asPuzzle(entry.shape, entry.index);
  const here = new Map<number, number>();
  for (const width of WIDTHS) {
    const run = prove(puzzle, initState(puzzle), { beamWidth: width, timeLimitMs: 60000 });
    const row = rows.get(width)!;
    row.ms += run.ms;
    if (!run.solved) continue;
    row.solved += 1;
    row.work.push(run.work);
    row.cost.push(run.cost);
    here.set(width, run.work);
  }
  perBoard.set(entry.index, here);
}

const med = (xs: number[]) => (xs.length
  ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

console.log(`${picked.length} boards spread across the work range\n`);
console.log('beam   solved   median work   median cost   total time');
for (const width of WIDTHS) {
  const row = rows.get(width)!;
  console.log(`  ${String(width).padStart(3)}  ${String(row.solved).padStart(4)}/${picked.length}   ` +
    `${String(med(row.work)).padStart(9)}     ${String(med(row.cost)).padStart(7)}      ` +
    `${(row.ms / 1000).toFixed(1).padStart(6)}s`);
}

// The scale may shift wholesale and still rank boards identically, which is all a difficulty
// measure needs. Spearman against the width-24 ordering answers that.
const base = 24;
const common = picked.filter(e => {
  const h = perBoard.get(e.index)!;
  return WIDTHS.every(w => h.has(w));
});
console.log(`\nranking against beam ${base}, over the ${common.length} boards every width finished:`);
const rank = (width: number) => {
  const order = [...common].sort((a, b) =>
    perBoard.get(a.index)!.get(width)! - perBoard.get(b.index)!.get(width)!);
  return new Map(order.map((e, i) => [e.index, i]));
};
const baseRank = rank(base);
for (const width of WIDTHS) {
  if (width === base) continue;
  const r = rank(width);
  const n = common.length;
  const d2 = common.reduce((t, e) => t + (baseRank.get(e.index)! - r.get(e.index)!) ** 2, 0);
  const rho = 1 - (6 * d2) / (n * (n * n - 1));
  const scale = med(rows.get(width)!.work) / Math.max(1, med(rows.get(base)!.work));
  console.log(`  beam ${String(width).padStart(3)}: rank correlation ${rho.toFixed(3)}, ` +
    `work scaled x${scale.toFixed(2)}`);
}
