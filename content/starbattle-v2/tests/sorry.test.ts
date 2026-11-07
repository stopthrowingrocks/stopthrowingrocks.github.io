// `sorry` admits a goal rather than proving it: the proof carries on, and says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containsSorry, evaluate, initState } from '../src/engine.ts';
import { parseProof, printProof } from '../src/proofText.ts';
import { parseLevels } from '../src/puzzles.ts';
import { runProof } from '../src/agentTool.ts';
import { proofCost } from '../src/search.ts';
import levels from '../src/levels.json' with { type: 'json' };
import type { Block, BlockResult, Puzzle, RawLevel } from '../src/types.ts';

const puzzles = parseLevels(levels as RawLevel[]);
const PUZZLE: Puzzle = puzzles[0];   // 5x5 1★: region 2 is D1 E1 B2 C2 D2 E2 C3 D3 E3

function outcomes(puzzle: Puzzle, text: string): string[] {
  const blocks = parseProof(text, puzzle);
  const { results } = evaluate(puzzle, blocks);
  const out: string[] = [];
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      const r = results.get(b.id) as BlockResult;
      out.push(`${b.type}: ${r.status}${r.error ? ' ' + r.error : r.note ? ' ' + r.note : ''}`);
      if ('body' in b) walk(b.body);
    }
  };
  walk(blocks);
  return out;
}

test('a claim can be admitted instead of proved', () => {
  const lines = outcomes(PUZZLE, '(claim (is-elim A1) (sorry))');
  assert.equal(lines[0], 'claim: ok proved: ★{A1} = 0');
  assert.equal(lines[1], 'sorry: ok admitted without proof');
});

test('an admitted claim still gives you its conclusion', () => {
  const blocks = parseProof('(claim (is-elim A1) (sorry))', PUZZLE);
  const { final } = evaluate(PUZZLE, blocks);
  assert.equal(final.cells[0], 'elim', 'the claim should mark the board as if proved');
});

test('a by-contradiction body can be admitted, with no contradictory hypothesis', () => {
  const lines = outcomes(PUZZLE, '(claim (is-elim A1) (by-contradiction (body (sorry)) (via _)))');
  assert.equal(lines[0], 'claim: ok proved: ★{A1} = 0');
  assert.equal(lines[1], 'by_contradiction: ok admitted without proof');
});

test('an admission does not leak out of the claim that used it', () => {
  const blocks = parseProof('(claim (is-elim A1) (sorry))', PUZZLE);
  const { final } = evaluate(PUZZLE, blocks);
  assert.equal(final.admitted, false, 'the outer proof state is not itself admitted');
});

test('an admission carries out of a plain argument', () => {
  const blocks = parseProof('(claim (is-elim A1) (argument (sorry)))', PUZZLE);
  const { results } = evaluate(PUZZLE, blocks);
  assert.equal((results.get(blocks[0].id) as BlockResult).status, 'ok');
});

test('a proof that admits nothing is not reported as admitted', () => {
  assert.equal(containsSorry(parseProof('(elims (- row0 region1))', PUZZLE)), false);
});

test('an admission anywhere is found, however deeply nested', () => {
  const blocks = parseProof('(claim (is-elim A1) (by-contradiction (body (argument (sorry))) (via _)))', PUZZLE);
  assert.equal(containsSorry(blocks), true);
});

test('the report says a solved board rests on an admission', () => {
  const report = runProof(PUZZLE, '(claim (is-elim A1) (sorry))');
  assert.equal(report.admitted, true);
  assert.equal(report.errorCount, 0);
});

test('sorry round-trips through the text format', () => {
  const text = '(claim (is-elim A1) (sorry))';
  const blocks = parseProof(text, PUZZLE);
  assert.equal(printProof(blocks, PUZZLE).trim(), text);
});

test('sorry costs one, like any other statement', () => {
  assert.equal(proofCost(parseProof('(sorry)', PUZZLE)), 1);
  assert.equal(proofCost(parseProof('(claim (is-elim A1) (sorry))', PUZZLE)), 3);
});

test('a bare sorry proves nothing', () => {
  const blocks = parseProof('(sorry)', PUZZLE);
  const { final } = evaluate(PUZZLE, blocks);
  assert.equal(final.cells.filter(c => c !== null).length, 0);
  assert.equal(initState(PUZZLE).admitted, false);
  assert.equal(final.admitted, true, 'it marks the proof, even with nothing to close');
});
