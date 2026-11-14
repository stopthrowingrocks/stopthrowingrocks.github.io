/*
 * Boolean rules as natural deduction.
 *
 * The system already had the introduction side: `constructor` for AND, `by_cases` for a
 * disjunctive goal, `by_contradiction` for negation, `suppose`/`use` for implication. What it
 * lacked was elimination -- a disjunction you held was inert, because `by_cases` proves an OR
 * goal and nothing could consume one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/engine.ts';
import { parseProof, printProof } from '../src/proofText.ts';
import { parseLevels } from '../src/puzzles.ts';
import levels from '../src/levels.json' with { type: 'json' };
import type { Puzzle, RawLevel } from '../src/types.ts';

const puzzles = parseLevels(levels as RawLevel[]);
const P: Puzzle = puzzles[0];

const run = (text: string, puzzle: Puzzle = P) => {
  const blocks = parseProof(text, puzzle);
  const { results, final } = evaluate(puzzle, blocks);
  return { blocks, results, final };
};
const statuses = (results: Map<string, { status: string; error?: string }>) =>
  [...results.values()].map(r => (r.error ? `${r.status}: ${r.error}` : r.status));

/*
 * A1, B1 and C1 sit in a row, so a star at either end eliminates the middle. That makes
 * "A1 or C1" a disjunction whose two arms prove the same thing by the same step, which is
 * exactly the shape or-elimination exists for -- and the arms need no statements at all,
 * since each assumption settles B1 on its own.
 */
const HELD_OR = '(or (is-star A1) (is-star C1))';

test('a held disjunction proves what both of its arms prove', () => {
  const { results, final } = run(`
    (claim ${HELD_OR} (sorry))
    (claim (is-elim B1)
      (or-elim ${HELD_OR} (left) (right)))
  `);
  assert.ok(statuses(results).every(s => s.startsWith('ok')), statuses(results).join(' / '));
  assert.equal(final.cells[1], 'elim', 'B1 follows from either disjunct');
});

test('or-elim refuses a disjunction that is not established', () => {
  const { results } = run(`
    (claim (is-elim B1)
      (or-elim ${HELD_OR} (left) (right)))
  `);
  assert.match(statuses(results).join(' / '), /not established/);
});

test('or-elim refuses a predicate that is not a disjunction', () => {
  const { results } = run(`
    (claim (is-elim B1)
      (or-elim (is-star A1) (left) (right)))
  `);
  assert.match(statuses(results).join(' / '), /disjunction|OR/i);
});

test('or-elim needs a goal to aim at', () => {
  const { results } = run(`
    (claim ${HELD_OR} (sorry))
    (or-elim ${HELD_OR} (left) (right))
  `);
  assert.match(statuses(results).join(' / '), /goal/);
});

test('an arm that does not reach the goal is an error', () => {
  // D1 is beside neither A1 nor C1, so neither assumption settles it.
  const { results } = run(`
    (claim ${HELD_OR} (sorry))
    (claim (is-elim D1)
      (or-elim ${HELD_OR} (left) (right)))
  `);
  assert.match(statuses(results).join(' / '), /both arms|arm/i);
});

test('each arm can use the disjunct it assumed', () => {
  // The star assumed in an arm is on that arm's board, so a step can name what follows.
  const { results } = run(`
    (claim ${HELD_OR} (sorry))
    (claim (is-elim B1)
      (or-elim ${HELD_OR}
        (left (elims row1))
        (right (elims row1))))
  `);
  assert.ok(statuses(results).every(s => s.startsWith('ok')), statuses(results).join(' / '));
});

test('or-elim round-trips through the text format', () => {
  const text = `(claim (is-elim B1)\n (or-elim ${HELD_OR} (left) (right)))`;
  const printed = printProof(parseProof(text, P), P).trim();
  assert.match(printed, /or-elim/);
  assert.equal(printProof(parseProof(printed, P), P).trim(), printed);
});

/*
 * Pruning walks a proof by its container bodies, so every block that holds statements has to
 * be registered there as well as in the engine. A container the pruner does not know is not
 * trimmed and its statements are not counted -- which is quiet, so it is worth a test.
 */
test('the pruner descends into every container that holds statements', async () => {
  const { allStatements } = await import('../src/saturate.ts');
  for (const [label, text] of [
    ['suppose', '(suppose S (is-star A1) (elims row1))'],
    ['or-elim', `(claim ${HELD_OR} (sorry))\n(claim (is-elim B1) (or-elim ${HELD_OR} (left (elims row1)) (right)))`],
  ] as const) {
    const blocks = parseProof(text, P);
    const flat = allStatements(blocks);
    assert.ok(flat.some(b => b.type === 'elims'),
      `allStatements should reach inside ${label}, saw ${flat.map(b => b.type).join(', ')}`);
  }
});
