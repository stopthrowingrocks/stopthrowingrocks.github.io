/**
 * At a stall, is the cheap argument or the dear arithmetic the better buy?
 *
 * An argument costs about 3 and settles one cell. Arithmetic at level 4-6 costs more per
 * statement but can settle several cells at once, so cost per statement -- what the ladder
 * sorts by -- may be the wrong comparison between the two tools. This prices both in cost
 * per cell settled at the moment arithmetic first stalls.
 */
import { readFileSync } from 'node:fs';
import { initState, isSolved, applyStep } from '../src/engine';
import { parseLevels } from '../src/puzzles';
import { findCase, saturate, newCaseContext, levelMoves } from '../src/saturate';
import { statementCost } from '../src/search';
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

const argRatios: number[] = [];
const arithRatios: number[] = [];
let arithBetter = 0;
let argBetter = 0;
let noArith = 0;

for (const { shape, index } of picked) {
  const puzzle = asPuzzle(shape, index);
  const stalled = saturate(puzzle, initState(puzzle), isSolved, { noCases: true, maxCeiling: 3 });
  if (isSolved(stalled.state)) continue;
  const state = stalled.state;
  const base = settled(state);

  const move = findCase(puzzle, state, { caseCeiling: 1 }, newCaseContext().attempted);
  if (!move) continue;
  const argGain = settled(move.state) - base;
  if (argGain <= 0) continue;
  const argRatio = statementCost(move.block) / argGain;

  // The best arithmetic available above the stall, by cost per cell it settles.
  let bestArith = Infinity;
  for (let level = 4; level <= 6; level += 1) {
    for (const m of levelMoves(puzzle, state, level, {})) {
      const applied = applyStep(puzzle, state, m.block);
      if (applied.status !== 'ok') continue;
      const gain = settled(applied.state) - base;
      if (gain <= 0) continue;
      bestArith = Math.min(bestArith, m.cost / gain);
    }
  }
  if (!Number.isFinite(bestArith)) { noArith += 1; continue; }

  argRatios.push(argRatio);
  arithRatios.push(bestArith);
  if (bestArith < argRatio) arithBetter += 1; else argBetter += 1;
}

const stat = (xs: number[], label: string) => {
  const s = [...xs].sort((a, b) => a - b);
  console.log(`  ${label.padEnd(26)} median ${s[Math.floor(s.length / 2)].toFixed(2)}  ` +
    `mean ${(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2)}`);
};

console.log(`${argRatios.length} stalls where both tools could advance the board ` +
  `(${noArith} where only the argument could)\n`);
console.log('cost per cell settled, at the stall:');
stat(argRatios, 'cheapest argument');
stat(arithRatios, 'best arithmetic above stall');
console.log(`\narithmetic is the better buy on ${arithBetter}/${argRatios.length} stalls; ` +
  `the argument on ${argBetter}`);
