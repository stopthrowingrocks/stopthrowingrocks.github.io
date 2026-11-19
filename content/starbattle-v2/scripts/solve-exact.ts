/**
 * Exact solver: find every placement satisfying a puzzle's constraints.
 *
 * This is ground truth, not a proof — it says what the answer is, which is what
 * you want when a proof search stalls and you need to know which cells are left
 * to argue. Rows are chosen one at a time from the non-adjacent column triples,
 * pruned against column and region capacity in the rows that remain.
 *
 *   npx tsx scripts/solve-exact.ts <index> [--all]
 */
import { parseLevels } from '../src/puzzles';
import levelsData from '../src/levels.json';
import type { Puzzle } from '../src/types';

const index = Number(process.argv[2]);
const findAll = process.argv.includes('--all');
const puzzles: Puzzle[] = parseLevels(levelsData);
if (!Number.isInteger(index) || index < 0 || index >= puzzles.length) {
  console.error(`usage: solve-exact <0..${puzzles.length - 1}> [--all]`);
  process.exit(1);
}
const puzzle = puzzles[index];
const N = puzzle.size, K = puzzle.stars;
const at = (r: number, c: number) => r * N + c;
const colLetter = (c: number) => String.fromCharCode(65 + c);

/** Column sets of size K within one row, no two chosen columns adjacent. */
const rowOptions: number[][] = [];
(function pick(start: number, acc: number[]) {
  if (acc.length === K) { rowOptions.push([...acc]); return; }
  for (let c = start; c < N; c++) { acc.push(c); pick(c + 2, acc); acc.pop(); }
})(0, []);

const regionIds = [...new Set(puzzle.regions)].sort((a, b) => a - b);
const regionSlot = new Map(regionIds.map((g, i) => [g, i]));
const nRegions = regionIds.length;

/** How many cells of each region sit at or below row r — the capacity still to come. */
const capacityFrom: number[][] = Array.from({ length: N + 1 }, () => Array(nRegions).fill(0));
for (let r = N - 1; r >= 0; r--) {
  capacityFrom[r] = [...capacityFrom[r + 1]];
  for (let c = 0; c < N; c++) capacityFrom[r][regionSlot.get(puzzle.regions[at(r, c)])!]++;
}

const colCount = Array(N).fill(0);
const regCount = Array(nRegions).fill(0);
const chosen: number[][] = [];
const solutions: number[][][] = [];

function compatible(prev: number[] | undefined, next: number[]): boolean {
  if (!prev) return true;
  for (const a of prev) for (const b of next) if (Math.abs(a - b) <= 1) return false;
  return true;
}

function search(r: number): boolean {
  if (r === N) {
    solutions.push(chosen.map(row => [...row]));
    return !findAll;
  }
  const rowsLeft = N - r;
  for (const opt of rowOptions) {
    if (!compatible(chosen[r - 1], opt)) continue;

    let ok = true;
    for (const c of opt) if (colCount[c] + 1 > K) { ok = false; break; }
    if (!ok) continue;
    for (const c of opt) colCount[c]++;
    // Every column still short must be fillable by the rows that remain.
    for (let c = 0; c < N && ok; c++) if (K - colCount[c] > rowsLeft - 1) ok = false;

    const touched: number[] = [];
    if (ok) {
      for (const c of opt) {
        const g = regionSlot.get(puzzle.regions[at(r, c)])!;
        regCount[g]++; touched.push(g);
        if (regCount[g] > K) ok = false;
      }
      // And every region still short must have enough cells left below this row.
      for (let g = 0; g < nRegions && ok; g++) {
        if (K - regCount[g] > capacityFrom[r + 1][g]) ok = false;
      }
    }

    if (ok) {
      chosen.push(opt);
      if (search(r + 1)) return true;
      chosen.pop();
    }
    for (const g of touched) regCount[g]--;
    for (const c of opt) colCount[c]--;
  }
  return false;
}

const started = Date.now();
search(0);
const ms = Date.now() - started;

console.log(`${puzzle.name} #${puzzle.categoryIndex} (index ${index}) — ${solutions.length}`
  + `${findAll ? '' : ' (stopped at first)'} solution(s) in ${ms}ms\n`);

for (const sol of solutions.slice(0, 2)) {
  const grid = Array.from({ length: N }, () => Array(N).fill('·'));
  sol.forEach((cols, r) => cols.forEach(c => { grid[r][c] = '★'; }));
  console.log('    ' + Array.from({ length: N }, (_, c) => colLetter(c)).join(' '));
  grid.forEach((row, r) => console.log(`${String(r + 1).padStart(2)}  ${row.join(' ')}`));
  console.log('\nstars: ' + sol.flatMap((cols, r) => cols.map(c => `${colLetter(c)}${r + 1}`)).join(' ') + '\n');
}
