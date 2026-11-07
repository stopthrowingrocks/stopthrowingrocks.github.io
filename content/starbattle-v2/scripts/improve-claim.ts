/**
 * Look for a cheaper proof of one claim, with a wider search than the move generator uses
 * when it is scanning every cell at once.
 *
 *   npx tsx scripts/improve-claim.ts <index> <proofFile> <cell> [--time MS] [--nodes N]
 *
 * The generator has to be frugal because it supposes every unresolved cell in both
 * directions at every step; bodies are explored with forced moves only. Aimed at a single
 * cell that is already known to need a deep argument, that frugality is the wrong trade —
 * so this assumes the one cell and searches for a contradiction with the full move set.
 */
import { readFileSync } from 'node:fs';
import { assume, evaluate, initState } from '../src/engine';
import { parseProof, printProof } from '../src/proofText';
import { cellLabelToIndex, parseLevels } from '../src/puzzles';
import { runProof } from '../src/agentTool';
import { boardAdvancingMoves, contradictionMoves, forcedMoves, proofCost, search, statementCost } from '../src/search';
import levelsData from '../src/levels.json';
import type { Block, BoolExpr, PState, Puzzle } from '../src/types';

const args = process.argv.slice(2);
const index = Number(args[0]);
const file = args[1];
const cellLabel = args[2];
const flag = (name: string, fallback: number) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : Number(args[at + 1]);
};

const puzzle: Puzzle = parseLevels(levelsData)[index];
const blocks = parseProof(readFileSync(file, 'utf8'), puzzle);
const cell = cellLabelToIndex(cellLabel, puzzle.size);
if (cell === null) throw new Error(`${cellLabel} is not a cell on this board`);

// The statement that settles this cell, and the state it starts from.
const { results } = evaluate(puzzle, blocks);
let before: PState = initState(puzzle);
let at = -1;
for (let i = 0; i < blocks.length; i++) {
  const r = results.get(blocks[i].id);
  if (!r) continue;
  if (r.prev.cells[cell] === null && r.state.cells[cell] !== null) { at = i; break; }
  before = r.state;
}
if (at === -1) throw new Error(`no statement settles ${cellLabel}`);
const target = blocks[at];
const mark = results.get(target.id)!.state.cells[cell];
console.log(`${puzzle.name} #${puzzle.categoryIndex}: statement ${at + 1} settles ${cellLabel} as ${mark}`);
console.log(`it is a ${target.type} costing ${statementCost(target)}; proof costs ${proofCost(blocks)}\n`);

const pred: BoolExpr = { eid: 'goal', kind: mark === 'elim' ? 'is_elim' : 'is_star', cell };
const opened = assume(puzzle, before, { eid: 'neg', kind: 'not', a: pred });
if ('error' in opened) throw new Error(`cannot assume the opposite: ${opened.error}`);
console.log(`assuming ${cellLabel} is the opposite${opened.state.contradiction ? ' — immediately contradictory' : ''}`);

const budgets = [
  { label: 'forced moves only', generators: [forcedMoves] },
  { label: 'forced + derivations', generators: [forcedMoves, boardAdvancingMoves] },
  // Nested case analysis, which is what the hand proof reaches for here. Expensive: the
  // claim generator scans every unresolved cell at every state of the body search.
  { label: 'and nested claims', generators: [forcedMoves, boardAdvancingMoves, contradictionMoves] },
];
let best: { blocks: Block[]; cost: number } | null = null;

for (const { label, generators } of budgets) {
  const started = Date.now();
  const found = search(puzzle, opened.state, {
    goal: state => state.contradiction,
    generators,
    maxStatementCost: flag('ceiling', 5),
    maxNodes: flag('nodes', 400),
    timeLimitMs: flag('time', 300000),
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (!found.found) {
    console.log(`${label.padEnd(22)} no contradiction (${found.exhausted}) after ${found.nodes} states, ${seconds}s`);
    continue;
  }
  const broken = found.best.facts.find(f => f.impossible);
  if (!broken) {
    console.log(`${label.padEnd(22)} contradiction found but no impossible hypothesis to name`);
    continue;
  }
  const claim: Block = {
    id: `improved-${cell}`,
    type: 'claim',
    pred,
    body: [{
      id: `improved-bc-${cell}`,
      type: 'by_contradiction',
      body: found.blocks,
      contradiction: { eid: 'via', kind: 'ref', factId: broken.id },
    }],
  };
  const cost = statementCost(claim);
  console.log(`${label.padEnd(22)} contradiction in ${found.blocks.length} steps, claim costs ${cost} ` +
    `(${found.nodes} states, ${seconds}s)`);
  if (!best || cost < best.cost) best = { blocks: [claim], cost };
}

if (!best) {
  console.log('\nno cheaper proof found.');
  process.exit(0);
}
console.log(`\nbest replacement costs ${best.cost} against ${statementCost(target)}`);
const candidate = [...blocks.slice(0, at), ...best.blocks, ...blocks.slice(at + 1)];
const text = printProof(candidate, puzzle);
const check = runProof(puzzle, text);
console.log(`whole proof: cost ${proofCost(blocks)} -> ${proofCost(candidate)}, ` +
  `solved=${check.solved} errors=${check.errorCount}`);
if (check.solved && check.errorCount === 0) {
  const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
  if (out) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(out, `${text}\n`, 'utf8');
    console.log(`written to ${out}`);
  }
} else {
  console.log('the rest of the proof does not survive the swap — the suffix would need repairing.');
}
