/**
 * Search for a 5x5 1★ puzzle whose proof has a prescribed shape:
 *
 *   1  (stars region-α)                     α is a one-cell region
 *   2  (elims row-α) and/or (elims col-α)
 *   3  (stars region-β)
 *   4  (elims row-β)
 *   5  (elims col-β)
 *   6  (elims (- L region-γ))                γ confined to line L
 *   7  (stars region-δ)
 *   8  (stars region-γ) / (stars region-ε)   either order
 *   9  the other one
 *
 * Three structural facts drive the search.
 *
 * α must be a single cell: nothing is eliminated when step 1 fires, so `stars`
 * needs cells == target == 1.
 *
 * β must consist of β★ plus cells already settled by step 2, since β is tight
 * when it fires and so holds exactly one free cell. That is why regions are not
 * grown uniformly here — a uniform partition almost never satisfies it.
 *
 * Every unknown cell after step 7 lies in γ or ε: α is one cell, and β and δ
 * were each tight when they fired, so neither leaves a leftover behind. If
 * steps 8 and 9 are to commute, as "γ OR ε / ε OR γ" reads, both must be tight
 * the moment δ lands and exactly two cells are unknown there. If the order is
 * forced instead, the step-9 region may carry extra cells that the step-8 star's
 * king-neighbourhood clears; `orderFree` records which case a hit is.
 *
 *   npx tsx scripts/gen-skeleton.ts [triesPerGeometry] [seed]
 */
import { parseLevels } from '../src/puzzles';
import { runProof } from '../src/agentTool';
import type { Puzzle, RawLevel } from '../src/types';

const N = 5;
const CELLS = N * N;
const at = (r: number, c: number) => r * N + c;
const rowOf = (i: number) => Math.floor(i / N);
const colOf = (i: number) => i % N;
const label = (i: number) => `${'ABCDE'[colOf(i)]}${rowOf(i) + 1}`;
const ALL = Array.from({ length: CELLS }, (_, i) => i);

const kings: number[][] = [], orth: number[][] = [];
for (let i = 0; i < CELLS; i++) {
  const r = rowOf(i), c = colOf(i); const k: number[] = [], o: number[] = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const rr = r + dr, cc = c + dc;
    if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
    k.push(at(rr, cc)); if (!dr || !dc) o.push(at(rr, cc));
  }
  kings.push(k); orth.push(o);
}
const rowCells = (r: number) => Array.from({ length: N }, (_, c) => at(r, c));
const colCells = (c: number) => Array.from({ length: N }, (_, r) => at(r, c));
const colName = (c: number) => `col${'ABCDE'[c]}`;

/** Every permutation of columns whose consecutive rows are non-adjacent. */
function solutions(): number[][] {
  const out: number[][] = [];
  const used = Array<boolean>(N).fill(false), acc: number[] = [];
  const walk = () => {
    if (acc.length === N) { out.push([...acc]); return; }
    for (let c = 0; c < N; c++) {
      if (used[c] || (acc.length && Math.abs(c - acc[acc.length - 1]) < 2)) continue;
      used[c] = true; acc.push(c); walk(); acc.pop(); used[c] = false;
    }
  };
  walk();
  return out;
}

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- board simulation --------------------------------------------------------

const UNKNOWN = 0, STAR = 1, ELIM = 2;
type Board = Int8Array;

const unknowns = (b: Board, cs: number[]) => cs.filter(c => b[c] === UNKNOWN);
const hasStar = (b: Board, cs: number[]) => cs.some(c => b[c] === STAR);
/** Tight for `stars`: no star yet, so target is still 1, and one cell free. */
const tight = (b: Board, cs: number[]) => !hasStar(b, cs) && unknowns(b, cs).length === 1;

function placeStar(b: Board, i: number): boolean {
  if (b[i] === ELIM) return false;
  b[i] = STAR;
  for (const n of kings[i]) {
    if (b[n] === STAR) return false;
    if (b[n] === UNKNOWN) b[n] = ELIM;
  }
  return true;
}

/** Cross out a line that already holds its star. Needs something left to cross. */
function elimLine(b: Board, cs: number[]): boolean {
  if (!hasStar(b, cs)) return false;
  const free = unknowns(b, cs);
  if (!free.length) return false;
  for (const c of free) b[c] = ELIM;
  return true;
}

