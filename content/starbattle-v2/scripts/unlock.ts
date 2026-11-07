/**
 * Find the cheapest cell to prove at a given point in a proof.
 *
 *   npx tsx scripts/unlock.ts <index> <proofFile> [--at N] [--cells A1,B2] [--time MS]
 *
 * The question this answers: a proof is stuck and reaches for an expensive case analysis.
 * Was that the right cell to argue about? For every unresolved cell, grant its value as
 * though it were already proved and see whether the rest of the board falls out by
 * arithmetic alone. The cells where it does are the candidate unlocks. Each is then costed
 * properly — an arithmetic proof by contradiction of the cell itself, plus the completion
 * it buys — and ranked.
 *
 * Granting uses the true value, taken from the solved board the proof reaches. An unlock is
 * only a candidate, never a step: nothing is granted in the proof that comes out.
 */
import { readFileSync } from 'node:fs';
import { assume, evaluate, initState, isSolved } from '../src/engine';
import { parseProof } from '../src/proofText';
import { cellLabelToIndex, parseLevels, posLabel } from '../src/puzzles';
import {
  boardAdvancingMoves, forcedMoves, proofCost, search, statementCost,
} from '../src/search';
import levelsData from '../src/levels.json';
import type { Block, BoolExpr, CellK, PState, Puzzle } from '../src/types';

const args = process.argv.slice(2);
const index = Number(args[0]);
const file = args[1];
const flag = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
};
const num = (name: string, fallback: number) => {
  const raw = flag(name);
  return raw === undefined ? fallback : Number(raw);
};

const puzzle: Puzzle = parseLevels(levelsData)[index];
const blocks = parseProof(readFileSync(file, 'utf8'), puzzle);
const { results, final } = evaluate(puzzle, blocks);
if (!isSolved(final)) throw new Error('that proof does not solve the board');
const truth: CellK[] = final.cells;

// Where to cut: the given statement, or the priciest one.
let at = Number(flag('at') ?? NaN) - 1;
if (!Number.isInteger(at)) {
  at = 0;
  blocks.forEach((b, i) => { if (statementCost(b) > statementCost(blocks[at])) at = i; });
}
let before: PState = initState(puzzle);
for (let i = 0; i < at; i++) before = results.get(blocks[i].id)?.state ?? before;

const restCost = proofCost(blocks.slice(at + 1));
console.log(`${puzzle.name} #${puzzle.categoryIndex}, cutting at statement ${at + 1} ` +
  `(${blocks[at].type}, cost ${statementCost(blocks[at])})`);
console.log(`${before.cells.filter(c => c !== null).length}/${puzzle.size ** 2} cells settled, ` +
  `${before.cells.filter(c => c === null).length} unresolved`);
console.log(`as written: ${statementCost(blocks[at])} for the claim + ${restCost} for the rest ` +
  `= ${statementCost(blocks[at]) + restCost}\n`);

const only = flag('cells')?.split(',').map(c => cellLabelToIndex(c.trim(), puzzle.size));
const candidates = before.cells
  .map((cell, i) => (cell === null ? i : -1))
  .filter(i => i >= 0 && (!only || only.includes(i)));

const timeLimitMs = num('time', 30000);
const label = (cell: number) => posLabel(cell, puzzle.size);
const predFor = (cell: number): BoolExpr =>
  ({ eid: `goal${cell}`, kind: truth[cell] === 'elim' ? 'is_elim' : 'is_star', cell });

/** Greedy completion by arithmetic alone: does granting this cell finish the board? */
function completes(granted: PState): { cost: number; steps: number } | null {
  let state = granted;
  let cost = 0, steps = 0;
  while (!isSolved(state) && steps < 80) {
    const moves = boardAdvancingMoves(puzzle, state, {});
    if (moves.length === 0) return null;
    const settled = state.cells.filter(c => c !== null).length;
    let best = moves[0], bestScore = -Infinity;
    for (const move of moves) {
      const score = (move.state.cells.filter(c => c !== null).length - settled) / move.cost;
      if (score > bestScore) { bestScore = score; best = move; }
    }
    state = best.state; cost += best.cost; steps++;
  }
  return isSolved(state) ? { cost, steps } : null;
}

console.log('cell   unlock?  completion   arithmetic claim   total');
const found: { cell: number; completion: number; claim: number | null }[] = [];
const started = Date.now();

for (const cell of candidates) {
  const granted = assume(puzzle, before, predFor(cell));
  if ('error' in granted) continue;
  const completion = completes(granted.state);
  if (!completion) continue;

  // Now cost it honestly: prove the cell by contradiction, arithmetic only.
  const opened = assume(puzzle, before, { eid: `neg${cell}`, kind: 'not', a: predFor(cell) });
  let claimCost: number | null = null;
  if (!('error' in opened)) {
    const proof = search(puzzle, opened.state, {
      goal: state => state.contradiction,
      generators: [forcedMoves, boardAdvancingMoves],
      timeLimitMs,
      maxNodes: num('nodes', 400),
    });
    const broken = proof.found ? proof.best.facts.find(f => f.impossible) : undefined;
    if (proof.found && broken) {
      const claim: Block = {
        id: `unlock-${cell}`, type: 'claim', pred: predFor(cell),
        body: [{
          id: `unlock-bc-${cell}`, type: 'by_contradiction', body: proof.blocks,
          contradiction: { eid: 'via', kind: 'ref', factId: broken.id },
        }],
      };
      claimCost = statementCost(claim);
    }
  }
  found.push({ cell, completion: completion.cost, claim: claimCost });
  console.log(`${label(cell).padEnd(6)} yes      ${String(completion.cost).padStart(4)} ` +
    `(${completion.steps} steps)  ${(claimCost === null ? 'not found' : String(claimCost)).padStart(12)}   ` +
    `${claimCost === null ? '-' : claimCost + completion.cost}`);
}

console.log(`\n${found.length} of ${candidates.length} cells unlock the board, ` +
  `${((Date.now() - started) / 1000).toFixed(0)}s`);
const ranked = found.filter(f => f.claim !== null)
  .sort((a, b) => (a.claim! + a.completion) - (b.claim! + b.completion));
if (ranked.length === 0) {
  console.log('none of them has an arithmetic proof by contradiction within budget.');
} else {
  console.log('\nbest unlocks, by proof + completion:');
  for (const f of ranked.slice(0, 10)) {
    console.log(`  ${label(f.cell).padEnd(5)} ${String(f.claim).padStart(3)} + ${String(f.completion).padStart(3)}` +
      ` = ${f.claim! + f.completion}`);
  }
  console.log(`\nas written, that span costs ${statementCost(blocks[at]) + restCost}`);
}
