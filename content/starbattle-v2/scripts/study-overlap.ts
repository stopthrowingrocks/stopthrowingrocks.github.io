/*
 * Do two arguments reach the same position and then do the same work?
 *
 * Comparing statement text only finds reuse that was written the same way twice, which a
 * saturating prover has no reason to produce -- it emits whatever the cheapest next move is,
 * so two arguments can fill the board in the same way and share not one line. The thing to
 * compare is what they derive, not how they say it.
 *
 * For each argument this takes the set of cells settled inside it, and for each pair, the
 * overlap. A large overlap is a candidate supposition: content both arguments pay for.
 */
import { readFileSync } from 'node:fs';
import { evaluate } from '../src/engine';
import { parseProof, printProof } from '../src/proofText';
import { parseLevels } from '../src/puzzles';
import { statementCost } from '../src/search';
import levelsData from '../src/levels.json';
import type { Block, Puzzle } from '../src/types';

const puzzle: Puzzle = parseLevels(levelsData)[Number(process.argv[3] ?? 414)];
const blocks = parseProof(readFileSync(process.argv[2], 'utf8'), puzzle);
const { results } = evaluate(puzzle, blocks);
const label = (i: number) =>
  `${String.fromCharCode(65 + (i % puzzle.size))}${Math.floor(i / puzzle.size) + 1}`;

const kids = (b: Block): Block[][] => {
  const a = b as any;
  return [a.body, a.left, a.right, a.positive, a.negative].filter(Boolean);
};
const goal = (b: Block) => printProof([{ ...b, body: [] } as any], puzzle).split('\n')[0].trim();

/** Every argument, with the cells its branch settles that were not settled on entry. */
type Arg = { goal: string; cost: number; derived: Map<number, string> };
const args: Arg[] = [];
const walk = (list: Block[]) => {
  for (const b of list) {
    if (b.type === 'claim' && (b as any).body?.[0]?.type === 'by_contradiction') {
      const bc = (b as any).body[0];
      const r = results.get(bc.id);
      // `by_contradiction` reports the branch's end state as its scope: what the hypothesis
      // led to before the contradiction closed it.
      const inside = r?.scope, before = r?.prev;
      if (inside && before) {
        const derived = new Map<number, string>();
        inside.cells.forEach((c, i) => { if (c !== null && before.cells[i] === null) derived.set(i, c); });
        args.push({ goal: goal(b), cost: statementCost(b), derived });
      }
    }
    kids(b).forEach(walk);
  }
};
walk(blocks);

args.sort((a, b) => b.derived.size - a.derived.size);
console.log(`${args.length} arguments, by how much their branch derives:\n`);
for (const a of args) {
  console.log(`  ${String(a.derived.size).padStart(3)} cells  cost ${String(a.cost).padStart(3)}  ${a.goal.slice(0, 54)}`);
}

// ── pairwise overlap ────────────────────────────────────────────────────────────
type Pair = { i: number; j: number; same: number; agree: number };
const pairs: Pair[] = [];
for (let i = 0; i < args.length; i++) {
  for (let j = i + 1; j < args.length; j++) {
    let same = 0, agree = 0;
    for (const [cell, v] of args[i].derived) {
      const other = args[j].derived.get(cell);
      if (other === undefined) continue;
      same++;
      if (other === v) agree++;
    }
    if (same > 0) pairs.push({ i, j, same, agree });
  }
}
pairs.sort((a, b) => b.agree - a.agree);
console.log(`\n${pairs.length} argument pairs share at least one derived cell.`);
console.log(`top overlaps (cells both derive / of which they agree):\n`);
for (const p of pairs.slice(0, 12)) {
  const a = args[p.i], b = args[p.j];
  const cells = [...a.derived].filter(([c, v]) => b.derived.get(c) === v).map(([c]) => label(c));
  console.log(`  ${String(p.same).padStart(3)} shared, ${String(p.agree).padStart(3)} agreeing  `
    + `[${a.derived.size}c/${a.cost}] ${a.goal.slice(0, 26).padEnd(26)} x  `
    + `[${b.derived.size}c/${b.cost}] ${b.goal.slice(0, 26)}`);
  if (cells.length) console.log(`        ${cells.slice(0, 24).join(' ')}${cells.length > 24 ? ' ...' : ''}`);
}
