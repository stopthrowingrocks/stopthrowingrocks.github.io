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
import { parseProof, printGoal, printProof } from '../src/proofText.ts';
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

/*
 * A conjunction of cell goals, met by the board rather than by facts.
 *
 * `normalize` drops a cell from every fact as soon as it settles, so the literals of an `and`
 * cannot be matched against facts once the cells are known. A single cell goal was always read
 * off the board; a conjunction has to be too, or one case split cannot discharge two
 * conclusions -- its shared goal would have to be a conjunction nothing could satisfy.
 */
test('a conjunction of cell goals is satisfied by settled cells', () => {
  const text = '(stars (bound >= 1 A1))\n'
    + '(claim (and (is-elim B1) (is-elim A2)) (argument))';
  const blocks = parseProof(text, P);
  const { results } = evaluate(P, blocks);
  const all = [...results.values()];
  // Starring A1 eliminates its neighbours, so both conjuncts hold on the board.
  assert.equal(all[0].status, 'ok', all[0].error);
  assert.equal(all[1].status, 'ok',
    `a conjunction of two settled cells should hold: ${all[1].error}`);
});

test('a conjunction is refused when only one half holds', () => {
  // E5 is nowhere near A1, so starring A1 says nothing about it.
  const text = '(stars (bound >= 1 A1))\n'
    + '(claim (and (is-elim B1) (is-elim E5)) (argument))';
  const { results } = evaluate(P, parseProof(text, P));
  const errors = [...results.values()].filter(r => r.status === 'error');
  assert.equal(errors.length, 1, 'the conjunction must fail while E5 is untouched');
  assert.match(errors[0].error!, /goal was not proved/);
});

/*
 * A count goal met by the board rather than by a matching fact.
 *
 * `normalize` deletes a cell from every fact the moment it settles, so a count whose cells are
 * all resolved has no fact left naming it even though its value is certain. Requiring the fact
 * made a conclusion unstatable in exactly the branch that settled it hardest, which blocked
 * two arms of a case split from stating one shared conclusion the same way.
 */
test('a count goal is satisfied by settled cells with no fact naming them', () => {
  // Starring A1 eliminates B1, so ★{A1 B1} = 1 is certain -- and no fact spans both cells.
  const text = '(stars (bound >= 1 A1))\n(claim (= (count A1 B1) 1) (argument))';
  const { results, final } = evaluate(P, parseProof(text, P));
  const all = [...results.values()];
  assert.equal(all[0].status, 'ok', all[0].error);
  assert.equal(final.cells[0], 'star');
  assert.equal(final.cells[1], 'elim');
  assert.ok(!final.facts.some(f => f.cells.length === 2 && f.cells.includes(0) && f.cells.includes(1)),
    'no fact should span both cells once they are settled');
  assert.equal(all[all.length - 1].status, 'ok',
    `the count is known from the board: ${all[all.length - 1].error}`);
});

test('a count goal the board contradicts is still refused', () => {
  const text = '(stars (bound >= 1 A1))\n(claim (= (count A1 B1) 2) (argument))';
  const { results } = evaluate(P, parseProof(text, P));
  const errors = [...results.values()].filter(r => r.status === 'error');
  assert.equal(errors.length, 1, 'A1 is a star and B1 is eliminated, so the count is 1, not 2');
});

/*
 * The goal and assumptions in force at each step, which the GUI shows under the facts list.
 *
 * These are recorded separately from the proof obligation the engine threads, because the two
 * come apart: a `by-contradiction` body owes a contradiction while the claim around it still
 * owes its goal. A step several branches deep cannot be read without both.
 */
test('each step records the goal and the assumptions over it', () => {
  const text = '(claim (is-elim A1) (by-contradiction (body (elims row1)) (via row1)))';
  const blocks = parseProof(text, P);
  const { results } = evaluate(P, blocks);
  const claim = results.get(blocks[0].id)!;
  // The claim itself sits at the top level: nothing is being proved around it, nothing assumed.
  assert.equal(claim.goal ?? null, null);
  assert.deepEqual(claim.assumed, []);
  // Its body is inside the claim and under the negation of the goal.
  const inner = [...results.entries()].find(([id]) => id !== blocks[0].id
    && results.get(id)!.assumed?.length)!;
  assert.ok(inner, 'some step should be under an assumption');
  const ctx = inner[1];
  assert.equal(printGoal(ctx.goal!, P), '(is-elim A1)', 'the claim goal is carried into the body');
  assert.equal(ctx.assumed!.length, 1);
  assert.equal(printGoal(ctx.assumed![0], P), '(is-star A1)',
    'a by-contradiction assumes the negation, and a negated elim is a star');
});

test('assumptions stack through nested arguments', () => {
  const text = '(claim (is-elim A1)'
    + ' (by-contradiction (body'
    + '   (claim (is-elim B5) (by-contradiction (body (elims row1)) (via row1)))'
    + ' ) (via row1)))';
  const { results } = evaluate(P, parseProof(text, P));
  const deepest = [...results.values()]
    .reduce((best, r) => ((r.assumed?.length ?? 0) > (best.assumed?.length ?? 0) ? r : best));
  assert.equal(deepest.assumed!.length, 2, 'two by-contradictions deep means two assumptions');
  assert.deepEqual(deepest.assumed!.map(a => printGoal(a, P)), ['(is-star A1)', '(is-star B5)']);
  assert.equal(printGoal(deepest.goal!, P), '(is-elim B5)', 'the nearest claim is what is being proved');
});
