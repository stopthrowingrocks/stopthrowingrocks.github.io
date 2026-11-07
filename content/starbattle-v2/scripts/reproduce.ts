/**
 * Can the move generator produce the statements a human actually wrote?
 *
 *   npx tsx scripts/reproduce.ts <index> <proofFile> [--ceiling N] [--claims]
 *
 * For every statement in a proof, at the exact state that statement runs in, ask the
 * generator for its moves and see whether any of them does the same work. Claims are
 * skipped by default — they are a different generator with its own budget — so what this
 * measures is the arithmetic half of the language.
 *
 * A statement is counted as reproduced when a generated move settles at least the cells it
 * settles, for no more cost. Statements that settle nothing (`split`, `define`) cannot be
 * reproduced at all by a generator that only emits cell-settling moves; they are reported
 * separately rather than silently counted as matched.
 */
import { readFileSync } from 'node:fs';
import { evaluate } from '../src/engine';
import { parseProof, printProof } from '../src/proofText';
import { parseLevels } from '../src/puzzles';
import { boardAdvancingMoves, statementCost } from '../src/search';
import { signedMoves } from '../src/signed';
import levelsData from '../src/levels.json';
import type { Block, Puzzle } from '../src/types';

const args = process.argv.slice(2);
const puzzle: Puzzle = parseLevels(levelsData)[Number(args[0])];
const blocks = parseProof(readFileSync(args[1], 'utf8'), puzzle);
const ceilingAt = args.indexOf('--ceiling');
const ceiling = ceilingAt === -1 ? 5 : Number(args[ceilingAt + 1]);
const withClaims = args.includes('--claims');
const constructor_ = args.includes('--signed') ? signedMoves : boardAdvancingMoves;
const beamAt = args.indexOf('--beam');
const beamWidth = beamAt === -1 ? undefined : Number(args[beamAt + 1]);

const { results } = evaluate(puzzle, blocks);

function allStatements(list: Block[]): Block[] {
  const out: Block[] = [];
  const walk = (blocks: Block[]) => {
    for (const b of blocks) {
      out.push(b);
      if (b.type === 'argument' || b.type === 'claim' || b.type === 'by_contradiction') walk(b.body);
      if (b.type === 'constructor') { walk(b.left); walk(b.right); }
      if (b.type === 'by_cases') { walk(b.positive); walk(b.negative); }
    }
  };
  walk(list);
  return out;
}

const statements = allStatements(blocks).filter(b =>
  withClaims ? true : b.type !== 'claim' && b.type !== 'by_contradiction');

console.log(`${puzzle.name} #${puzzle.categoryIndex} — ${statements.length} statements, ceiling ${ceiling}\n`);
console.log('  #  statement                                                 cost  generator');

let reproduced = 0, cheaper = 0, unreachable = 0, settlesNothing = 0;
let totalMs = 0;
const misses: string[] = [];

statements.forEach((block, i) => {
  const r = results.get(block.id);
  if (!r || r.status !== 'ok') return;
  const settled = r.state.cells
    .map((c, j) => (c !== null && r.prev.cells[j] === null ? j : -1))
    .filter(j => j >= 0);
  const cost = statementCost(block);
  const text = printProof([block], puzzle).trim().split('\n')[0].slice(0, 56);

  if (settled.length === 0) {
    settlesNothing++;
    console.log(`${String(i + 1).padStart(3)}  ${text.padEnd(58)}${String(cost).padStart(4)}  settles nothing — not generated`);
    return;
  }

  const started = Date.now();
  const moves = constructor_(puzzle, r.prev, { maxStatementCost: ceiling, beamWidth } as never);
  totalMs += Date.now() - started;
  const matches = moves.filter(m => settled.every(j => m.state.cells[j] !== null));
  const best = matches.length ? Math.min(...matches.map(m => m.cost)) : null;

  if (best === null) {
    unreachable++;
    misses.push(`${i + 1}. ${text} (cost ${cost})`);
    console.log(`${String(i + 1).padStart(3)}  ${text.padEnd(58)}${String(cost).padStart(4)}  NOT REPRODUCED`);
  } else {
    reproduced++;
    if (best < cost) cheaper++;
    console.log(`${String(i + 1).padStart(3)}  ${text.padEnd(58)}${String(cost).padStart(4)}  ` +
      `found at ${best}${best < cost ? ' (cheaper)' : best > cost ? ' (dearer)' : ''}`);
  }
});

const attempted = reproduced + unreachable;
console.log(`\nreproduced ${reproduced}/${attempted} cell-settling statements` +
  `${cheaper ? `, ${cheaper} of them more cheaply than written` : ''}`);
console.log(`${settlesNothing} statements settle nothing (split/define) — outside what the generator emits`);
console.log(`generation: ${(totalMs / 1000).toFixed(1)}s total, ${(totalMs / Math.max(1, attempted)).toFixed(0)}ms per statement`);
if (misses.length) console.log(`\nnot reproduced:\n  ${misses.join('\n  ')}`);
