/*
 * What a supposition pair can do that a by-contradiction cannot.
 *
 * To prove anything about a cell today, the prover assumes the opposite of a goal and hunts
 * for a contradiction. If the hunt fails it learns nothing and throws the whole derivation
 * away. But every cell is a star or an elim, so for any cell X the pair of suppositions
 * `is-star X` and `is-elim X` is an exhaustive disjunction -- and anything BOTH branches
 * derive holds unconditionally, by or-elimination, whether or not either branch closes.
 *
 * This measures the gap on a board the prover is stuck on: per unsettled cell, saturate both
 * branches and count what they agree on.
 */
import { readFileSync } from 'node:fs';
import { assume, evaluate } from '../src/engine';
import { parseProof } from '../src/proofText';
import { parseLevels } from '../src/puzzles';
import { saturate } from '../src/saturate';
import levelsData from '../src/levels.json';
import type { BoolExpr, PState, Puzzle } from '../src/types';

const puzzle: Puzzle = parseLevels(levelsData)[414];
const blocks = parseProof(readFileSync(process.argv[2], 'utf8'), puzzle);
const ceiling = Number(process.argv[3] ?? 2);
const { final } = evaluate(puzzle, blocks);
const start: PState = final;
const label = (i: number) =>
  `${String.fromCharCode(65 + (i % puzzle.size))}${Math.floor(i / puzzle.size) + 1}`;

const unresolved = start.cells.map((c, i) => (c === null ? i : -1)).filter(i => i >= 0);
console.log(`${puzzle.name} #${puzzle.categoryIndex}: ${start.cells.filter(c => c !== null).length}`
  + `/${puzzle.size ** 2} settled, ${unresolved.length} open. ceiling ${ceiling}\n`);

const pred = (cell: number, kind: 'is_star' | 'is_elim'): BoolExpr => ({ eid: `c${cell}`, kind, cell });
const branch = (cell: number, kind: 'is_star' | 'is_elim') => {
  const opened = assume(puzzle, start, pred(cell, kind));
  if ('error' in opened) return null;
  const out = saturate(puzzle, opened.state, s => s.contradiction,
    { maxCeiling: ceiling, noCases: true, timeLimitMs: 10000 });
  return out.state;
};

let closed = 0, agreed = 0, nothing = 0, failed = 0;
const gains: number[] = [];
const won = new Map<number, string>();   // cell -> value both branches agree on
const t0 = Date.now();
for (const cell of unresolved) {
  const s = branch(cell, 'is_star');
  const e = branch(cell, 'is_elim');
  if (!s || !e) { failed++; continue; }
  // A branch that closes settles this cell outright -- what the prover already looks for.
  if (s.contradiction || e.contradiction) { closed++; continue; }
  const gain = (st: PState) => st.cells.filter((c, i) => c !== null && start.cells[i] === null).length;
  gains.push(Math.min(gain(s), gain(e)));
  let n = 0;
  for (let i = 0; i < start.cells.length; i++) {
    if (start.cells[i] !== null || i === cell) continue;
    if (s.cells[i] !== null && s.cells[i] === e.cells[i]) {
      n++;
      if (!won.has(i)) won.set(i, s.cells[i]!);
    }
  }
  if (n > 0) { agreed++; } else nothing++;
}
console.log(`per-cell outcomes over ${unresolved.length} open cells:`);
console.log(`  a branch closed (by-contradiction already wins):  ${closed}`);
console.log(`  neither closed, but the branches agree somewhere: ${agreed}`);
console.log(`  neither closed, no agreement:                     ${nothing}`);
if (failed) console.log(`  hypothesis refused outright:                      ${failed}`);
gains.sort((a, b) => a - b);
const mid = gains[Math.floor(gains.length / 2)] ?? 0;
console.log(`\nweaker branch's own yield, over the open pairs: median ${mid}, max ${gains[gains.length - 1] ?? 0}`
  + `, zero in ${gains.filter(g => g === 0).length}`);
console.log(`cells settled by agreement alone: ${won.size}`);
if (won.size) {
  const list = [...won].sort((a, b) => a[0] - b[0]).map(([i, v]) => `${label(i)}=${v}`);
  console.log(`  ${list.join(' ')}`);
}
console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)}s`);
