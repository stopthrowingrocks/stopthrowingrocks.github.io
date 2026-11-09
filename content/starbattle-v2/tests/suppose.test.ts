// Suppositions: stored conditional derivations, and discharging them forward.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, initState } from '../src/engine.ts';
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

/** Every block's status, in reading order, so a test can say where it went wrong. */
const statuses = (results: Map<string, { status: string; error?: string }>) =>
  [...results.values()].map(r => (r.error ? `${r.status}: ${r.error}` : r.status));

test('a supposition records its body and leaves the outer state untouched', () => {
  const { results, final } = run(`
    (suppose S (is-star A1))
  `);
  assert.deepEqual(statuses(results), ['ok']);
  const start = initState(P);
  assert.deepEqual(final.cells, start.cells, 'the board outside is unchanged');
  assert.equal(final.suppositions.length, 1);
  assert.equal(final.suppositions[0].name, 'S');
  // A1 starred inside the body eliminates its neighbours there, and nowhere else.
  assert.equal(final.suppositions[0].cells[0], 'star');
  assert.equal(final.suppositions[0].cells[1], 'elim', 'B1 is adjacent to A1');
});

test('use is refused until the supposition is established', () => {
  const { results } = run(`
    (suppose S (is-star A1))
    (use S)
  `);
  const [, used] = statuses(results);
  assert.match(used, /not established/, `expected a refusal, got ${used}`);
});

test('use is refused for a supposition that was never made', () => {
  const { results } = run(`(use nope)`);
  assert.match(statuses(results)[0], /not available here/);
});

/*
 * These use `sorry` to establish the predicate. What is under test is `use` -- whether it
 * refuses an unestablished supposition and what it splices in once established -- not the
 * proof of the predicate, and `sorry` is the designed stand-in for a goal taken as given.
 */
test('a supposition proved by a claim can then be discharged', () => {
  // The body has to derive something the bare assumption does not, or there is nothing to
  // import: proving `is-star A1` already stars A1 and eliminates B1 beside it. Clearing the
  // rest of the row is the part that only follows inside the supposition.
  //
  // `row0` is the row A1 sits in: line fact ids count from zero while cell labels count
  //rows from one, so A1 is in `row0` and `row1` is the row below it.
  const { results, final } = run(`
    (suppose S (is-star A1) (elims row0))
    (claim (is-star A1) (sorry))
    (use S)
  `);
  const all = statuses(results);
  assert.ok(all.slice(0, 2).every(s => s === 'ok'), `the supposition should record: ${all.join(' / ')}`);
  assert.equal(all[all.length - 1], 'ok', `established, so use should hold: ${all.join(' / ')}`);
  assert.equal(final.cells[0], 'star');
  assert.equal(final.cells[2], 'elim', 'C1 was cleared only inside the supposition');
});

test('a supposition is invisible outside the body that made it', () => {
  const { results } = run(`
    (claim (is-elim A1) (suppose S (is-star B5)) (sorry))
    (use S)
  `);
  const used = statuses(results)[statuses(results).length - 1];
  assert.match(used, /not available here/, `a nested supposition should not escape: ${used}`);
});

test('a supposition inside an argument does flow out, since argument is grouping', () => {
  const { results, final } = run(`
    (argument (suppose S (is-star A1)))
  `);
  assert.ok(statuses(results).every(s => s === 'ok'), statuses(results).join(' / '));
  assert.equal(final.suppositions.length, 1);
});

test('two suppositions cannot share a name', () => {
  const { results } = run(`
    (suppose S (is-star A1))
    (suppose S (is-star B5))
  `);
  assert.match(statuses(results)[1], /already supposed/);
});

test('discharging twice adds nothing the second time', () => {
  const { results } = run(`
    (suppose S (is-star A1) (elims row0))
    (claim (is-star A1) (sorry))
    (use S)
    (use S)
  `);
  const all = statuses(results);
  assert.match(all[all.length - 1], /already know/, `a repeat should be a no-op: ${all.join(' / ')}`);
});

test('a supposition round-trips through the text format', () => {
  const text = '(suppose S (is-star A1)\n (elims row1))';
  const blocks = parseProof(text, P);
  const printed = printProof(blocks, P);
  const again = parseProof(printed, P);
  assert.equal(printProof(again, P).trim(), printed.trim());
  assert.equal(blocks[0].type, 'suppose');
});

test('a use survives its blocks getting new ids', () => {
  const text = '(suppose S (is-elim A1))\n(use S)';
  const blocks = parseProof(text, P).map((b, i) => ({ ...b, id: `fresh-${i}` }));
  const { results } = evaluate(P, blocks);
  // Still refused for the right reason -- by name, not because the reference broke.
  assert.match(statuses(results)[1], /not established/);
});

/*
 * The contrapositive, composed rather than built in.
 *
 * To get ~p from ~q: suppose p and derive q, then claim ~p by contradiction. Inside that
 * body p is the assumption, so p is established and the supposition discharges forward,
 * bringing in q -- which meets the ~q already known and closes the branch. No modus tollens
 * machinery is needed, which is why `use` takes a name and not an expression.
 */
test('the contrapositive composes from a forward use inside a by-contradiction', () => {
  const { results } = run(`
    (suppose S (is-star A1))
    (claim (is-elim A1) (by-contradiction (body (use S)) (via region1)))
  `);
  const all = statuses(results);
  assert.equal(all[0], 'ok', `the supposition should record: ${all.join(' / ')}`);
  // The use inside the body must be accepted: the by-contradiction assumed A1 is a star.
  assert.ok(!all.some(s => s.includes('not established')),
    `A1 is assumed inside the body, so the use should hold: ${all.join(' / ')}`);
});
