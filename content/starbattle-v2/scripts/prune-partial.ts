/**
 * Prune a *partial* proof: one that settles some cells but does not solve the board.
 *
 * `optimize.ts` refuses these, because its `holds` predicate is "the board comes out
 * solved". The invariant that makes sense for a partial proof is instead: every step still
 * holds, and every cell the original settled is still settled, to the same value.
 *
 *   npx tsx scripts/prune-partial.ts <index> <proofFile> [--out FILE]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { evaluate } from '../src/engine';
import { parseProof, printProof } from '../src/proofText';
import { parseLevels } from '../src/puzzles';
import { prune, allStatements } from '../src/saturate';
import { proofCost } from '../src/search';
import levelsData from '../src/levels.json';
import type { Block, Puzzle } from '../src/types';

const args = process.argv.slice(2);
const index = Number(args[0]);
const file = args[1];
if (!Number.isInteger(index) || !file) {
  console.error('Usage: prune-partial <puzzleIndex> <proofFile> [--out FILE]');
  process.exit(1);
}
const flag = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
};

const puzzle: Puzzle = parseLevels(levelsData)[index];
const original = parseProof(readFileSync(file, 'utf8'), puzzle);
const total = puzzle.size * puzzle.size;

const outcome = (blocks: Block[]) => {
  const { results, final } = evaluate(puzzle, blocks);
  const bad = [...results.values()].filter(r => r.status !== 'ok').length;
  return {
    bad,
    cells: final.cells,
    settled: final.cells.filter(c => c !== null).length,
    supposed: final.suppositions.length,
  };
};

const base = outcome(original);
console.log(`${puzzle.name} #${puzzle.categoryIndex} (index ${index})`);
const show = (label: string, blocks: Block[], o: ReturnType<typeof outcome>, extra = '') =>
  console.log(`${label.padEnd(11)}${allStatements(blocks).length} statements, cost ${proofCost(blocks)}, `
    + `${o.settled}/${total} settled, ${o.supposed} suppositions, ${o.bad} failing${extra}`);

show('original:', original, base);
if (base.bad > 0) {
  console.error('Some step already fails — refusing to prune a proof that does not hold.');
  process.exit(2);
}

/*
 * No failures, and no knowledge lost. Cells are counted, not matched one to one: a cell is
 * worth as much however it was settled, and a statement that was hard to reach by case
 * analysis may fall out of something cheaper, so insisting on the same cells would refuse a
 * trade that is plainly good. (Removal alone cannot in fact gain a cell -- the system is
 * monotone, so dropping statements only loses knowledge -- which is why this is the same
 * predicate in practice. It stops being the same the moment anything substitutes.)
 *
 * Suppositions are not protected. One that is never `use`d contributes nothing to the board,
 * so this drops it; a supposition worth keeping is one the proof goes on to discharge.
 */
const holds = (blocks: Block[]) => {
  const now = outcome(blocks);
  return now.bad === 0 && now.settled >= base.settled;
};

const started = Date.now();
const best = prune(original, holds);
const after = outcome(best);
show('pruned:', best, after, `  (${((Date.now() - started) / 1000).toFixed(1)}s)`);

// Nothing is taken on the pruner's word: re-read the printed text and check it again.
const text = printProof(best, puzzle);
const reparsed = parseProof(text, puzzle);
const recheck = outcome(reparsed);
show('re-read:', reparsed, recheck);
if (recheck.bad > 0 || recheck.settled < base.settled) {
  console.error('REFUSING TO WRITE: the pruned proof does not reproduce the original knowledge.');
  process.exit(3);
}
const out = flag('out');
if (out) {
  writeFileSync(out, `${text}\n`, 'utf8');
  console.log(`written to ${out}`);
}
