// Layout of printed proofs: a statement that holds a body puts it on indented lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/engine.ts';
import { parseProof, printProof } from '../src/proofText.ts';
import { parseLevels } from '../src/puzzles.ts';
import levels from '../src/levels.json' with { type: 'json' };
import type { Puzzle, RawLevel } from '../src/types.ts';

const puzzles = parseLevels(levels as RawLevel[]);
const P: Puzzle = puzzles[0];

const fmt = (text: string, puzzle: Puzzle = P) => printProof(parseProof(text, puzzle), puzzle).trim();

test('a statement with no body stays on one line', () => {
  assert.equal(fmt('(stars row1)'), '(stars row1)');
  assert.equal(fmt('(split region1 p (clique A1 B1) (clique A2 B2))'),
    '(split region1 p (clique A1 B1) (clique A2 B2))');
});

test('a claim puts its body on indented lines', () => {
  assert.equal(fmt('(claim (is-elim A1) (sorry))'), [
    '(claim (is-elim A1)',
    '  (sorry)',
    ')',
  ].join('\n'));
});

test('an argument and a supposition break the same way', () => {
  assert.equal(fmt('(argument (stars row1) (elims row2))'), [
    '(argument',
    '  (stars row1)',
    '  (elims row2)',
    ')',
  ].join('\n'));
  assert.equal(fmt('(suppose S (is-star A1) (elims row1))'), [
    '(suppose S (is-star A1)',
    '  (elims row1)',
    ')',
  ].join('\n'));
});

test('nesting indents each level, through tagged sections too', () => {
  const text = '(claim (is-elim A1) (by-contradiction (body (stars row1)) (via region1)))';
  assert.equal(fmt(text), [
    '(claim (is-elim A1)',
    '  (by-contradiction',
    '    (body',
    '      (stars row1)',
    '    )',
    '    (via region1)',
    '  )',
    ')',
  ].join('\n'));
});

/*
 * `suppose` and `or-elim` were missing from the printer's list of body-holding forms, so
 * they printed flat. The layout now reads the boundary off the Sx the printer built rather
 * than matching names, so there is no list left to fall behind.
 */
test('or-elim breaks its arms', () => {
  const text = '(claim (is-elim A1) (or-elim (or (is-star B5) (is-elim B5))'
    + ' (left (stars row1)) (right (stars row2))))';
  const out = fmt(text);
  assert.match(out, /\n {2}\(or-elim/, `or-elim should start its own indented line:\n${out}`);
  assert.match(out, /\n {4}\(left\n {6}\(stars row1\)/, `arms should break:\n${out}`);
});

test('formatting is idempotent and reparses to the same text', () => {
  const texts = [
    '(claim (is-elim A1) (sorry))',
    '(argument (claim (is-elim A1) (by-contradiction (body (stars row1)) (via region1))))',
    '(suppose S (is-star A1) (elims row1))',
  ];
  for (const text of texts) {
    const once = fmt(text);
    assert.equal(fmt(once), once, `formatting should be a fixpoint for ${text}`);
  }
});

test('a status note sits on the opening line, and the text still parses', () => {
  const blocks = parseProof('(claim (is-elim A1) (sorry))', P);
  const { results } = evaluate(P, blocks);
  const annotated = printProof(blocks, P, results).trim();
  const first = annotated.split('\n')[0];
  assert.match(first, /^\(claim \(is-elim A1\) {2}; /, `note belongs on the head line:\n${annotated}`);
  // `;` runs to end of line, so the body below is still read: the annotated form is input.
  const again = parseProof(annotated, P);
  assert.equal(printProof(again, P).trim(), printProof(blocks, P).trim());
});
