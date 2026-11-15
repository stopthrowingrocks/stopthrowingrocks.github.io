/**
 * Reformat a proof file: claim, argument and supposition bodies one statement per line,
 * indented. Rewrites the file in place unless `--out` says otherwise.
 *
 *   npx tsx scripts/format-proof.ts <puzzleIndex> <proofFile> [--out FILE] [--annotate]
 *
 * `--annotate` adds each statement's own `; ok:` / `; ERROR:` outcome. Those are line
 * comments, so an annotated file is still valid input to this script and to the prover.
 *
 * The rewrite is checked before it lands: the formatted text is reparsed and must evaluate
 * to the same board, with the same statements failing, as the file it replaces.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { evaluate } from '../src/engine';
import { parseProof, printProof } from '../src/proofText';
import { parseLevels } from '../src/puzzles';
import { allStatements } from '../src/saturate';
import levelsData from '../src/levels.json';
import type { Block, Puzzle } from '../src/types';

const args = process.argv.slice(2);
const index = Number(args[0]);
const file = args[1];
if (!Number.isInteger(index) || !file) {
  console.error('Usage: format-proof <puzzleIndex> <proofFile> [--out FILE] [--annotate]');
  process.exit(1);
}
const flag = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
};
const has = (name: string) => args.includes(`--${name}`);

const puzzle: Puzzle = parseLevels(levelsData)[index];
const before = parseProof(readFileSync(file, 'utf8'), puzzle);

const outcome = (blocks: Block[]) => {
  const { results, final } = evaluate(puzzle, blocks);
  return {
    cells: final.cells.map(c => c ?? '-').join(''),
    bad: [...results.values()].filter(r => r.status !== 'ok').length,
    settled: final.cells.filter(c => c !== null).length,
    results,
  };
};
const base = outcome(before);

const text = printProof(before, puzzle, has('annotate') ? base.results : undefined);
const after = parseProof(text, puzzle);
const check = outcome(after);

const lines = (s: string) => s.split('\n').length;
console.log(`${puzzle.name} #${puzzle.categoryIndex} (index ${index})`);
console.log(`${allStatements(before).length} statements, ${base.settled}/${puzzle.size ** 2} settled`);
console.log(`lines ${lines(readFileSync(file, 'utf8'))} -> ${lines(text)}`);

if (check.cells !== base.cells || check.bad !== base.bad
  || allStatements(after).length !== allStatements(before).length) {
  console.error('REFUSING TO WRITE: the reformatted proof does not say the same thing.');
  process.exit(2);
}
// Idempotent, or the file churns every time it is formatted.
if (printProof(after, puzzle, has('annotate') ? check.results : undefined) !== text) {
  console.error('REFUSING TO WRITE: formatting is not a fixpoint.');
  process.exit(3);
}

const out = flag('out') ?? file;
writeFileSync(out, `${text}\n`, 'utf8');
console.log(`written to ${out}`);
