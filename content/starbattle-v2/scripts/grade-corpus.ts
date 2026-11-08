/**
 * Grade layouts by how hard they are to *prove*, and pick a spread of difficulties.
 *
 *   npx tsx scripts/grade-corpus.ts <layouts.json> [--out graded.json] [--pick n] [--corpus out.json]
 *
 * CP-SAT settles a 5x5 and proves it unique in about a millisecond whatever the layout, so
 * solver time carries no signal at this size. Proof cost carries some, but it prices the
 * finished proof rather than the work of finding it, and it is noisy with it: shuffling the
 * order of equally-priced statements moves it on 89% of boards, by more than 10% on 64%.
 *
 * What a board really costs is the sifting. Checking every cell against every hypothesis for
 * a one-step contradiction is 25x15 on a 5x5 however short the claim that comes out, and
 * measured, an argument runs to some 6,600 candidates per cell settled against arithmetic's
 * 900. Counting candidates examined gives a measure that barely moves with the shuffle (9%,
 * and more than 10% on only 6%) and spans 58 to 69,000 across the pool.
 *
 * So difficulty is search work. The band — which rung of the tool ladder the board forced —
 * is kept as a label, and work turns out to order the bands monotonically, 58 / 621 / 1,929
 * / 6,392 / 16,664 / 69,188, so the two agree and work ranks finely inside each.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { initState, isSolved } from '../src/engine';
import { parseLevels } from '../src/puzzles';
import { prove } from '../src/saturate';
import type { Puzzle, RawLevel } from '../src/types';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at === -1 ? null : args[at + 1];
};
// Either a bare list of layouts, or a graded corpus this script wrote earlier.
const loaded: unknown[] = JSON.parse(readFileSync(args[0], 'utf8'));
const shapes: string[][] = loaded.map(entry =>
  Array.isArray(entry) ? entry as string[] : (entry as { shape: string[] }).shape);
const pick = Number(flag('--pick') ?? 0);
const runs = Number(flag('--runs') ?? 3);
const greedy = args.includes('--greedy');

const asPuzzle = (shape: string[], index: number): Puzzle =>
  parseLevels([{
    name: `corpus ${index}`, difficulty: 'corpus', stars: 1,
    size: shape.length, shapes: shape,
  } as RawLevel])[0];

/**
 * The rungs of the ladder, cheapest first. A board's band is the dearest rung it needed:
 * that is what a solver actually feels, and unlike cost it does not drift with luck.
 */
const BANDS = [
  'forced only',          // every move was a cell with nowhere else to go
  'one-step arithmetic',  // a single named fact eliminated something
  'compound arithmetic',  // two facts had to be combined
  'deep arithmetic',      // three or more, or a clique subtracted from a region
  'one case split',
  'several case splits',
] as const;

interface Graded {
  index: number;
  shape: string[];
  band: typeof BANDS[number];
  /** Candidates examined to find the proof: the difficulty measure. */
  work: number;
  /** max/min across the runs. 1.00 on arithmetic boards; up to 2 once cases are argued. */
  workSpread: number;
  /**
   * Median cost over the shuffled runs — what the proof costs to write, not to find.
   *
   * Unpruned, so it runs about 27% above the cost of the same proof with its redundant
   * statements delta-debugged out (see `prune`). It is a label here, not the ranking, so the
   * inflation is uniform and harmless; anything comparing proof lengths should prune first.
   */
  cost: number;
  /** How far the shuffle moved the cost, so a reader knows what the median is worth. */
  costSpread: number;
  steps: number;
  peakLevel: number;
  cases: number;
  /** Cells arithmetic alone settled, out of the board — how far you get before the wall. */
  arithmeticCells: number;
  cells: number;
  solved: boolean;
}

const bandOf = (peakLevel: number, cases: number): typeof BANDS[number] =>
  cases > 1 ? 'several case splits'
    : cases === 1 ? 'one case split'
      : peakLevel >= 4 ? 'deep arithmetic'
        : peakLevel === 3 ? 'compound arithmetic'
          : peakLevel === 2 ? 'one-step arithmetic'
            : 'forced only';

const graded: Graded[] = [];
const started = Date.now();

shapes.forEach((shape, index) => {
  const puzzle = asPuzzle(shape, index);
  // How far arithmetic alone gets, before asking whether a case is needed at all.
  const arithmetic = prove(puzzle, initState(puzzle), { noCases: true, greedy, timeLimitMs: 20000 });
  // Then the whole proof, several times over, each with a different order among equals.
  // The pool is shuffled as well as the move order. Reordering moves alone cannot move the
  // work figure at all on an arithmetic-only board — an exhaustive sweep examines the same
  // candidates whatever order it walks them in — so a median over that perturbation would be
  // a median over identical numbers. Shuffling the hypothesis and clique pool reaches the
  // signed beam and the case finder, which is where work actually varies: nothing below
  // `deep arithmetic` moves at all, while a case-split board can swing by 2x.
  const attempts = Array.from({ length: runs }, (_, seed) =>
    prove(puzzle, initState(puzzle), {
      shuffleSeed: seed * 7919 + 1,
      shuffleLeaves: seed * 7919 + 1,
      greedy,
      timeLimitMs: 30000,
    }));
  const done = attempts.filter(a => isSolved(a.state));
  const best = done.length ? done : attempts;
  const costs = best.map(a => a.cost).sort((a, b) => a - b);
  const works = best.map(a => a.work).sort((a, b) => a - b);
  // The band is read off the run that needed the least, so a board is credited with the
  // easiest route anyone found rather than the unluckiest.
  const easiest = best.reduce((a, b) =>
    (b.cases - a.cases || b.peakLevel - a.peakLevel) < 0 ? b : a);
  graded.push({
    index, shape,
    band: bandOf(easiest.peakLevel, easiest.cases),
    work: works[Math.floor(works.length / 2)],
    workSpread: works[0] ? works[works.length - 1] / works[0] : 1,
    cost: costs[Math.floor(costs.length / 2)],
    costSpread: costs[costs.length - 1] - costs[0],
    steps: easiest.blocks.length,
    peakLevel: easiest.peakLevel,
    cases: easiest.cases,
    arithmeticCells: arithmetic.state.cells.filter(c => c !== null).length,
    cells: puzzle.size * puzzle.size,
    solved: done.length > 0,
  });
});

