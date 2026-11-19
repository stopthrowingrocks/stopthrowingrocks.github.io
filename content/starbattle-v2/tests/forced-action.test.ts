// Which hypotheses settle their own cells.
//
// `forcedAction` is the gate `stars` and `elims` test, and the hypothesis list paints a row
// blue by the same call — so a blue row is a row that step accepts. These cases pin the rule
// itself; the agreement between panel and step holds because there is one call, not two.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, forcedAction } from '../src/engine.ts';
import { parseProof } from '../src/proofText.ts';
import { parseLevels } from '../src/puzzles.ts';
import levels from '../src/levels.json' with { type: 'json' };
import type { BlockResult, Fact, FactOp, Puzzle, RawLevel } from '../src/types.ts';

const fact = (op: FactOp, target: number, cells: number, impossible = false): Fact =>
  ({ id: 'f', kind: 'derived', index: 0, op, target, cells: [...Array(cells).keys()], impossible });

test('an exact count as tight as its cells forces stars', () => {
  assert.equal(forcedAction(fact('=', 2, 2)), 'stars');
  assert.equal(forcedAction(fact('>=', 2, 2)), 'stars', 'at least 2 among 2 is both');
  assert.equal(forcedAction(fact('=', 1, 3)), null, 'one among three is a choice');
  assert.equal(forcedAction(fact('<=', 2, 2)), null, 'an upper bound forces nothing');
});

test('a count of zero forces eliminations', () => {
  assert.equal(forcedAction(fact('=', 0, 4)), 'elims');
  assert.equal(forcedAction(fact('<=', 0, 4)), 'elims');
  assert.equal(forcedAction(fact('>=', 0, 4)), null, 'at least zero says nothing');
  assert.equal(forcedAction(fact('=', 0, 0)), null, 'nothing left to cross out');
});

test('a ≠ fact settles only the cell it covers alone', () => {
  assert.equal(forcedAction(fact('!=', 0, 1)), 'stars', 'not empty, and one cell to fill');
  assert.equal(forcedAction(fact('!=', 1, 1)), 'elims', 'not a star, and one cell to clear');
  assert.equal(forcedAction(fact('!=', 0, 2)), null);
  assert.equal(forcedAction(fact('!=', 2, 1)), null, 'forbidding 2 over one cell is vacuous');
});

test('an impossible fact settles nothing', () => {
  // Its branch is already closed; there is no board left for it to advance.
  assert.equal(forcedAction(fact('=', 1, 0, true)), null);
  assert.equal(forcedAction(fact('=', 2, 2, true)), null);
});

/** 10x10 2★ #1: region4 is the T tetromino I1 J1 J2 J3. */
const P: Puzzle = parseLevels(levels as RawLevel[])[250];

test('the step reports why a hypothesis it refuses is not forced', () => {
  // The messages explain forcedAction's verdict rather than deciding it a second time.
  const cases: [string, string][] = [
    ['(stars region4)', 'not forced: 2 stars among 4 cells'],
    ['(stars (clique I1 J1))', 'an upper bound cannot force stars'],
    ['(elims region4)', 'not forced: 2 stars still needed among these cells'],
    ['(elims (- region4 (clique I1 J1)))', 'a lower bound cannot force eliminations'],
  ];
  for (const [text, message] of cases) {
    const blocks = parseProof(text, P);
    const { results } = evaluate(P, blocks);
    const r = results.get(blocks.at(-1)!.id) as BlockResult;
    assert.equal(r.error, message, text);
  }
});
