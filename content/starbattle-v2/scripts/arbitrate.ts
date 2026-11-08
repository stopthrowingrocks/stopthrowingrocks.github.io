/**
 * At a stall, which tool is the better buy — and priced how?
 *
 *   npx tsx scripts/arbitrate.ts <layouts.json> [sample]
 *
 * Statement cost prices the finished proof, not the work of finding it. Checking every cell
 * against every hypothesis for a one-step contradiction is 25x15 on a 5x5 however short the
 * claim that comes out, so two proofs of equal length can cost wildly different amounts to
 * come by. This prices both tools twice over: per statement, and per candidate examined.
 */
import { readFileSync } from 'node:fs';
import { initState, isSolved, applyStep } from '../src/engine';
import { parseLevels } from '../src/puzzles';
import { findCase, saturate, newCaseContext, levelMoves } from '../src/saturate';
import { newProbe, probeTotal, statementCost } from '../src/search';
import type { PState, Puzzle, RawLevel } from '../src/types';

const loaded: unknown[] = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const shapes: string[][] = loaded.map(e =>
  Array.isArray(e) ? e as string[] : (e as { shape: string[] }).shape);
const SAMPLE = Number(process.argv[3] ?? 200);

const asPuzzle = (shape: string[], index: number): Puzzle =>
  parseLevels([{
    name: `corpus ${index}`, difficulty: 'corpus', stars: 1,
    size: shape.length, shapes: shape,
  } as RawLevel])[0];

const settled = (s: PState) => s.cells.filter(c => c !== null).length;
const step = Math.max(1, Math.floor(shapes.length / SAMPLE));
const picked = shapes.map((shape, index) => ({ shape, index })).filter((_, i) => i % step === 0);

interface Priced { perStatement: number; perWork: number; work: number; gain: number }
const argPriced: Priced[] = [];
const arithPriced: Priced[] = [];
let arithWinsOnCost = 0;
let argWinsOnCost = 0;
let arithWinsOnWork = 0;
let argWinsOnWork = 0;
let onlyArgument = 0;

for (const { shape, index } of picked) {
  const puzzle = asPuzzle(shape, index);
  const stalled = saturate(puzzle, initState(puzzle), isSolved, { noCases: true, maxCeiling: 3 });
  if (isSolved(stalled.state)) continue;
  const state = stalled.state;
  const base = settled(state);

  // The argument: what it costs to write, and what it cost to find.
  const argProbe = newProbe();
  const move = findCase(puzzle, state, { caseCeiling: 1, probe: argProbe }, newCaseContext().attempted);
  if (!move) continue;
  const argGain = settled(move.state) - base;
  if (argGain <= 0) continue;
  const argument: Priced = {
    perStatement: statementCost(move.block) / argGain,
    perWork: probeTotal(argProbe) / argGain,
    work: probeTotal(argProbe),
    gain: argGain,
  };

  // The best arithmetic above the stall, priced the same two ways. The work is charged for
  // the whole sweep of a level, because that is what you must sift to find any of its moves.
  let best: Priced | null = null;
  for (let level = 4; level <= 6; level += 1) {
    const arithProbe = newProbe();
    const moves = levelMoves(puzzle, state, level, { probe: arithProbe });
    const sweep = probeTotal(arithProbe);
    for (const m of moves) {
      const applied = applyStep(puzzle, state, m.block);
      if (applied.status !== 'ok') continue;
      const gain = settled(applied.state) - base;
      if (gain <= 0) continue;
      const priced: Priced = {
        perStatement: m.cost / gain, perWork: sweep / gain, work: sweep, gain,
      };
      if (!best || priced.perWork < best.perWork) best = priced;
    }
  }
  if (!best) { onlyArgument += 1; continue; }

  argPriced.push(argument);
  arithPriced.push(best);
  if (best.perStatement < argument.perStatement) arithWinsOnCost += 1; else argWinsOnCost += 1;
  if (best.perWork < argument.perWork) arithWinsOnWork += 1; else argWinsOnWork += 1;
  void index;
}

const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const show = (label: string, xs: Priced[]) => {
  console.log(`  ${label.padEnd(28)} ${med(xs.map(p => p.perStatement)).toFixed(2).padStart(7)}   ` +
    `${med(xs.map(p => p.perWork)).toFixed(0).padStart(9)}   ${med(xs.map(p => p.gain)).toFixed(1).padStart(5)}`);
};

const n = argPriced.length;
console.log(`${n} stalls where both tools could advance the board ` +
  `(${onlyArgument} where only the argument could)\n`);
console.log('median, per cell settled:      statements   candidates   cells');
show('cheapest argument', argPriced);
show('best arithmetic above stall', arithPriced);
console.log(`\npriced per statement: arithmetic wins ${arithWinsOnCost}/${n}, argument ${argWinsOnCost}`);
console.log(`priced per candidate: arithmetic wins ${arithWinsOnWork}/${n}, argument ${argWinsOnWork}`);
console.log('\ntotal candidates examined, median per stall:');
console.log(`  argument:   ${med(argPriced.map(p => p.work)).toFixed(0)}`);
console.log(`  arithmetic: ${med(arithPriced.map(p => p.work)).toFixed(0)}`);