const boardLines = () => {
  const out: Array<{ name: string; cells: number[] }> = [];
  for (let r = 0; r < N; r++) out.push({ name: `row${r + 1}`, cells: rowCells(r) });
  for (let c = 0; c < N; c++) out.push({ name: colName(c), cells: colCells(c) });
  return out;
};
const LINES = boardLines();

type Step2 = Array<'row' | 'col'>;

interface Geometry {
  stars: number[]; aStar: number; bStar: number; step2: Step2;
  /** Settled right after step 2 — the only cells β may hold besides β★. */
  settled2: number[];
  board5: Board;
}

/** Steps 1-5 depend only on where α★ and β★ sit, so screen that layer first. */
function geometry(stars: number[], aStar: number, bStar: number, step2: Step2): Geometry | null {
  const b = new Int8Array(CELLS) as Board;
  if (!placeStar(b, aStar)) return null;
  if (LINES.some(l => tight(b, l.cells))) return null;      // step 2 must be needed
  for (const w of step2) {
    const cs = w === 'row' ? rowCells(rowOf(aStar)) : colCells(colOf(aStar));
    if (!elimLine(b, cs)) return null;
  }
  const settled2 = ALL.filter(i => b[i] !== UNKNOWN && i !== aStar);
  if (b[bStar] === ELIM) return null;
  if (!orth[bStar].some(n => b[n] !== UNKNOWN && n !== aStar)) return null;  // β must connect
  if (!placeStar(b, bStar)) return null;
  if (!elimLine(b, rowCells(rowOf(bStar)))) return null;
  if (!elimLine(b, colCells(colOf(bStar)))) return null;
  if (LINES.some(l => tight(b, l.cells))) return null;      // step 6 must be needed
  return { stars, aStar, bStar, step2, settled2, board5: b };
}

// --- region construction -----------------------------------------------------

/** A random orthogonally connected subset of `allowed` containing `seed`. */
function connectedBlob(seed: number, allowed: Set<number>, rnd: () => number, maxSize: number): number[] {
  const blob = [seed];
  const inBlob = new Set(blob);
  const target = 1 + Math.floor(rnd() * maxSize);
  while (blob.length < target) {
    const options: number[] = [];
    for (const c of blob) for (const n of orth[c]) if (allowed.has(n) && !inBlob.has(n)) options.push(n);
    if (!options.length) break;
    const pick = options[Math.floor(rnd() * options.length)];
    blob.push(pick); inBlob.add(pick);
  }
  return blob;
}

/** Grow regions from `seeds` until they tile `allowed`. Null if a cell strands. */
function growInto(seeds: number[], allowed: Set<number>, rnd: () => number): Map<number, number> | null {
  const owner = new Map<number, number>();
  seeds.forEach((s, g) => owner.set(s, g));
  let left = allowed.size - seeds.length;
  while (left > 0) {
    const options: Array<[number, number]> = [];
    for (const [cell, g] of owner) {
      for (const n of orth[cell]) if (allowed.has(n) && !owner.has(n)) options.push([g, n]);
    }
    if (!options.length) return null;
    const [g, cell] = options[Math.floor(rnd() * options.length)];
    owner.set(cell, g); left--;
  }
  return owner;
}

// --- the schedule ------------------------------------------------------------

interface Roles { alpha: number; beta: number; gamma: number; delta: number; eps: number }
interface Plan { steps: string[]; orderFree: boolean }