const solved = graded.filter(g => g.solved);
console.log(`${shapes.length} layouts graded in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`  proved: ${solved.length}/${shapes.length}\n`);

const inBand = (band: string) => solved.filter(g => g.band === band);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

console.log('band                    count   work (min/median/max)          cost');
for (const band of BANDS) {
  const members = inBand(band);
  if (!members.length) {
    console.log(`  ${band.padEnd(22)} ${String(0).padStart(4)}`);
    continue;
  }
  const works = members.map(g => g.work).sort((a, b) => a - b);
  console.log(`  ${band.padEnd(22)} ${String(members.length).padStart(4)}   ` +
    `${String(works[0]).padStart(6)} / ${String(median(works)).padStart(6)} / ` +
    `${String(works[works.length - 1]).padStart(7)}    ` +
    `${String(median(members.map(g => g.cost))).padStart(4)}`);
}

// Work is meant to rank boards where cost only labelled them, so it has to separate the
// bands that cost ran together.
const populated = BANDS.map(inBand).filter(m => m.length);
console.log('\nseparation between neighbouring bands:');
for (let i = 1; i < populated.length; i += 1) {
  const [below, above] = [populated[i - 1], populated[i]];
  const gap = median(above.map(g => g.work)) / median(below.map(g => g.work));
  const costGap = median(above.map(g => g.cost)) - median(below.map(g => g.cost));
  console.log(`  ${below[0].band.padEnd(22)} -> ${above[0].band.padEnd(22)}  ` +
    `work x${gap.toFixed(1)}   cost ${costGap >= 0 ? '+' : ''}${costGap}`);
}

if (pick) {
  /*
   * Work is one monotone scale from 58 to 69,000, so a spread of difficulties is a spread
   * along it rather than a quota per band. It is spread in *log* work: the bands sit at
   * roughly constant multiples of each other, so equal linear steps would put almost every
   * pick among the hardest boards and none between 58 and 600.
   */
  const ranked = [...solved].sort((a, b) => a.work - b.work);
  const low = Math.log(ranked[0].work);
  const high = Math.log(ranked[ranked.length - 1].work);
  const chosen: Graded[] = [];
  for (let i = 0; i < pick; i += 1) {
    const target = low + ((high - low) * i) / Math.max(1, pick - 1);
    // Nearest board in log work that has not already been taken.
    let bestAt = -1;
    let bestGap = Infinity;
    for (let j = 0; j < ranked.length; j += 1) {
      if (chosen.includes(ranked[j])) continue;
      const gap = Math.abs(Math.log(ranked[j].work) - target);
      if (gap < bestGap) { bestGap = gap; bestAt = j; }
    }
    if (bestAt >= 0) chosen.push(ranked[bestAt]);
  }
  const unique = chosen.sort((a, b) => a.work - b.work);
  console.log(`\npicked ${unique.length}, spread evenly in log search work:`);
  for (const g of unique) {
    console.log(`  #${String(g.index + 1).padStart(4)}  work ${String(g.work).padStart(7)}` +
      `${g.workSpread > 1.01 ? ` x${g.workSpread.toFixed(2)}` : '      '}  ` +
      `cost ${String(g.cost).padStart(3)}  ${g.band.padEnd(20)}` +
      (g.cases ? `  arithmetic stalls at ${g.arithmeticCells}/${g.cells}` : ''));
  }
  const spread = new Map<string, number>();
  for (const g of unique) spread.set(g.band, (spread.get(g.band) ?? 0) + 1);
  console.log(`  bands represented: ${[...spread].map(([b, n]) => `${b} ${n}`).join(', ')}`);
  const out = flag('--corpus');
  if (out) {
    // Written with the grades attached: a bare list of regions would lose the only thing
    // that makes this a corpus rather than a pile of layouts.
    writeFileSync(out, `${JSON.stringify(unique.map(g => ({
      shape: g.shape, band: g.band, work: g.work, workSpread: Number(g.workSpread.toFixed(2)),
      cost: g.cost, costSpread: g.costSpread,
      peakLevel: g.peakLevel, cases: g.cases, arithmeticCells: g.arithmeticCells,
    })), null, 1)}\n`, 'utf8');
    console.log(`\nwrote ${unique.length} graded layouts to ${out}`);
  }
}

const outAt = flag('--out');
if (outAt) {
  writeFileSync(outAt, JSON.stringify(graded, null, 1), 'utf8');
  console.log(`\nwrote ${graded.length} graded layouts to ${outAt}`);
}
