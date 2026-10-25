// `split` proves each part of a partition is exactly tight: if a line holds N stars,
// the parts are disjoint, cover it exactly, and their upper bounds total N, then no part
// can fall short of its bound without the total missing N.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/engine.ts';
import { parseProof, printProof } from '../src/proofText.ts';
import { parseLevels, factName } from '../src/puzzles.ts';
import type { Block, BlockResult, Fact, PState, Puzzle, RawLevel } from '../src/types.ts';
import levels from '../src/levels.json' with { type: 'json' };

const puzzles = parseLevels(levels as RawLevel[]);
/** 10x10 2★: region9 is E10 F10 G10 H10 — two king-move dominoes. */
const EXACT: Puzzle = puzzles[254];
/** 14x14 3★: region10 is C10 D10 E10 F10 F11 G11 — three dominoes. */
const LOWER: Puzzle = puzzles[351];

function run(puzzle: Puzzle, text: string): { outcomes: string[]; final: PState; blocks: Block[] } {
  const blocks = parseProof(text, puzzle);
  const { results, final } = evaluate(puzzle, blocks);
  const outcomes = blocks.map(b => {
    const r = results.get(b.id) as BlockResult;
    return `${r.status}${r.error ? ': ' + r.error : r.note ? ': ' + r.note : ''}`;
  });
  return { outcomes, final, blocks };
}

const last = (puzzle: Puzzle, text: string): string => run(puzzle, text).outcomes.at(-1)!;
const fact = (state: PState, id: string): Fact | undefined => state.facts.find(f => f.id === id);
const shape = (f: Fact | undefined): string =>
  f ? `${f.op} ${f.target} over ${f.cells.length} cells` : 'missing';

const SPLIT_EXACT = '(split region9 _ (clique E10 F10) (clique G10 H10))';

test('an exact count splits into forced parts', () => {
  const { outcomes, final } = run(EXACT, SPLIT_EXACT);
  assert.equal(outcomes.at(-1)?.startsWith('ok'), true, outcomes.at(-1));
  assert.equal(shape(fact(final, 'region9-1')), '= 1 over 2 cells');
  assert.equal(shape(fact(final, 'region9-2')), '= 1 over 2 cells');
});

test('the parts are named after the hypothesis being split', () => {
  const { final } = run(EXACT, SPLIT_EXACT);
  assert.equal(factName(fact(final, 'region9-1')!), 'region 10-1');
});

test('`as` names the parts instead', () => {
  const { final } = run(EXACT, '(split region9 p (clique E10 F10) (clique G10 H10))');
  assert.equal(shape(fact(final, 'p-1')), '= 1 over 2 cells');
  assert.equal(shape(fact(final, 'p-2')), '= 1 over 2 cells');
  assert.equal(fact(final, 'region9-1'), undefined);
});

test('everything that went in is still there afterwards', () => {
  const { final } = run(EXACT, SPLIT_EXACT);
  assert.ok(fact(final, 'region9'), 'the split hypothesis should remain');
  assert.equal(final.facts.filter(f => f.id.startsWith('split:')).length, 0, 'no temporaries left behind');
});

test('a lower bound splits too', () => {
  const { outcomes, final } = run(LOWER, [
    '(define low (- region10 (clique C10 D10)))',
    '(split low _ (clique E10 F10) (clique F11 G11))',
  ].join('\n'));
  assert.equal(outcomes[0].startsWith('ok'), true, outcomes[0]);
  assert.equal(outcomes[1].startsWith('ok'), true, outcomes[1]);
  assert.equal(shape(fact(final, 'low-1')), '= 1 over 2 cells');
  assert.equal(shape(fact(final, 'low-2')), '= 1 over 2 cells');
});

test('an upper bound cannot be split', () => {
  assert.equal(
    last(EXACT, '(split (clique E10 F10) p (bound <= 1 E10) (bound <= 1 F10))'),
    'error: split needs an exact count or a lower bound',
  );
});

test('a part that is a lower bound is rejected', () => {
  assert.equal(
    last(EXACT, '(split region9 p (clique E10 F10) (- region9 (clique E10 F10)))'),
    'error: each part needs an exact count or an upper bound',
  );
});

test('overlapping parts are rejected', () => {
  assert.equal(
    last(EXACT, '(split region9 p (clique E10 F10) (clique F10 G10))'),
    'error: F10 is in more than one part',
  );
});

test('parts that miss a cell are rejected', () => {
  assert.equal(
    last(EXACT, '(split region9 p (clique E10 F10) (bound <= 1 G10))'),
    'error: the parts do not cover region 10: H10 is missing',
  );
});

test('parts reaching outside the hypothesis are rejected', () => {
  assert.equal(
    last(EXACT, '(split region9 p (clique E10 F10) (clique G10 H10) (bound <= 1 A1))'),
    'error: the parts do not cover region 10: A1 is not in it',
  );
});

test('parts whose bounds do not total the count are rejected', () => {
  assert.equal(
    last(EXACT, '(split region9 p (bound <= 1 E10) (bound <= 1 F10) (bound <= 1 G10) (bound <= 1 H10))'),
    'error: the parts total 4 but region 10 needs 2',
  );
});

test('a split needs at least two parts', () => {
  assert.equal(last(EXACT, '(split region9 p (clique E10 F10))'), 'error: add at least two parts');
});

test('a split of an unnamed hypothesis needs its own name', () => {
  assert.equal(
    last(LOWER, '(split (- region10 (clique C10 D10)) _ (clique E10 F10) (clique F11 G11))'),
    'error: give this split a name with "as"',
  );
});

test('a result name that already exists is rejected', () => {
  assert.equal(
    last(EXACT, '(define p-1 row0)\n(split region9 p (clique E10 F10) (clique G10 H10))'),
    'error: p-1 is already defined',
  );
});

test('a split round-trips through the text format', () => {
  const withName = '(split region9 p (clique E10 F10) (clique G10 H10))';
  for (const text of [SPLIT_EXACT, withName]) {
    const blocks = parseProof(text, EXACT);
    const printed = printProof(blocks, EXACT);
    assert.equal(printed.trim(), text, 'printed form should match the input');
    assert.deepEqual(run(EXACT, printed).outcomes, run(EXACT, text).outcomes);
  }
});

test('split references survive blocks getting new ids', () => {
  const blocks = parseProof(SPLIT_EXACT + '\n(clear region9-1)', EXACT);
  const relabelled = JSON.parse(JSON.stringify(blocks), (key, value) =>
    (key === 'id' || key === 'eid') && typeof value === 'string' ? `fresh-${value}` : value) as Block[];
  const outcomes = (bs: Block[]) => {
    const { results } = evaluate(EXACT, bs);
    return bs.map(b => (results.get(b.id) as BlockResult).status);
  };
  assert.deepEqual(outcomes(blocks), ['ok', 'ok']);
  assert.deepEqual(outcomes(relabelled), outcomes(blocks));
});
