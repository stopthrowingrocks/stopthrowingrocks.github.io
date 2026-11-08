/**
 * How much of a board's work figure is the board, and how much is the prover's luck?
 *
 *   npx tsx scripts/work-spread.ts <graded.json> [boards] [seeds]
 *
 * Work is claimed as the difficulty measure because it barely moves when equally-priced
 * moves are reordered. But an exhaustive sweep examines the same candidates whatever order
 * it walks them in, so that perturbation cannot move the count directly — it moves it only
 * by sending the proof down a different path. That is a weak lever, and a weak lever is a
 * bad basis for calling a measure stable.
 *
 * So this perturbs harder: as well as reordering moves, it shuffles the pool of hypotheses
 * and cliques that every tool enumerates from. The signed beam keeps only its best 24
 * partials, so changing what it sees first changes what it finds at all. A few boards across
 * the whole work range, many seeds each, and the spread reported per board rather than
 * averaged away.
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
const BOARDS = Number(process.argv[3] ?? 10);
const SEEDS = Number(process.argv[4] ?? 24);

const asPuzzle = (shape: string[], index: number): Puzzle =>
  parseLevels([{
    name: `corpus ${index}`, difficulty: 'corpus', stars: 1,
    size: shape.length, shapes: shape,
  } as RawLevel])[0];

/** A handful of boards spread evenly in log work, so every rung is represented. */
const ranked = entries.filter(e => e.work > 0).sort((a, b) => a.work - b.work);
const pool = ranked.length ? ranked : entries;
const picked = Array.from({ length: Math.min(BOARDS, pool.length) }, (_, i) =>
  pool[Math.floor((i * (pool.length - 1)) / Math.max(1, BOARDS - 1))]);

const ARMS = [
  { name: 'move order only', leaves: false },
  { name: 'pool shuffled too', leaves: true },
] as const;

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const sd = Math.sqrt(s.reduce((t, x) => t + (x - mean) ** 2, 0) / s.length);
  return {
    min: s[0], med: s[Math.floor(s.length / 2)], max: s[s.length - 1],
    ratio: s[0] ? s[s.length - 1] / s[0] : Infinity,
    cv: mean ? sd / mean : 0,
  };
};

console.log(`${picked.length} boards x ${SEEDS} seeds, two perturbations\n`);
const ratios = new Map<string, number[]>(ARMS.map(a => [a.name, []]));
const costRatios: number[] = [];

for (const entry of picked) {
  const puzzle = asPuzzle(entry.shape, entry.index);
  console.log(`#${entry.index + 1}  ${entry.band} (graded work ${entry.work})`);
  for (const arm of ARMS) {
    const works: number[] = [];
    const costs: number[] = [];
    // The band is read off the same runs: if it moves, the label is a draw too.
    const bands = new Set<string>();
    let unsolved = 0;
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const key = seed * 7919 + 1;
      const run = prove(puzzle, initState(puzzle), {
        shuffleSeed: key,
        shuffleLeaves: arm.leaves ? key : undefined,
        timeLimitMs: 30000,
      });
      if (!run.solved) { unsolved += 1; continue; }
      works.push(run.work);
      costs.push(run.cost);
      bands.add(run.cases > 1 ? 'several case splits' : run.cases === 1 ? 'one case split'
        : run.peakLevel >= 4 ? 'deep arithmetic' : run.peakLevel === 2 ? 'one-step arithmetic'
          : run.peakLevel === 3 ? 'compound arithmetic' : 'forced only');
    }
    if (!works.length) { console.log(`  ${arm.name.padEnd(18)} never finished`); continue; }
    const w = stats(works);
    const c = stats(costs);
    if (bands.size > 1) {
      console.log(`  ${arm.name.padEnd(18)} BAND NOT STABLE: ${[...bands].sort().join(' / ')}`);
    }
    ratios.get(arm.name)!.push(w.ratio);
    if (arm.leaves) costRatios.push(c.ratio);
    console.log(`  ${arm.name.padEnd(18)} work ${String(w.min).padStart(7)} / ` +
      `${String(w.med).padStart(7)} / ${String(w.max).padStart(7)}  ` +
      `max/min ${w.ratio.toFixed(2)}  cv ${(w.cv * 100).toFixed(0)}%` +
      `   cost ${c.min}/${c.med}/${c.max} (x${c.ratio.toFixed(2)})` +
      (unsolved ? `  [${unsolved} runs did not finish]` : ''));
  }
}

console.log('\nspread in work (max/min across seeds), over the sampled boards:');
for (const arm of ARMS) {
  const rs = ratios.get(arm.name)!;
  if (!rs.length) continue;
  const s = stats(rs);
  console.log(`  ${arm.name.padEnd(18)} median x${s.med.toFixed(2)}  worst x${s.max.toFixed(2)}`);
}
if (costRatios.length) {
  const s = stats(costRatios);
  console.log(`  cost, pool shuffled   median x${s.med.toFixed(2)}  worst x${s.max.toFixed(2)}`);
}
