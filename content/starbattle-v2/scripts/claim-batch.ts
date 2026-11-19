/**
 * Discover claims for cells a partial proof has not settled yet.
 *
 * `improve-claim.ts` only *improves* a claim that already settles its cell — it needs the
 * statement to exist so it can price a replacement. This instead takes cells nothing has
 * settled, assumes each one wrong, and searches for a contradiction.
 *
 * It is told the answer up front (`--stars`), which is the whole point: the saturating
 * prover has to suppose every unresolved cell in *both* directions, and half of that work
 * can never pay off. Knowing the solution, every search here points the one way that can
 * close. That makes this a search accelerator, not a solver — it proves nothing the prover
 * could not prove, it just does not spend time on the losing direction.
 *
 * Each claim is proved against the same starting state, so they are independent and may be
 * appended in any order. A later claim can still disturb an earlier one's body by settling
 * cells it mentions, so the caller must re-verify the concatenation and drop what breaks.
 *
 *   npx tsx scripts/claim-batch.ts <index> <proofFile> --stars "D1 F1 ..." [--slice i/n]
 *                                  [--time MS] [--nodes N] [--ceiling N] [--out FILE]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { assume, evaluate } from '../src/engine';
import { parseProof, printProof } from '../src/proofText';
import { cellLabelToIndex, parseLevels, posLabel } from '../src/puzzles';
import { boardAdvancingMoves, contradictionMoves, forcedMoves, search, splitMoves, statementCost } from '../src/search';
import { signedMoves } from '../src/signed';
import levelsData from '../src/levels.json';
import type { Block, BoolExpr, Puzzle } from '../src/types';

const args = process.argv.slice(2);
const index = Number(args[0]);
const file = args[1];
const str = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
};
const num = (name: string, fallback: number) => Number(str(name) ?? fallback);

const puzzle: Puzzle = parseLevels(levelsData)[index];
if (!puzzle || !file) { console.error('usage: claim-batch <index> <proofFile> --stars "..."'); process.exit(1); }

const starsArg = str('stars');
if (!starsArg) { console.error('--stars is required: the solution, so searches face the right way'); process.exit(1); }
const starCells = new Set(starsArg.trim().split(/[\s,]+/).map(label => {
  const c = cellLabelToIndex(label, puzzle.size);
  if (c === null) throw new Error(`${label} is not a cell on this board`);
  return c;
}));

const blocks = parseProof(readFileSync(file, 'utf8'), puzzle);
const { final } = evaluate(puzzle, blocks);

// Every cell nothing has settled, each argued in the one direction that can close: an
// empty cell is claimed elim, an unplaced star is claimed a star. Restrict with --only.
const only = str('only');
let targets: number[] = [];
for (let c = 0; c < puzzle.size ** 2; c++) {
  if (final.cells[c] !== null) continue;
  const isStar = starCells.has(c);
  if (only === 'elims' && isStar) continue;
  if (only === 'stars' && !isStar) continue;
  targets.push(c);
}
const slice = str('slice');
if (slice) {
  const [part, of] = slice.split('/').map(Number);
  targets = targets.filter((_, i) => i % of === part);
}

const ceiling = num('ceiling', 5);
const nodes = num('nodes', 300);
const timeLimitMs = num('time', 20000);

console.log(`${puzzle.name} #${puzzle.categoryIndex}: ${final.cells.filter(c => c !== null).length}`
  + `/${puzzle.size ** 2} settled, attacking ${targets.length} cell(s)`
  + `${slice ? ` (slice ${slice})` : ''}\n`);

const found: Block[] = [];
for (const cell of targets) {
  const label = posLabel(cell, puzzle.size);
  const pred: BoolExpr = {
    eid: `g${cell}`,
    kind: starCells.has(cell) ? 'is_star' : 'is_elim',
    cell,
  };
  const opened = assume(puzzle, final, { eid: `n${cell}`, kind: 'not', a: pred });
  if ('error' in opened) { console.log(`${label.padEnd(4)} cannot assume: ${opened.error}`); continue; }

  // Cheapest generator first. A node of forced moves only is far cheaper than one that
  // also generates derivations and nested claims, so a small budget of them propagates
  // much deeper — which is how the stock prover finds cases on 30 nodes while a 1200-node
  // search over the full generator set finds none.
  const ladder = [
    [forcedMoves],
    // Pigeonhole over a clique partition is the shape a refutation usually needs: assume the
    // star, then show the stars left over cannot fit beside it. Nothing reaches it through
    // forced moves, so a body without `splitMoves` cannot make the argument at any budget.
    [forcedMoves, splitMoves],
    // Signed elimination, which is what `levelMoves` reaches for and this ladder was missing.
    // It cancels facts against each other across lines and regions, so it is the only rung
    // that can refute a cell whose contradiction lives in several lines at once rather than
    // in the cells around it.
    [forcedMoves, signedMoves, splitMoves],
    [forcedMoves, signedMoves, boardAdvancingMoves, splitMoves],
    [forcedMoves, signedMoves, boardAdvancingMoves, splitMoves, contradictionMoves],
  ];
  const started = Date.now();
  let result: ReturnType<typeof search> | null = null;
  for (const generators of ladder) {
    const attempt = search(puzzle, opened.state, {
      goal: state => state.contradiction,
      generators,
      maxStatementCost: ceiling,
      maxNodes: nodes,
      timeLimitMs,
    });
    if (attempt.found) { result = attempt; break; }
    if (Date.now() - started > timeLimitMs) break;
  }
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (!result?.found) { console.log(`${label.padEnd(4)} no contradiction ${secs}s`); continue; }

  /*
   * No impossible fact does not mean no contradiction. A refutation can land in the cells —
   * a star forced next to a star, say — and then there is nothing for a `via` to name, which
   * a by-contradiction now accepts. Discarding these threw away real refutations: the first
   * cell this tool ever refuted on a 14x14 was discarded exactly here.
   */
  const broken = result.best.facts.find(f => f.impossible);

  const claim: Block = {
    id: `cb-${cell}`,
    type: 'claim',
    pred,
    body: [{
      id: `cb-bc-${cell}`,
      type: 'by_contradiction',
      body: result.blocks,
      contradiction: broken ? { eid: `v${cell}`, kind: 'ref', factId: broken.id } : null,
    }],
  };
  found.push(claim);
  console.log(`${label.padEnd(4)} PROVED in ${result.blocks.length} steps, cost ${statementCost(claim)} ${secs}s`);
}

console.log(`\n${found.length}/${targets.length} cells claimed`);
const out = str('out');
if (out && found.length) {
  writeFileSync(out, `${printProof(found, puzzle)}\n`, 'utf8');
  console.log(`written to ${out}`);
}
