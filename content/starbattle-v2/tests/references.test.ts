// Hypothesis references must survive anything that re-creates proof blocks:
// "load from text", Blockly copy/paste, duplicate, and cut-and-paste all hand
// blocks fresh ids. A reference therefore must never depend on a block's id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, initState, legacyFactIds } from '../src/engine.ts';
import { parseProof, printProof } from '../src/proofText.ts';
import type { Block, BlockResult, Puzzle, RawLevel } from '../src/types.ts';
import levels from '../src/levels.json' with { type: 'json' };

const raw = (levels as RawLevel[])[0];
const puzzle: Puzzle = {
  name: raw.name ?? '', categoryIndex: 1, stars: raw.stars, size: raw.size,
  regions: raw.shapes.flatMap(row => [...row].map(c => parseInt(c, 36))),
};

/** Give every block (and expression node) a new id, as a paste or text import does. */
function relabel(blocks: Block[]): Block[] {
  return JSON.parse(JSON.stringify(blocks), (key, value) =>
    (key === 'id' || key === 'eid') && typeof value === 'string' ? `fresh-${value}` : value);
}

/** Status and message of each statement, in proof order. */
function outcomes(blocks: Block[]): string[] {
  const { results } = evaluate(puzzle, blocks);
  const out: string[] = [];
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      const r = results.get(b.id) as BlockResult;
      out.push(`${b.type}: ${r.status} ${r.error ?? r.note ?? ''}`.trim());
      if ('body' in b) walk(b.body);
      if (b.type === 'constructor') { walk(b.left); walk(b.right); }
      if (b.type === 'by_cases') { walk(b.positive); walk(b.negative); }
    }
  };
  walk(blocks);
  return out;
}

const statuses = (blocks: Block[]) => outcomes(blocks).map(line => line.split(' ').slice(0, 2).join(' '));

// ★{A1} = 0, proved by contradiction; the body deletes the assumption ★{A1} ≠ 0.
const DEFINE_PROOF = '(define h row1)\n(clear h)';
const ASSUMPTION_PROOF = '(claim (= (count A1) 0) (by-contradiction (body (clear _)) (via _)))';

/** The assumption proof, with its `clear` pointed at the assumption as the dropdown would offer it. */
function assumptionProof(): Block[] {
  // Relabel first so the proof carries non-parser ids, like blocks built in Blockly.
  const blocks = relabel(parseProof(ASSUMPTION_PROOF, puzzle));
  const bc = (blocks[0] as Extract<Block, { type: 'claim' }>).body[0] as Extract<Block, { type: 'by_contradiction' }>;
  const fact = evaluate(puzzle, blocks).entries.get(bc.id)!.facts.find(f => f.label === 'assumption');
  assert.ok(fact, 'by_contradiction should introduce an assumption fact');
  (bc.body[0] as Extract<Block, { type: 'clear' }>).factId = fact.id;
  return blocks;
}

test('a define reference survives blocks getting new ids', () => {
  const blocks = parseProof(DEFINE_PROOF, puzzle);
  assert.deepEqual(statuses(blocks), ['define: ok', 'clear: ok']);
  assert.deepEqual(outcomes(relabel(blocks)), outcomes(blocks));
});

test('an assumption reference survives blocks getting new ids', () => {
  const blocks = assumptionProof();
  assert.equal(outcomes(blocks)[2], 'clear: ok deleted assumption');
  assert.deepEqual(outcomes(relabel(blocks)), outcomes(blocks));
});

test('an assumption reference survives a text round trip', () => {
  const blocks = assumptionProof();
  assert.equal(outcomes(blocks)[2], 'clear: ok deleted assumption');
  const again = parseProof(printProof(blocks, puzzle), puzzle);
  assert.deepEqual(outcomes(again), outcomes(blocks));
});

test('redefining a name shadows the earlier definition, as in the text language', () => {
  const blocks = parseProof('(define h row1)\n(define h row2)\n(clear h)\n(clear h)', puzzle);
  assert.deepEqual(outcomes(blocks), [
    'define: ok h: ★{A1 B1 C1 D1 E1} = 1',
    'define: ok h: ★{A2 B2 C2 D2 E2} = 1',
    'clear: ok deleted h',
    'clear: error that hypothesis is not available here',
  ]);
});

test('ids saved by older builds map to the ids facts carry now', () => {
  const blocks = parseProof(`(define h row1)
(claim (!= (count A1 B1) 1) (by-contradiction (body (clear _)) (via _)))`, puzzle);
  const ids = legacyFactIds(blocks);
  const bc = (blocks[1] as Extract<Block, { type: 'claim' }>).body[0];
  assert.equal(ids.get(`define:${blocks[0].id}`), 'h');
  // The live engine's assumption id for this by_contradiction must be what the legacy id maps to.
  const live = evaluate(puzzle, blocks).entries.get(bc.id)!.facts.find(f => f.label === 'assumption')!.id;
  assert.equal(ids.get(`contra-${bc.id}-0`), live);
  assert.equal(live, 'asm0_1=1');
});

/*
 * Line names match the board: rows and regions count from one, columns are lettered as the
 * cell labels letter them. Builds before this counted all three from zero, so `row1` meant
 * the second row -- a rename that cannot be got wrong quietly, since a one-off shift leaves
 * a proof that still parses and still looks reasonable.
 */
test('line ids name the line the way the board does', () => {
  const ids = initState(puzzle).facts.map(f => f.id);
  assert.deepEqual(ids.slice(0, 5), ['row1', 'row2', 'row3', 'row4', 'row5']);
  assert.deepEqual(ids.slice(5, 10), ['colA', 'colB', 'colC', 'colD', 'colE']);
  assert.deepEqual(ids.slice(10, 15), ['region1', 'region2', 'region3', 'region4', 'region5']);
});

test('row1 is the row A1 sits in, and colA the column', () => {
  const state = initState(puzzle);
  const row = state.facts.find(f => f.id === 'row1')!;
  const col = state.facts.find(f => f.id === 'colA')!;
  assert.ok(row.cells.includes(0), 'A1 is cell 0 and belongs to row1');
  assert.ok(col.cells.includes(0), 'A1 is cell 0 and belongs to colA');
  // The trap this rename removes: the old scheme put cell 0 in `row0`, never in `row1`.
  assert.equal(state.facts.some(f => f.id === 'row0'), false);
  assert.equal(state.facts.some(f => f.id === 'col0'), false);
});

test('a line id survives a round trip through the text format', () => {
  const text = '(elims (- (+ row1 row2) (+ region1 colA)))';
  const printed = printProof(parseProof(text, puzzle), puzzle).trim();
  assert.match(printed, /row1/);
  assert.match(printed, /colA/);
  assert.equal(printProof(parseProof(printed, puzzle), puzzle).trim(), printed);
});
