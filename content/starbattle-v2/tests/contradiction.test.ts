// The cell-local impossibility: a cell required to hold a star and required to be empty.
//
// Before this existed one mark quietly won — `setStars` overwrote an elimination with the
// star, `setElim` returned without writing onto a star — so the board afterwards looked
// consistent and nothing said where the clash was. Only `PState.contradiction` recorded that
// anything had gone wrong, and only `Fact.impossible` localised it, which a conflict in the
// cells never produces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, isSolved } from '../src/engine.ts';
import { parseProof } from '../src/proofText.ts';
import { parseLevels } from '../src/puzzles.ts';
import levels from '../src/levels.json' with { type: 'json' };
import type { Puzzle, RawLevel } from '../src/types.ts';

const puzzles = parseLevels(levels as RawLevel[]);
const P: Puzzle = puzzles[0];
const A1 = 0;

const run = (text: string, puzzle: Puzzle = P) => {
  const blocks = parseProof(text, puzzle);
  return evaluate(puzzle, blocks);
};

test('eliminating a cell then starring it marks the cell, not just the state', () => {
  const { final } = run(`
    (claim (is-elim A1) (sorry))
    (claim (is-star A1) (sorry))
  `);
  assert.equal(final.cells[A1], 'contradiction');
  assert.equal(final.contradiction, true);
});

test('starring a cell then eliminating it reaches the same mark', () => {
  // Order must not decide which mark survives, which is what it used to decide.
  const { final } = run(`
    (claim (is-star A1) (sorry))
    (claim (is-elim A1) (sorry))
  `);
  assert.equal(final.cells[A1], 'contradiction');
  assert.equal(final.contradiction, true);
});

test('a starred cell keeps fanning its eliminations out before the clash', () => {
  const { final } = run(`
    (claim (is-star A1) (sorry))
    (claim (is-elim A1) (sorry))
  `);
  // B1 sits beside A1, so the star eliminated it; the later clash at A1 does not undo that.
  assert.equal(final.cells[1], 'elim');
});

test('a board holding a contradiction is not solved', () => {
  const { final } = run(`
    (claim (is-elim A1) (sorry))
    (claim (is-star A1) (sorry))
  `);
  // It is a settled value, so a plain "no cell is null" test would call this proven.
  assert.ok(final.cells.every(cell => cell !== null) === false
    || !isSolved(final), 'a contradiction cell must not count as proof');
  assert.equal(isSolved(final), false);
});

test('re-eliminating a contradictory cell leaves it contradictory', () => {
  const { final } = run(`
    (claim (is-elim A1) (sorry))
    (claim (is-star A1) (sorry))
    (claim (is-elim A1) (sorry))
  `);
  assert.equal(final.cells[A1], 'contradiction', 'the mark is not overwritten back to elim');
});
