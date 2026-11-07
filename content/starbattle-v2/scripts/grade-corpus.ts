/**
 * Grade layouts by how hard they are to *prove*, and pick a spread of difficulties.
 *
 *   npx tsx scripts/grade-corpus.ts <layouts.json> [--out graded.json] [--pick n] [--corpus out.json]
 *
 * CP-SAT settles a 5x5 and proves it unique in about a millisecond whatever the layout, so
 * solver time carries no signal at this size. Proof cost carries plenty, but it is a noisy
 * ruler. Shuffling the order of equally-priced statements moves the reported cost on 92% of
 * boards, by a median of 2 and as much as 22 — whichever equal move goes first can make the
 * others redundant. Over the same boards the rung of the ladder never moved at all.
 *
 * So the band is the ladder — which tool the board forced us to reach for — and cost only
 * separates boards inside a band, taken as a median over several shuffled runs so that the
 * ordering is not an artefact of one lucky draw.
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
  /** Median cost over the shuffled runs — the one worth comparing between boards. */
  cost: number;
  /** How far the shuffle moved it, so a reader knows what the median is worth. */
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
  const arithmetic = prove(puzzle, initState(puzzle), { noCases: true, timeLimitMs: 20000 });
  // Then the whole proof, several times over, each with a different order among equals.
  const attempts = Array.from({ length: runs }, (_, seed) =>
    prove(puzzle, initState(puzzle), { shuffleSeed: seed * 7919 + 1, timeLimitMs: 30000 }));
  const done = attempts.filter(a => isSolved(a.state));
  const best = done.length ? done : attempts;
  const costs = best.map(a => a.cost).sort((a, b) => a - b);
  // The band is read off the run that needed the least, so a board is credited with the
  // easiest route anyone found rather than the unluckiest.
  const easiest = best.reduce((a, b) =>
    (b.cases - a.cases || b.peakLevel - a.peakLevel) < 0 ? b : a);
  graded.push({
    index, shape,
    band: bandOf(easiest.peakLevel, easiest.cases),
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
console.log('band                    count   cost (min/median/max)');
for (const band of BANDS) {
  const members = inBand(band);
  if (!members.length) {
    console.log(`  ${band.padEnd(22)} ${String(0).padStart(4)}`);
    continue;
  }
  const costs = members.map(g => g.cost).sort((a, b) => a - b);
  console.log(`  ${band.padEnd(22)} ${String(members.length).padStart(4)}   ` +
    `${costs[0]} / ${costs[Math.floor(costs.length / 2)]} / ${costs[costs.length - 1]}`);
}

// Does the ladder actually order the boards, or is it just relabelling cost?
const overlap = BANDS.map(inBand).filter(m => m.length);
console.log('\ncost overlap between neighbouring bands:');
for (let i = 1; i < overlap.length; i += 1) {
  const below = Math.max(...overlap[i - 1].map(g => g.cost));
  const above = Math.min(...overlap[i].map(g => g.cost));
  console.log(`  ${overlap[i - 1][0].band} tops out at ${below}; ` +
    `${overlap[i][0].band} starts at ${above}` +
    (above > below ? '  (clean break)' : `  (overlapping by ${below - above + 1})`));
}

if (pick) {
  // A spread means equal weight per band, not per layout: the easy bands are crowded, and
  // sampling the pool as it comes would bury the interesting boards.
  //
  // Within a band the second axis differs. For the arithmetic bands it is cost — how long
  // the grind runs. For the case-split bands cost is a poor guide (it overlaps the
  // arithmetic bands by nearly 30), and what separates them is where arithmetic died:
  // a board that stalls at 3 of 25 cells demands far more of the case than one that stalls
  // at 17, and the wall position runs at -0.58 against cost.
  const perBand = Math.ceil(pick / BANDS.filter(b => inBand(b).length).length);
  const chosen: Graded[] = [];
  for (const band of BANDS) {
    const members = inBand(band).sort((a, b) => (
      a.cases ? a.arithmeticCells - b.arithmeticCells || a.cost - b.cost : a.cost - b.cost
    ));
    if (!members.length) continue;
    const take = Math.min(perBand, members.length);
    for (let i = 0; i < take; i += 1) {
      chosen.push(members[Math.floor((i * (members.length - 1)) / Math.max(1, take - 1))]);
    }
  }
  const unique = [...new Map(chosen.map(g => [g.index, g])).values()]
    .sort((a, b) => BANDS.indexOf(a.band) - BANDS.indexOf(b.band) || a.cost - b.cost)
    .slice(0, pick);
  console.log(`\npicked ${unique.length}, ${perBand} per band where available:`);
  for (const g of unique) {
    console.log(`  #${String(g.index + 1).padStart(4)}  cost ${String(g.cost).padStart(3)}` +
      `${g.costSpread ? ` ±${g.costSpread}` : '   '}  ${g.band.padEnd(20)}` +
      (g.cases ? `  arithmetic stalls at ${g.arithmeticCells}/${g.cells}` : ''));
  }
  const out = flag('--corpus');
  if (out) {
    // Written with the grades attached: a bare list of regions would lose the only thing
    // that makes this a corpus rather than a pile of layouts.
    writeFileSync(out, `${JSON.stringify(unique.map(g => ({
      shape: g.shape, band: g.band, cost: g.cost, costSpread: g.costSpread,
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