function simulate(
  region: number[], stars: number[], roles: Roles, step2: Step2,
  line: { kind: 'row' | 'col'; index: number }, gammaFirst: boolean,
): Plan | null {
  const cellsOf = (g: number) => ALL.filter(i => region[i] === g);
  const regionLines = Array.from({ length: N }, (_, g) => ({ name: `region${g + 1}`, cells: cellsOf(g) }));
  const all = [...LINES, ...regionLines];
  const tightCount = (b: Board) => all.filter(l => tight(b, l.cells)).length;

  const b = new Int8Array(CELLS) as Board;
  const steps: string[] = [];

  // 1 — α is one cell, so its star needs nothing eliminated first.
  if (cellsOf(roles.alpha).length !== 1) return null;
  const aStar = stars[roles.alpha];
  if (!placeStar(b, aStar)) return null;
  steps.push(`(stars region${roles.alpha + 1})`);
  if (tightCount(b) !== 0) return null;

  // 2 — clear α's row and/or column.
  for (const w of step2) {
    const cs = w === 'row' ? rowCells(rowOf(aStar)) : colCells(colOf(aStar));
    if (!elimLine(b, cs)) return null;
    steps.push(`(elims ${w === 'row' ? `row${rowOf(aStar) + 1}` : colName(colOf(aStar))})`);
  }

  // 3 — β is now tight, and must be the only thing that is.
  const bCells = cellsOf(roles.beta);
  if (!tight(b, bCells) || tightCount(b) !== 1) return null;
  const bStar = unknowns(b, bCells)[0];
  if (bStar !== stars[roles.beta] || !placeStar(b, bStar)) return null;
  steps.push(`(stars region${roles.beta + 1})`);

  // 4, 5 — clear β's row, then its column.
  if (!elimLine(b, rowCells(rowOf(bStar)))) return null;
  steps.push(`(elims row${rowOf(bStar) + 1})`);
  if (!elimLine(b, colCells(colOf(bStar)))) return null;
  steps.push(`(elims ${colName(colOf(bStar))})`);
  if (tightCount(b) !== 0) return null;                     // step 6 must be needed

  // 6 — γ sits inside one still-starless line; clear the rest of that line.
  const gCells = cellsOf(roles.gamma), eCells = cellsOf(roles.eps), dCells = cellsOf(roles.delta);
  const gFree = unknowns(b, gCells);
  const lCells = line.kind === 'row' ? rowCells(line.index) : colCells(line.index);
  if (hasStar(b, lCells)) return null;                      // needs target 1 to subtract from
  const lFree = unknowns(b, lCells);
  if (!gFree.every(c => lFree.includes(c))) return null;     // applySubsum's containment check
  const rest = lFree.filter(c => !gFree.includes(c));
  if (!rest.length) return null;
  for (const c of rest) b[c] = ELIM;
  const lName = line.kind === 'row' ? `row${line.index + 1}` : colName(line.index);
  steps.push(`(elims (- ${lName} region${roles.gamma + 1}))`);

  // 7 — δ is tight, and δ alone among the three: γ and ε wait on its star.
  if (!tight(b, dCells) || tight(b, gCells) || tight(b, eCells)) return null;
  const dStar = unknowns(b, dCells)[0];
  if (dStar !== stars[roles.delta] || !placeStar(b, dStar)) return null;
  steps.push(`(stars region${roles.delta + 1})`);

  // 8, 9 — only the step-8 region must be tight now; step 8's own star can be
  // what frees the other. Both tight is the commuting case the skeleton reads.
  const orderFree = tight(b, gCells) && tight(b, eCells);
  for (const g of gammaFirst ? [roles.gamma, roles.eps] : [roles.eps, roles.gamma]) {
    const free = unknowns(b, cellsOf(g));
    if (free.length !== 1 || free[0] !== stars[g] || !placeStar(b, free[0])) return null;
    steps.push(`(stars region${g + 1})`);
  }

  if (ALL.some(i => b[i] === UNKNOWN)) return null;          // every cell must be proven
  return { steps, orderFree };
}

/** If the schedule still runs with one of α's two lines dropped, it was padding. */
function minimalStep2(
  region: number[], stars: number[], roles: Roles, step2: Step2,
  line: { kind: 'row' | 'col'; index: number }, gammaFirst: boolean,
): boolean {
  if (step2.length < 2) return true;
  return !step2.some(keep => simulate(region, stars, roles, [keep], line, gammaFirst));
}

// --- search ------------------------------------------------------------------

const tries = Number(process.argv[2] ?? 300);
const seed = Number(process.argv[3] ?? 7);
const rnd = mulberry32(seed);

const perms3 = (xs: number[]): number[][] => xs.length <= 1 ? [xs]
  : xs.flatMap((x, i) => perms3([...xs.slice(0, i), ...xs.slice(i + 1)]).map(p => [x, ...p]));

