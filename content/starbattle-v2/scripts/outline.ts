import { readFileSync } from 'node:fs';
import { evaluate } from '../src/engine';
import { parseProof } from '../src/proofText';
import { parseLevels } from '../src/puzzles';
import { allStatements } from '../src/saturate';
import { statementCost } from '../src/search';
import levelsData from '../src/levels.json';
import type { Block, Puzzle } from '../src/types';

const puzzle: Puzzle = parseLevels(levelsData)[414];
const blocks = parseProof(readFileSync(process.argv[2], 'utf8'), puzzle);
const { results } = evaluate(puzzle, blocks);

const settled = (cells: (string | null)[]) => cells.filter(c => c !== null).length;
const kids = (b: Block): Block[][] => {
  const a = b as any;
  return [a.body, a.left, a.right, a.positive, a.negative].filter(Boolean);
};

const depth = Number(process.argv[3] ?? 1);
const walk = (list: Block[], d: number) => {
  for (const b of list) {
    const r = results.get(b.id);
    const gain = r ? settled(r.state.cells) - settled(r.prev.cells) : 0;
    const n = allStatements([b]).length - 1;
    const label = (b as any).name ? `${b.type} ${(b as any).name}` : b.type;
    console.log(`${'  '.repeat(d)}${label.padEnd(22 - d * 2)} cost ${String(statementCost(b)).padStart(4)}`
      + `  +${String(gain).padStart(3)} cells  ${n} nested`);
    if (d < depth) kids(b).forEach(k => walk(k, d + 1));
  }
};
walk(blocks, 0);
