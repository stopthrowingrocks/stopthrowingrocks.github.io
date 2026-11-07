/**
 * Search for the cheapest proof of a puzzle, in the same block language the app uses.
 *
 *   npx tsx scripts/search.ts <index> [options]     one puzzle, printing the proof
 *   npx tsx scripts/search.ts 5x5 [options]         every 5x5 board, as a table
 *
 * Options: --max-nodes N  --time-limit MS  --max-cost N
 *          --max-statement-cost N
 *          --out DIR      write each proof found to DIR/proof-<index>.lisp
 *
 * Every proof found is re-parsed and re-evaluated through `runProof` before being
 * reported, so a bug in the search cannot produce a proof that does not hold up.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { initState, opSymbol } from '../src/engine';
import { printProof } from '../src/proofText';
import { factName, parseLevels, posLabel } from '../src/puzzles';
import { runProof } from '../src/agentTool';
import { proofCost, search, type SearchOptions } from '../src/search';
import levelsData from '../src/levels.json';
import type { Puzzle } from '../src/types';

const puzzles: Puzzle[] = parseLevels(levelsData);

function usage(): never {
  console.error(`Usage:
  search <index>   search one puzzle and print the proof
  search 5x5       search every 5x5 board and print a summary

Options:
  --max-nodes N      states to expand before giving up (default 20000)
  --time-limit MS    wall clock per puzzle (default 20000)
  --max-cost N       stop once the cheapest unexplored proof costs more than N
  --max-statement-cost N  the most one statement may cost (default 5)
  --out DIR          write each proof found to DIR/proof-<index>.lisp`);
  process.exit(1);
}

const args = process.argv.slice(2);
const target = args[0];
if (!target) usage();

const flag = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
};
const num = (name: string): number | undefined => {
  const raw = flag(name);
  return raw === undefined ? undefined : Number(raw);
};

const options: SearchOptions = {
  maxNodes: num('max-nodes'),
  timeLimitMs: num('time-limit'),
  maxCost: num('max-cost'),
  maxStatementCost: num('max-statement-cost'),
  sleepSets: args.includes('--sleep-sets'),
};
const outDir = flag('out');
if (outDir) mkdirSync(outDir, { recursive: true });

/** Search one puzzle, verify whatever it finds, and report. */
function attempt(index: number): { solved: boolean; cost: number; steps: number; nodes: number; ms: number; note: string } {
  const puzzle = puzzles[index];
  const result = search(puzzle, initState(puzzle), options);
  if (!result.found) {
    const proven = result.best.cells.filter(c => c !== null).length;
    return {
      solved: false, cost: 0, steps: 0, nodes: result.nodes, ms: result.ms,
      note: `stuck at ${proven}/${puzzle.size * puzzle.size} cells (${result.exhausted})`,
    };
  }
  const text = printProof(result.blocks, puzzle);
  const check = runProof(puzzle, text);
  if (!check.ok || !check.solved || check.errorCount > 0) {
    return {
      solved: false, cost: result.cost, steps: result.blocks.length, nodes: result.nodes, ms: result.ms,
      note: `FAILED VERIFICATION: ${check.parseError ?? `${check.errorCount} errors, solved=${check.solved}`}`,
    };
  }
  const stated = proofCost(result.blocks);
  if (stated !== result.cost) {
    return {
      solved: false, cost: result.cost, steps: result.blocks.length, nodes: result.nodes, ms: result.ms,
      note: `COST MISMATCH: search says ${result.cost}, proof costs ${stated}`,
    };
  }
  if (outDir) writeFileSync(join(outDir, `proof-${index}.lisp`), `${text}\n`, 'utf8');
  return { solved: true, cost: result.cost, steps: result.blocks.length, nodes: result.nodes, ms: result.ms, note: '' };
}

if (target === '5x5') {
  const indices = puzzles.map((p, i) => [p, i] as const).filter(([p]) => p.size === 5).map(([, i]) => i);
  console.log(`index  cost  steps   nodes      ms  result`);
  const costs: number[] = [];
  let solved = 0;
  const started = Date.now();
  for (const index of indices) {
    const r = attempt(index);
    if (r.solved) { solved++; costs.push(r.cost); }
    console.log(
      `${String(index).padStart(5)}  ${String(r.solved ? r.cost : '-').padStart(4)}  ` +
      `${String(r.solved ? r.steps : '-').padStart(5)}  ${String(r.nodes).padStart(6)}  ` +
      `${String(r.ms).padStart(6)}  ${r.solved ? 'solved' : r.note}`,
    );
  }
  const total = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nsolved ${solved}/${indices.length} in ${total}s`);
  if (costs.length) {
    const mean = (costs.reduce((a, b) => a + b, 0) / costs.length).toFixed(1);
    console.log(`cost: min ${Math.min(...costs)}, max ${Math.max(...costs)}, mean ${mean}`);
  }
} else {
  const index = Number(target);
  if (!Number.isInteger(index) || !puzzles[index]) usage();
  const puzzle = puzzles[index];
  console.log(`${puzzle.name} #${puzzle.categoryIndex} (index ${index})`);
  const result = search(puzzle, initState(puzzle), options);
  console.log(`${result.nodes} states expanded in ${result.ms}ms`);
  console.log(`${result.generated} successors generated, ${result.merged} already known ` +
    `(${((result.merged / Math.max(1, result.generated)) * 100).toFixed(0)}% merged), ${result.slept} slept`);
  if (!result.found) {
    const unresolved = result.best.cells
      .map((cell, i) => (cell === null ? posLabel(i, puzzle.size) : null))
      .filter((label): label is string => label !== null);
    console.log(`no proof found (${result.exhausted})`);
    console.log(`best reached: ${puzzle.size * puzzle.size - unresolved.length}/${puzzle.size * puzzle.size} cells`);
    console.log(`unresolved: ${unresolved.join(' ')}`);
    console.log('facts left:');
    for (const fact of result.best.facts) {
      const cells = fact.cells.map(c => posLabel(c, puzzle.size)).join(' ');
      console.log(`  ${factName(fact)}: ★{${cells}} ${opSymbol(fact.op)} ${fact.target}`);
    }
    process.exit(2);
  }
  const text = printProof(result.blocks, puzzle);
  const check = runProof(puzzle, text);
  console.log(`cost ${result.cost} over ${result.blocks.length} statements\n`);
  console.log(text);
  console.log(`\nverified: solved=${check.solved} errors=${check.errorCount}`);
  if (outDir) writeFileSync(join(outDir, `proof-${index}.lisp`), `${text}\n`, 'utf8');
  if (!check.solved || check.errorCount > 0) process.exit(3);
}
