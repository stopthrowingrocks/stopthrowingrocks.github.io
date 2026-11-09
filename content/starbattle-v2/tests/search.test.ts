// The proof search: what a proof costs, and that what it finds actually holds up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initState } from '../src/engine.ts';
import { parseProof, printProof } from '../src/proofText.ts';
import { parseLevels } from '../src/puzzles.ts';
import { runProof } from '../src/agentTool.ts';
import {
  boardAdvancingMoves, cliqueTilings, exprCost, proofCost, search, splitMoves, statementCost,
} from '../src/search.ts';
import levels from '../src/levels.json' with { type: 'json' };
import type { Block, Puzzle, RawLevel } from '../src/types.ts';

const puzzles = parseLevels(levels as RawLevel[]);
const EASY: Puzzle = puzzles[2];   // a 5x5 the search finishes quickly
const HARD: Puzzle = puzzles[0];   // needs (- (+ row row) (+ region region))

const costOf = (puzzle: Puzzle, text: string): number => proofCost(parseProof(text, puzzle));

test('a statement costs one, plus an operator or clique each', () => {
  // Naming a hypothesis you already have is free; deriving a new one is the work.
  assert.equal(costOf(HARD, '(stars region5)'), 1);
  assert.equal(costOf(HARD, '(elims (- row1 region3))'), 2);
  assert.equal(costOf(HARD, '(elims (- (clique A1 B1) region3))'), 3);
  assert.equal(costOf(HARD, '(elims (- (+ row4 row5) (+ region4 region5)))'), 4);
  assert.equal(costOf(HARD, '(stars (- region2 (+ (clique A1 B1) (clique A3 A4))))'), 5);
});

test('a proof costs the sum of its statements', () => {
  const text = '(stars region5)\n(elims (- row1 region3))';
  assert.equal(costOf(HARD, text), 3);
  const blocks = parseProof(text, HARD);
  assert.equal(proofCost(blocks), blocks.reduce((total, b) => total + statementCost(b), 0));
});

test('an empty slot costs nothing', () => {
  assert.equal(exprCost(null), 0);
});

test('what the search finds verifies as a real proof', () => {
  const result = search(EASY, initState(EASY), { timeLimitMs: 60000 });
  assert.equal(result.found, true, `no proof found (${result.exhausted})`);
  const report = runProof(EASY, printProof(result.blocks, EASY));
  assert.equal(report.ok, true, report.parseError);
  assert.equal(report.errorCount, 0);
  assert.equal(report.solved, true);
});

test('the cost the search reports is the cost of the proof it returns', () => {
  const result = search(EASY, initState(EASY), { timeLimitMs: 60000 });
  assert.equal(result.cost, proofCost(result.blocks));
});

test('the search finds derivations that sum facts on both sides', () => {
  // Puzzle 1 cannot be opened without (- (+ row4 row5) (+ region4 region5)), which is
  // three operators deep — the search has no operator budget, only a cost ceiling.
  const result = search(HARD, initState(HARD), { timeLimitMs: 120000 });
  assert.equal(result.found, true, `no proof found (${result.exhausted})`);
  assert.match(printProof(result.blocks, HARD), /\(\+ row4 row5\)/);
  assert.ok(result.cost <= 11, `expected to match or beat the hand-written proof, got ${result.cost}`);
});

test('a cost ceiling below what a statement needs makes it unreachable', () => {
  // Derivations only: puzzle 1 needs a four-cost statement to open at all. (With claims in
  // play it is reachable under this ceiling, since proving a cell by contradiction costs 3.)
  const result = search(HARD, initState(HARD), {
    generators: [boardAdvancingMoves],
    maxStatementCost: 3,
    timeLimitMs: 30000,
  });
  assert.equal(result.found, false);
  assert.equal(result.exhausted, 'space');
});

test('searching twice returns the same proof', () => {
  const once = search(EASY, initState(EASY), { timeLimitMs: 60000 });
  const twice = search(EASY, initState(EASY), { timeLimitMs: 60000 });
  const strip = (blocks: Block[]) => printProof(blocks, EASY);
  assert.equal(strip(once.blocks), strip(twice.blocks));
  assert.equal(once.cost, twice.cost);
});

