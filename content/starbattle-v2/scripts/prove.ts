/**
 * Prove a puzzle by saturation: sweep the board at rising prices, argue a case when
 * arithmetic stalls, then trim whatever later steps made redundant.
 *
 *   npx tsx scripts/prove.ts <index> [options]
 *   npx tsx scripts/prove.ts 5x5 [options]
 *
 * Options: --max-ceiling N   dearest statement to consider (default 6)
 *          --case-ceiling N  dearest statement inside a case argument (default 4)
 *          --beam N          signed partial combinations kept per round (default 24)
 *          --no-cases        arithmetic only
 *          --time MS         per puzzle
 *          --verbose         narrate each statement as it lands
 *          --out DIR         write each proof found to DIR/proof-<index>.lisp
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluate, initState, isSolved } from '../src/engine';
import { printProof } from '../src/proofText';
import { parseLevels } from '../src/puzzles';
import { runProof } from '../src/agentTool';
import { proofCost } from '../src/search';
import { allStatements, prove, prune } from '../src/saturate';
import levelsData from '../src/levels.json';
import type { Block, Puzzle } from '../src/types';

const args = process.argv.slice(2);
const target = args[0];
if (!target) {
  console.error('Usage: prove <index|5x5> [--max-ceiling N] [--case-ceiling N] [--no-cases] [--time MS] [--verbose] [--out DIR]');
  process.exit(1);
}
const flag = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
};
const num = (name: string, fallback: number) => Number(flag(name) ?? fallback);

const puzzles: Puzzle[] = parseLevels(levelsData);
const outDir = flag('out');
if (outDir) mkdirSync(outDir, { recursive: true });

/** Drop statements the proof still holds without, nested ones included. */
function trim(puzzle: Puzzle, blocks: Block[]): Block[] {
  return prune(blocks, list => {
    const { results, final } = evaluate(puzzle, list);
    for (const r of results.values()) if (r.status !== 'ok') return false;
    return isSolved(final);
  });
}

function run(index: number, quiet: boolean): { solved: boolean; cost: number; steps: number; ms: number; note: string } {
  const puzzle = puzzles[index];
  const result = prove(puzzle, initState(puzzle), {
    maxCeiling: num('max-ceiling', 6),
    caseCeiling: num('case-ceiling', 4),
    noCases: args.includes('--no-cases'),
    // Signed elimination prunes to this many partial combinations per round, so it bounds
    // which combinations exist to be priced at all — a separate limit from the ceiling, and
    // the one that decides whether a deep multi-line cancellation is ever reached.
    beamWidth: num('beam', 24),
    // States explored inside a by-contradiction body. Defaults to 30 and nothing in the
    // repo ever set it, so every case argument so far has been given 30 states to find a
    // contradiction in — enough on a 5x5, nothing like enough on a 14x14.
    contradictionBodyNodes: num('body-nodes', 30),
    timeLimitMs: num('time', 600000),
    onProgress: args.includes('--verbose') && !quiet ? note => console.log(`   ${note}`) : undefined,
  });
  if (!result.solved) {
    const proven = result.state.cells.filter(c => c !== null).length;
    // Saturation still found real statements before it stalled; keep them. The
    // board is unsolved, so `trim` does not apply — its invariant is "comes out
    // solved" — and `prune-partial.ts` is the tool that trims these instead.
    if (result.blocks.length) {
      const text = printProof(result.blocks, puzzle);
      if (outDir) writeFileSync(join(outDir, `partial-${index}.lisp`), `${text}\n`, 'utf8');
      if (!quiet) console.log(`\n${text}\n`);
    }
    return { solved: false, cost: result.cost, steps: allStatements(result.blocks).length, ms: result.ms,
      note: `stuck at ${proven}/${puzzle.size ** 2} cells` };
  }
  const trimmed = trim(puzzle, result.blocks);
  const text = printProof(trimmed, puzzle);
  const check = runProof(puzzle, text);
  if (!check.solved || check.errorCount > 0) {
    return { solved: false, cost: 0, steps: 0, ms: result.ms, note: `FAILED VERIFICATION (${check.errorCount} errors)` };
  }
  if (outDir) writeFileSync(join(outDir, `proof-${index}.lisp`), `${text}\n`, 'utf8');
  if (!quiet) {
    console.log(`\n${text}\n`);
    console.log(`cost ${result.cost} -> ${proofCost(trimmed)} after trimming, ` +
      `${allStatements(result.blocks).length} -> ${allStatements(trimmed).length} statements`);
  }
  return { solved: true, cost: proofCost(trimmed), steps: allStatements(trimmed).length, ms: result.ms, note: '' };
}

if (target === '5x5') {
  const indices = puzzles.map((p, i) => [p, i] as const).filter(([p]) => p.size === 5).map(([, i]) => i);
  console.log('index  cost  steps      ms  result');
  let solved = 0;
  const costs: number[] = [];
  const started = Date.now();
  for (const index of indices) {
    const r = run(index, true);
    if (r.solved) { solved++; costs.push(r.cost); }
    console.log(`${String(index).padStart(5)}  ${String(r.solved ? r.cost : '-').padStart(4)}  ` +
      `${String(r.solved ? r.steps : '-').padStart(5)}  ${String(r.ms).padStart(6)}  ${r.solved ? 'solved' : r.note}`);
  }
  console.log(`\nsolved ${solved}/${indices.length} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (costs.length) {
    console.log(`cost: min ${Math.min(...costs)}, max ${Math.max(...costs)}, ` +
      `mean ${(costs.reduce((a, b) => a + b, 0) / costs.length).toFixed(1)}`);
  }
} else {
  const index = Number(target);
  const puzzle = puzzles[index];
  console.log(`${puzzle.name} #${puzzle.categoryIndex} (index ${index})`);
  const r = run(index, false);
  console.log(`${r.solved ? `solved: cost ${r.cost} over ${r.steps} statements` : r.note} in ${(r.ms / 1000).toFixed(1)}s`);
  if (!r.solved) process.exit(2);
}
