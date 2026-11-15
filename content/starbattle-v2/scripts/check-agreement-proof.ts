/*
 * Take the first cell whose two branches agree on something, and build the actual proof:
 *
 *   (claim (or (is-star X) (is-elim X)) (by-cases ...))      -- the disjunction, for free
 *   (claim <agreed fact> (or-elim (or ...) (left ...) (right ...)))
 *
 * and hand it to the engine. Nothing is claimed about this technique that the engine has
 * not accepted as a proof.
 */
import { readFileSync } from 'node:fs';
import { assume, evaluate } from '../src/engine';
import { parseProof, printProof } from '../src/proofText';
import { parseLevels } from '../src/puzzles';
import { saturate } from '../src/saturate';
import { proofCost } from '../src/search';
import levelsData from '../src/levels.json';
import type { Block, BoolExpr, PState, Puzzle } from '../src/types';

const puzzle: Puzzle = parseLevels(levelsData)[414];
const base = parseProof(readFileSync(process.argv[2], 'utf8'), puzzle);
const ceiling = Number(process.argv[3] ?? 4);
const start: PState = evaluate(puzzle, base).final;
const label = (i: number) =>
  `${String.fromCharCode(65 + (i % puzzle.size))}${Math.floor(i / puzzle.size) + 1}`;

const pred = (cell: number, kind: 'is_star' | 'is_elim'): BoolExpr => ({ eid: `c${cell}${kind}`, kind, cell });
const branch = (cell: number, kind: 'is_star' | 'is_elim') => {
  const opened = assume(puzzle, start, pred(cell, kind));
  if ('error' in opened) return null;
  return saturate(puzzle, opened.state, s => s.contradiction,
    { maxCeiling: ceiling, noCases: true, timeLimitMs: 10000 });
};

const open = start.cells.map((c, i) => (c === null ? i : -1)).filter(i => i >= 0);
for (const cell of open) {
  const s = branch(cell, 'is_star'), e = branch(cell, 'is_elim');
  if (!s || !e || s.state.contradiction || e.state.contradiction) continue;
  const agreed = start.cells
    .map((c, i) => (c === null && i !== cell && s.state.cells[i] !== null
      && s.state.cells[i] === e.state.cells[i] ? i : -1))
    .filter(i => i >= 0);
  if (agreed.length === 0) continue;

  const target = agreed[0];
  const kind = s.state.cells[target] === 'star' ? 'is_star' : 'is_elim';
  console.log(`splitting on ${label(cell)}; both branches give ${label(target)} = ${s.state.cells[target]}`);
  console.log(`branch sizes: ${s.blocks.length} / ${e.blocks.length} statements\n`);

  const disj: BoolExpr = { eid: 'dj', kind: 'or', a: pred(cell, 'is_star'), b: pred(cell, 'is_elim') };
  const proof: Block[] = [
    ...base,
    { id: 'disj', type: 'claim', pred: disj,
      body: [{ id: 'disj-bc', type: 'by_cases', split: 'left', positive: [], negative: [] }] } as Block,
    { id: 'win', type: 'claim', pred: pred(target, kind),
      body: [{ id: 'win-oe', type: 'or_elim', pred: disj, left: s.blocks, right: e.blocks }] } as Block,
  ];

  const { results, final } = evaluate(puzzle, proof);
  const bad = [...results.entries()].filter(([, r]) => r.status !== 'ok');
  console.log(`disjunction: ${results.get('disj')?.status} ${results.get('disj')?.error ?? ''}`);
  console.log(`or-elim:     ${results.get('win')?.status} ${results.get('win')?.error ?? ''}`);
  console.log(`${label(target)} is now ${final.cells[target]}`);
  console.log(`board ${start.cells.filter(c => c !== null).length} -> `
    + `${final.cells.filter(c => c !== null).length} settled, ${bad.length} failing`);
  console.log(`cost ${proofCost(base)} -> ${proofCost(proof)}`);
  if (bad.length) console.log(`first failure: ${bad[0][1].error}`);
  console.log(`\ndisjunction renders as: ${printProof([proof[proof.length - 2]], puzzle).slice(0, 120)}`);
  process.exit(0);
}
console.log('no agreeing pair found');
