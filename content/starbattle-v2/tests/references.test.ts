// Hypothesis references must survive anything that re-creates proof blocks:
// "load from text", Blockly copy/paste, duplicate, and cut-and-paste all hand
// blocks fresh ids. A reference therefore must never depend on a block's id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, legacyFactIds } from '../src/engine.ts';
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
const DEFINE_PROOF = '(define h row0)\n(clear h)';
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
  const blocks = parseProof('(define h row0)\n(define h row1)\n(clear h)\n(clear h)', puzzle);
  assert.deepEqual(outcomes(blocks), [
    'define: ok h: ★{A1 B1 C1 D1 E1} = 1',
    'define: ok h: ★{A2 B2 C2 D2 E2} = 1',
    'clear: ok deleted h',
    'clear: error that hypothesis is not available here',
  ]);
});

test('ids saved by older builds map to the ids facts carry now', () => {
  const blocks = parseProof(`(define h row0)
(claim (!= (count A1 B1) 1) (by-contradiction (body (clear _)) (via _)))`, puzzle);
  const ids = legacyFactIds(blocks);
  const bc = (blocks[1] as Extract<Block, { type: 'claim' }>).body[0];
  assert.equal(ids.get(`define:${blocks[0].id}`), 'h');
  // The live engine's assumption id for this by_contradiction must be what the legacy id maps to.
  const live = evaluate(puzzle, blocks).entries.get(bc.id)!.facts.find(f => f.label === 'assumption')!.id;
  assert.equal(ids.get(`contra-${bc.id}-0`), live);
  assert.equal(live, 'asm0_1=1');
});
