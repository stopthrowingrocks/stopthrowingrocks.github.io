/**
 * Drop top-level statements that do not hold, until the whole proof checks.
 *
 * Statements discovered in parallel are each proved against the same state, so they are
 * independent — but appending them in sequence is not the state any one of them was proved
 * against. An earlier claim can settle a cell a later claim's body argues about, or consume
 * the hypothesis its `via` names. Those late statements are not wrong, just no longer
 * justified where they now sit, and the cheapest answer is to drop them and let the next
 * round rediscover them from the deeper state.
 *
 * Each removal can fix or break others, so this repeats until nothing errors.
 *
 *   npx tsx scripts/drop-failing.ts <index> <proofFile> <out>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { evaluate } from '../src/engine';
import { parseProof, printProof } from '../src/proofText';
import { parseLevels } from '../src/puzzles';
import levelsData from '../src/levels.json';
import type { Block, Puzzle, RawLevel } from '../src/types';

const index = Number(process.argv[2]);
const file = process.argv[3];
const out = process.argv[4];
const puzzle: Puzzle = parseLevels(levelsData as RawLevel[])[index];
if (!puzzle || !file || !out) {
  console.error('usage: drop-failing <index> <proofFile> <out>');
  process.exit(1);
}

let blocks: Block[] = parseProof(readFileSync(file, 'utf8'), puzzle);
const started = blocks.length;
for (let round = 1; ; round++) {
  const { results } = evaluate(puzzle, blocks);
  const failing = blocks.filter(b => results.get(b.id)?.status === 'error');
  if (!failing.length) break;
  console.log(`round ${round}: dropping ${failing.length} statement(s)`);
  const drop = new Set(failing.map(b => b.id));
  blocks = blocks.filter(b => !drop.has(b.id));
}
const { final } = evaluate(puzzle, blocks);
const settled = final.cells.filter(c => c !== null).length;
console.log(`clean: ${blocks.length} of ${started} statements, ${settled}/${puzzle.size ** 2} cells`);
writeFileSync(out, `${printProof(blocks, puzzle)}\n`, 'utf8');
