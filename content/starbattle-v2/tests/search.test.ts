// The proof search: what a proof costs, and that what it finds actually holds up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initState } from '../src/engine.ts';
import { parseProof, printProof } from '../src/proofText.ts';
import { parseLevels } from '../src/puzzles.ts';
import { runProof } from '../src/agentTool.ts';
import { boardAdvancingMoves, exprCost, proofCost, search, statementCost } from '../src/search.ts';
import levels from '../src/levels.json' with { type: 'json' };
import type { Block, Puzzle, RawLevel } from '../src/types.ts';

const puzzles = parseLevels(levels as RawLevel[]);
const EASY: Puzzle = puzzles[2];   // a 5x5 the search finishes quickly
const HARD: Puzzle = puzzles[0];   // needs (- (+ row row) (+ region region))

const costOf = (puzzle: Puzzle, text: string): number => proofCost(parseProof(text, puzzle));

test('a statement costs one, plus an operator or clique each', () => {
  // Naming a hypothesis you already have is free; deriving a new one is the work.
  assert.equal(costOf(HARD, '(stars region4)'), 1);
  assert.equal(costOf(HARD, '(elims (- row0 region2))'), 2);
  assert.equal(costOf(HARD, '(elims (- (clique A1 B1) region2))'), 3);
  assert.equal(costOf(HARD, '(elims (- (+ row3 row4) (+ region3 region4)))'), 4);
  assert.equal(costOf(HARD, '(stars (- region1 (+ (clique A1 B1) (clique A3 A4))))'), 5);
});

test('a proof costs the sum of its statements', () => {
  const text = '(stars region4)\n(elims (- row0 region2))';
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
  // Puzzle 1 cannot be opened without (- (+ row3 row4) (+ region3 region4)), which is
  // three operators deep — the search has no operator budget, only a cost ceiling.
  const result = search(HARD, initState(HARD), { timeLimitMs: 120000 });
  assert.equal(result.found, true, `no proof found (${result.exhausted})`);
  assert.match(printProof(result.blocks, HARD), /\(\+ row3 row4\)/);
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
  assert.equal(costOf(puzzle, '(claim (is-elim D2) (by-contradiction (body) (via region1)))'), 3);
  assert.equal(costOf(puzzle, '(elims (- (clique B2 C2 B3 C3) region3))'), 3);
});

test('a contradiction body costs what its statements cost', () => {
  const puzzle = puzzles[4];
  assert.equal(
    costOf(puzzle, '(claim (is-elim A2) (by-contradiction (body (stars region3) (stars row3)) (via col0)))'),
    5,
  );
});

test('a count predicate costs more than a cell one', () => {
  const puzzle = puzzles[4];
  assert.equal(costOf(puzzle, '(claim (is-elim D2) (by-contradiction (body) (via region1)))'), 3);
  assert.equal(costOf(puzzle, '(claim (= (count A1 B1) 0) (by-contradiction (body) (via region1)))'), 4);
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