interface Hit { shapes: string[]; plan: Plan; roles: Roles; geo: Geometry; lineName: string }
const hits: Hit[] = [];
let geometries = 0;

outer:
for (const sol of solutions()) {
  const starCells = sol.map((c, r) => at(r, c));
  for (const aStar of starCells) for (const bStar of starCells) {
    if (aStar === bStar) continue;
    for (const step2 of [['row'], ['col'], ['row', 'col']] as Step2[]) {
      const geo = geometry(starCells, aStar, bStar, step2);
      if (!geo) continue;
      geometries++;
      const betaAllowed = new Set([geo.bStar, ...geo.settled2]);
      const restStars = starCells.filter(s => s !== aStar && s !== bStar);

      for (let t = 0; t < tries; t++) {
        const betaCells = connectedBlob(geo.bStar, betaAllowed, rnd, 8);
        const taken = new Set([geo.aStar, ...betaCells]);
        const allowed = new Set(ALL.filter(i => !taken.has(i)));
        if (restStars.some(s => !allowed.has(s))) continue;
        const owner = growInto(restStars, allowed, rnd);
        if (!owner) continue;

        // Region ids: 0 = α, 1 = β, 2..4 the three grown from the other stars.
        const region = Array<number>(CELLS).fill(-1);
        region[geo.aStar] = 0;
        for (const c of betaCells) region[c] = 1;
        for (const [cell, g] of owner) region[cell] = g + 2;
        if (region.some(v => v < 0)) continue;

        const starOf = Array<number>(N).fill(-1);
        for (const s of starCells) starOf[region[s]] = s;
        if (starOf.some(v => v < 0)) continue;              // one star per region

        for (const [gamma, delta, eps] of perms3([2, 3, 4])) {
          const roles: Roles = { alpha: 0, beta: 1, gamma, delta, eps };
          for (const kind of ['row', 'col'] as const) for (let index = 0; index < N; index++) {
            for (const gammaFirst of [true, false]) {
              const line = { kind, index };
              const plan = simulate(region, starOf, roles, step2, line, gammaFirst);
              if (!plan) continue;
              if (!minimalStep2(region, starOf, roles, step2, line, gammaFirst)) continue;
              hits.push({
                shapes: Array.from({ length: N }, (_, r) =>
                  Array.from({ length: N }, (_, c) => String(region[at(r, c)])).join('')),
                plan, roles, geo,
                lineName: kind === 'row' ? `row${index + 1}` : colName(index),
              });
              if (hits.length >= 8) break outer;
            }
          }
        }
      }
    }
  }
}

// --- report, verified against the real engine --------------------------------

hits.sort((a, b) => Number(b.plan.orderFree) - Number(a.plan.orderFree)
  || a.geo.step2.length - b.geo.step2.length);

console.log(`${geometries} viable geometries, ${hits.length} hit(s), seed ${seed}\n`);

for (const [n, hit] of hits.entries()) {
  const level: RawLevel = { difficulty: 'normal', stars: 1, size: N, shapes: hit.shapes };
  const puzzle: Puzzle = parseLevels([level])[0];
  const proof = hit.plan.steps.join('\n');
  const report = runProof(puzzle, proof);

  console.log(`--- hit ${n + 1}: step 2 = ${hit.geo.step2.join('+')}, step 6 line ${hit.lineName}, `
    + `steps 8/9 ${hit.plan.orderFree ? 'commute' : 'ORDERED'} ---`);
  console.log(hit.shapes.map((s, r) => ` ${r + 1}  ${s.split('').join(' ')}`).join('\n'));
  console.log(`  stars  ${hit.geo.stars.map(label).join(' ')}`);
  console.log(`  roles  α=region1 β=region2 γ=region${hit.roles.gamma + 1} `
    + `δ=region${hit.roles.delta + 1} ε=region${hit.roles.eps + 1}`);
  console.log(`  engine ${report.solved && !report.errorCount ? 'SOLVED, all steps ok'
    : `FAILED — ${report.errorCount} error(s), ${report.cellsProven}/${report.totalCells} cells`}`);
  console.log(`  shapes ${JSON.stringify(hit.shapes)}`);
  console.log(proof.split('\n').map(l => '    ' + l).join('\n'));
  console.log();
}
