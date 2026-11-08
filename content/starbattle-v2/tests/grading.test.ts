// Grading boards by difficulty: the ladder a board forces you up, and what it is worth.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initState, isSolved } from '../src/engine.ts';
import { parseLevels } from '../src/puzzles.ts';
import { prove, saturate } from '../src/saturate.ts';
import levels from '../src/levels.json' with { type: 'json' };
import type { RawLevel } from '../src/types.ts';

const puzzles = parseLevels(levels as RawLevel[]);
const EASY = puzzles[2];
const HARD = puzzles[0];

test('saturation reports the dearest tool it needed', () => {
  const run = saturate(EASY, initState(EASY), isSolved, {});
  assert.ok(run.peakLevel >= 1, 'a solved board used at least the cheapest tool');
  assert.ok(run.peakLevel <= 6, `peak level ${run.peakLevel} is above the ceiling`);
});

test('a board needing combined facts reaches a dearer level than one that does not', () => {
  const easy = saturate(EASY, initState(EASY), isSolved, {});
  const hard = saturate(HARD, initState(HARD), isSolved, {});
  assert.ok(hard.peakLevel > easy.peakLevel,
    `#1 needs (- (+ row row) (+ region region)) so should outrank #3: ${hard.peakLevel} vs ${easy.peakLevel}`);
});

test('shuffling equally-priced statements changes the cost but not the outcome', () => {
  const runs = [0, 1, 2, 3, 4].map(seed =>
    prove(EASY, initState(EASY), { shuffleSeed: seed * 7919 + 1 }));
  for (const run of runs) {
    assert.ok(run.solved, 'every order should still finish the board');
    assert.ok(isSolved(run.state));
  }
  // The band is what grading rests on, so it has to be the part that holds still.
  const levelsSeen = new Set(runs.map(r => r.peakLevel));
  const casesSeen = new Set(runs.map(r => r.cases));
  assert.equal(levelsSeen.size, 1, `peak level drifted with the order: ${[...levelsSeen]}`);
  assert.equal(casesSeen.size, 1, `case count drifted with the order: ${[...casesSeen]}`);
});

test('the same seed proves the same way twice', () => {
  const once = prove(EASY, initState(EASY), { shuffleSeed: 7 });
  const twice = prove(EASY, initState(EASY), { shuffleSeed: 7 });
  assert.equal(once.cost, twice.cost);
  assert.equal(once.blocks.length, twice.blocks.length);
});

test('a board solved by arithmetic alone argues no cases', () => {
  const run = prove(EASY, initState(EASY), {});
  assert.ok(run.solved);
  assert.equal(run.cases, 0, '#3 should not need a case split');
});

test('search work is counted per tool and totals them', () => {
  const run = prove(HARD, initState(HARD), {});
  assert.ok(run.solved);
  assert.ok(run.work > 0, 'proving a board examines candidates');
  const summed = Object.values(run.workByTool).reduce((a, b) => a + b, 0);
  assert.equal(run.work, summed, 'the total is the sum over tools');
  assert.ok('forced' in run.workByTool, `every board sweeps the fact pool: ${Object.keys(run.workByTool)}`);
});

test('a board needing combined facts takes more sifting than one that does not', () => {
  const easy = prove(EASY, initState(EASY), {});
  const hard = prove(HARD, initState(HARD), {});
  assert.ok(hard.work > easy.work,
    `#1 needs combined facts so should cost more search than #3: ${hard.work} vs ${easy.work}`);
});

test('search work barely moves when the order of equals does', () => {
  // Cost moves with the shuffle on 89% of boards; work on 9%. That gap is the whole reason
  // difficulty is measured in candidates examined rather than in statements written.
  const runs = [0, 1, 2, 3].map(seed => prove(HARD, initState(HARD), { shuffleSeed: seed * 7919 + 1 }));
  for (const run of runs) assert.ok(run.solved);
  const works = runs.map(r => r.work);
  const ratio = Math.max(...works) / Math.min(...works);
  assert.ok(ratio < 1.5, `work should be near-deterministic, got ${works.join(', ')}`);
});