test('the goal is a predicate, so the search can aim at something else', () => {
  // What a future `suppose` body needs: stop at a contradiction rather than a solved board.
  const result = search(EASY, initState(EASY), {
    goal: state => state.cells.filter(c => c !== null).length >= 4,
    timeLimitMs: 30000,
  });
  assert.equal(result.found, true);
  assert.ok(result.best.cells.filter(c => c !== null).length >= 4);
});

test('proving a cell by contradiction costs the same as deriving it through a clique', () => {
  // The rule the cost model is pinned to: a claim, its predicate, and a by-contradiction
  // naming the hypothesis that breaks — three, the same as cross-out through a clique.
  const puzzle = puzzles[4];
  assert.equal(costOf(puzzle, '(claim (is-elim D2) (by-contradiction (body) (via region2)))'), 3);
  assert.equal(costOf(puzzle, '(elims (- (clique B2 C2 B3 C3) region4))'), 3);
});

test('a contradiction body costs what its statements cost', () => {
  const puzzle = puzzles[4];
  assert.equal(
    costOf(puzzle, '(claim (is-elim A2) (by-contradiction (body (stars region4) (stars row4)) (via colA)))'),
    5,
  );
});

test('a count predicate costs more than a cell one', () => {
  const puzzle = puzzles[4];
  assert.equal(costOf(puzzle, '(claim (is-elim D2) (by-contradiction (body) (via region2)))'), 3);
  assert.equal(costOf(puzzle, '(claim (= (count A1 B1) 0) (by-contradiction (body) (via region2)))'), 4);
});

test('the search reaches for contradiction when derivation runs out', () => {
  // Puzzle 5 cannot be finished by sum-and-subtract alone; it needs claims.
  const puzzle = puzzles[4];
  const result = search(puzzle, initState(puzzle), { timeLimitMs: 180000 });
  assert.equal(result.found, true, `no proof found (${result.exhausted})`);
  const text = printProof(result.blocks, puzzle);
  assert.match(text, /by-contradiction/);
  const report = runProof(puzzle, text);
  assert.equal(report.solved, true);
  assert.equal(report.errorCount, 0);
  assert.ok(result.cost <= 31, `expected to match or beat the hand-written 31, got ${result.cost}`);
});

test('without contradiction moves, puzzle 5 is out of reach', () => {
  const puzzle = puzzles[4];
  const result = search(puzzle, initState(puzzle), {
    generators: [boardAdvancingMoves],
    timeLimitMs: 30000,
  });
  assert.equal(result.found, false);
  assert.equal(result.exhausted, 'space');
});

test('splits are generated by decomposing a count into cliques', () => {
  // 14x14 #2: five region facts tile into exactly three king-cliques at the root, and a
  // hand proof opens by splitting all five.
  const puzzle = puzzles[351];
  const moves = splitMoves(puzzle, initState(puzzle), {});
  const split = moves.map(m => printProof([m.block], puzzle).trim());
  assert.equal(moves.length, 5, split.join('\n'));
  for (const move of moves) assert.equal(move.cost, 4, 'a split of three cliques costs four');
  assert.ok(split.some(t => t.includes('(split region11 _ (clique C10) (clique D10 E10) (clique F10 F11 G11))')),
    `region11 should split smallest-part-first:\n${split.join('\n')}`);
});

test('a split prefers the tiling with the smallest parts', () => {
  const puzzle = puzzles[351];
  const tilings = cliqueTilings(puzzle, [2 * 14 + 9, 2 * 14 + 10], 1);
  assert.equal(tilings.length, 1, 'two touching cells tile one way');
});

test('splits settle nothing, so they are not board-advancing moves', () => {
  const puzzle = puzzles[351];
  const state = initState(puzzle);
  const settled = state.cells.filter(c => c !== null).length;
  for (const move of splitMoves(puzzle, state, {})) {
    assert.equal(move.state.cells.filter(c => c !== null).length, settled);
  }
  assert.equal(boardAdvancingMoves(puzzle, state, {}).some(m => m.block.type === 'split'), false);
});

test('a fact that is already one star per part is not split again', () => {
  const puzzle = puzzles[351];
  const once = splitMoves(puzzle, initState(puzzle), {});
  const after = once[0].state;
  const again = splitMoves(puzzle, after, {});
  assert.ok(again.length < once.length, 'the fact just split should not be offered again');
});
