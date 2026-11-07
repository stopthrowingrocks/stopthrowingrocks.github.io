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
