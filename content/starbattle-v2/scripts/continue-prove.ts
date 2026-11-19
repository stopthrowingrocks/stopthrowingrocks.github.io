/**
 * Resume saturation from a proof already on disk.
 *
 * `prove.ts` always starts from `initState`, so a stalled run cannot be picked up and a
 * hand-written prefix cannot be extended. `saturate.prove` itself takes a state, though —
 * so all that is missing is evaluating a proof first and handing its end state over.
 *
 * That makes the useful loop possible: saturate until it stalls, attack the stuck cells
 * some other way (see `claim-batch.ts`), then resume from the longer proof.
 *
 *   npx tsx scripts/continue-prove.ts <index> <proofFile> [--max-ceiling N]
 *            [--case-ceiling N] [--no-cases] [--time MS] [--verbose] [--out FILE]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { evaluate, isSolved } from '../src/engine';
import { parseProof, printProof } from '../src/proofText';
import { parseLevels } from '../src/puzzles';
import { runProof } from '../src/agentTool';
import { boardAdvancingMoves, forcedMoves, proofCost, splitMoves } from '../src/search';
import { allStatements, prove, prune } from '../src/saturate';
import levelsData from '../src/levels.json';
import type { Block, Puzzle } from '../src/types';

const args = process.argv.slice(2);
const index = Number(args[0]);
const file = args[1];
const str = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
};
const num = (name: string, fallback: number) => Number(str(name) ?? fallback);

const puzzles: Puzzle[] = parseLevels(levelsData);
const puzzle = puzzles[index];
if (!puzzle || !file) { console.error('usage: continue-prove <index> <proofFile> [options]'); process.exit(1); }

const prefix = parseProof(readFileSync(file, 'utf8'), puzzle);
const before = evaluate(puzzle, prefix);
const bad = [...before.results.values()].filter(r => r.status === 'error');
if (bad.length) {
  console.error(`the prefix does not hold: ${bad.length} statement(s) error`);
  for (const r of bad.slice(0, 5)) console.error(`  ${r.error}`);
  process.exit(1);
}
const settledBefore = before.final.cells.filter(c => c !== null).length;
const total = puzzle.size ** 2;
console.log(`${puzzle.name} #${puzzle.categoryIndex}: resuming from ${allStatements(prefix).length}`
  + ` statement(s), ${settledBefore}/${total} cells settled`);

/** Same knob as prove.ts: what a by-contradiction body is allowed to argue with. */
const bodyGenerators = (() => {
  switch (str('body-generators')) {
    case 'split': return [forcedMoves, splitMoves];
    case 'full': return [forcedMoves, boardAdvancingMoves, splitMoves];
    default: return undefined;
  }
})();

const result = prove(puzzle, before.final, {
  maxCeiling: num('max-ceiling', 6),
  caseCeiling: num('case-ceiling', 4),
  noCases: args.includes('--no-cases'),
    forgetAllCases: args.includes('--forget-all'),
    caseDepth: num('case-depth', 1),
  beamWidth: num('beam', 24),
  contradictionBodyNodes: num('body-nodes', 30),
  contradictionBodyGenerators: bodyGenerators,
  timeLimitMs: num('time', 600000),
  onProgress: args.includes('--verbose') ? note => console.log(`   ${note}`) : undefined,
});

const combined: Block[] = [...prefix, ...result.blocks];
const check = runProof(puzzle, printProof(combined, puzzle));
console.log(`\nadded ${allStatements(result.blocks).length} statement(s) in ${(result.ms / 1000).toFixed(1)}s`
  + ` — now ${check.cellsProven}/${total} cells, ${check.errorCount} error(s)`);

// `prune`'s invariant has to match what we actually have. Solved boards can be trimmed
// against "still solves"; a partial can only be trimmed against "still settles what it did".
const solved = check.solved && check.errorCount === 0;
const trimmed = solved
  ? prune(combined, list => {
      const { results, final } = evaluate(puzzle, list);
      for (const r of results.values()) if (r.status !== 'ok') return false;
      return isSolved(final);
    })
  : combined;

const text = printProof(trimmed, puzzle);
if (solved) {
  const verify = runProof(puzzle, text);
  if (!verify.solved || verify.errorCount > 0) {
    console.error(`FAILED VERIFICATION after trimming (${verify.errorCount} errors)`);
    process.exit(1);
  }
  console.log(`SOLVED — cost ${proofCost(combined)} -> ${proofCost(trimmed)} after trimming, `
    + `${allStatements(combined).length} -> ${allStatements(trimmed).length} statements`);
} else {
  console.log(`still stuck at ${check.cellsProven}/${total} cells`);
}

const out = str('out');
if (out) { writeFileSync(out, `${text}\n`, 'utf8'); console.log(`written to ${out}`); }
if (!solved) process.exit(2);
