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
  // `row1` is the row A1 sits in: line fact ids count from zero while cell labels count
  //rows from one, so A1 is in `row1` and `row2` is the row below it.
  const { results, final } = run(`
    (suppose S (is-star A1) (elims row1))
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
    (suppose S (is-star A1) (elims row1))
    (claim (is-star A1) (sorry))
    (use S)
    (use S)
  `);
  const all = statuses(results);
  assert.match(all[all.length - 1], /already know/, `a repeat should be a no-op: ${all.join(' / ')}`);
});

test('a supposition round-trips through the text format', () => {
  const text = '(suppose S (is-star A1)\n (elims row2))';
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
    (claim (is-elim A1) (by-contradiction (body (use S)) (via region2)))
  `);
  const all = statuses(results);
  assert.equal(all[0], 'ok', `the supposition should record: ${all.join(' / ')}`);
  // The use inside the body must be accepted: the by-contradiction assumed A1 is a star.
  assert.ok(!all.some(s => s.includes('not established')),
    `A1 is assumed inside the body, so the use should hold: ${all.join(' / ')}`);
});

/*
 * Selecting a block shows its `scope` if it has one, else the state after it (App.tsx). A
 * supposition deliberately leaves the outer board untouched, so without a scope, focusing one
 * would show the single board the block says nothing about -- the outer one. It reports the
 * body's end state instead: the board under the supposition, with the body applied.
 */
test('focusing a supposition shows the context inside it', () => {
  const blocks = parseProof('(suppose S (is-star A1) (elims row1))', P);
  const { results } = evaluate(P, blocks);
  const inside = results.get(blocks[0].id)!;
  assert.equal(inside.status, 'ok');
  assert.ok(inside.scope, 'a supposition reports the board inside it');
  assert.equal(inside.scope!.cells[0], 'star', 'A1 is starred under the supposition');
  assert.equal(inside.scope!.cells[2], 'elim', 'C1 was cleared by the body');
  // ...while the state the proof carries on with is untouched.
  assert.equal(inside.state.cells[0], null, 'nothing escapes to the outer board');
  assert.equal(inside.prev.cells[0], null);
});

/*
 * Nesting: a supposition made inside another is conditional on the outer one, so discharging
 * the outer hands it over. Without that it was unreachable -- the inner record died with the
 * body that held it, even once its condition had been met, so nesting a supposition was a way
 * to lose it.
 */
test('using a supposition exposes the suppositions made inside it', () => {
  const { blocks, results, final } = run(`
    (suppose S (is-star A1)
      (elims row1)
      (suppose T (is-star B5) (elims row5)))
    (claim (is-star A1) (sorry))
    (use S)
  `);
  assert.ok(!statuses(results).some(s => s.startsWith('error')), statuses(results).join(' / '));
  // Before the discharge only S is in scope; T lives inside its body.
  assert.equal(final.suppositions.filter(s => s.name === 'T').length, 1,
    `T should be available after using S: ${final.suppositions.map(s => s.name).join(', ')}`);
  const used = results.get(blocks[blocks.length - 1].id)!;
  assert.match(used.note ?? '', /exposes T/, `the use should say what it handed over: ${used.note}`);
});

test('a supposition records only the suppositions its own body made', () => {
  // `is-star A1` is satisfiable on this board; a predicate that contradicts at once would
  // skip the body as unreachable and record nothing inside it.
  const { final } = run(`
    (suppose P (is-elim A1))
    (suppose S (is-star A1) (suppose T (is-star B5)))
  `);
  const S = final.suppositions.find(s => s.name === 'S')!;
  // P was in scope when S opened, so S inherits it; re-recording it would duplicate P on
  // every discharge of S.
  assert.deepEqual(S.suppositions.map(s => s.name), ['T']);
  assert.deepEqual(final.suppositions.find(s => s.name === 'P')!.suppositions, []);
});

test('exposing does not clobber a supposition already in scope', () => {
  const { results, final } = run(`
    (suppose S (is-star A1)
      (elims row1)
      (suppose T (is-star B5) (elims row5)))
    (suppose T (is-star C3))
    (claim (is-star A1) (sorry))
    (use S)
  `);
  assert.ok(!statuses(results).some(s => s.startsWith('error')), statuses(results).join(' / '));
  const named = final.suppositions.filter(s => s.name === 'T');
  assert.equal(named.length, 1, 'one T, not two');
  // The outer T is the one that was already established here; the inner one does not replace it.
  assert.equal(named[0].pred.kind, 'is_star');
  assert.equal((named[0].pred as { cell: number }).cell, 2 * P.size + 2, 'C3, the outer T');
});

/*
 * Closing an arm on a contradictory board, with nothing connected.
 *
 * `use` can mark the state contradictory through the cells: the record says one thing about a
 * cell and the board already says another. No count is left impossible when that happens, so
 * there is no hypothesis for a `via` to name, and requiring one made a finished argument
 * unclosable. The body having reached falsity is itself what closes the goal.
 */
test('a by-contradiction closes on a cell conflict from use, with no via', () => {
  const { results, final } = run(`
    (suppose S (is-elim E5) (claim (is-star C3) (sorry)))
    (claim (is-star C3)
      (by-contradiction
        (body
          (claim (is-elim E5) (sorry))
          (use S))))
  `);
  const all = statuses(results);
  assert.ok(!all.some(s => s.startsWith('error')), all.join(' / '));
  assert.equal(final.cells[2 * P.size + 2], 'star', 'C3 is proved a star');
  // The point of the change: nothing was impossible, so no `via` could have been supplied.
  assert.ok(!final.facts.some(f => f.impossible), 'the contradiction was in the cells, not a count');
});

test('a by-contradiction whose body is not contradictory still demands a via', () => {
  const { results } = run(`
    (claim (is-elim C1) (by-contradiction (body)))
  `);
  assert.match(statuses(results)[0], /connect the contradictory hypothesis/);
});

test('a by-contradiction with no via round-trips through the text format', () => {
  const text = '(claim (is-star C3)\n  (by-contradiction\n    (body\n      (sorry))))';
  const blocks = parseProof(text, P);
  const printed = printProof(blocks, P);
  assert.ok(!printed.includes('via'), `no empty via section should be printed:\n${printed}`);
  assert.equal(printProof(parseProof(printed, P), P).trim(), printed.trim());
});
