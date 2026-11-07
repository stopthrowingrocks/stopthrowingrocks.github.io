/**
 * Shorten an existing proof without searching for a new one.
 *
 *   npx tsx scripts/optimize.ts <index> <proofFile> [--out FILE] [--substitute N]
 *
 * Two kinds of saving, in order of cost:
 *
 *   1. Removal. A proof is monotone — every statement only adds knowledge — so a statement
 *      is dead weight whenever the proof still holds without it. Statements are dropped in
 *      shrinking groups rather than one at a time, because a branch can be jointly
 *      removable while none of its statements is removable alone. This is delta debugging
 *      applied to a proof.
 *
 *   2. Substitution. For the priciest statements, ask the move generator for a cheaper way
 *      to settle the same cells at that same point in the proof, and keep it when the rest
 *      of the proof still goes through.
 *
 * Nothing is accepted on the optimizer's word: every candidate is re-evaluated by the
 * engine, and the result has to still solve the board with no step failing.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { evaluate, initState, isSolved } from '../src/engine';
import { parseProof, printProof } from '../src/proofText';
import { parseLevels } from '../src/puzzles';
import { runProof } from '../src/agentTool';
import { boardAdvancingMoves, contradictionMoves, proofCost, statementCost } from '../src/search';
import levelsData from '../src/levels.json';
import type { Block, PState, Puzzle } from '../src/types';

const args = process.argv.slice(2);
const index = Number(args[0]);
const file = args[1];
if (!Number.isInteger(index) || !file) {
  console.error('Usage: optimize <puzzleIndex> <proofFile> [--out FILE] [--substitute N]');
  process.exit(1);
}
const flag = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
};

const puzzle: Puzzle = parseLevels(levelsData)[index];
const original = parseProof(readFileSync(file, 'utf8'), puzzle);

/** Still a proof? Every step has to hold, and the board has to come out solved. */
function holds(blocks: Block[]): boolean {
  const { results, final } = evaluate(puzzle, blocks);
  for (const r of results.values()) if (r.status !== 'ok') return false;
  return isSolved(final);
}

/** Rebuild a block with its nested bodies mapped — the containers the engine knows about. */
function mapBodies(block: Block, f: (body: Block[]) => Block[]): Block {
  switch (block.type) {
    case 'argument': case 'claim': case 'by_contradiction':
      return { ...block, body: f(block.body) };
    case 'constructor':
      return { ...block, left: f(block.left), right: f(block.right) };
    case 'by_cases':
      return { ...block, positive: f(block.positive), negative: f(block.negative) };
    default:
      return block;
  }
}

const without = (blocks: Block[], ids: Set<string>): Block[] =>
  blocks.filter(b => !ids.has(b.id)).map(b => mapBodies(b, body => without(body, ids)));

/** Every statement in the proof, nested ones included, in reading order. */
function allStatements(blocks: Block[]): Block[] {
  const out: Block[] = [];
  const walk = (list: Block[]) => {
    for (const b of list) {
      out.push(b);
      mapBodies(b, body => { walk(body); return body; });
    }
  };
  walk(blocks);
  return out;
}

const describe = (blocks: Block[]) =>
  `${allStatements(blocks).length} statements, cost ${proofCost(blocks)}`;

// ── 1. Removal ──────────────────────────────────────────────────────────────────

function removeDeadWeight(blocks: Block[]): Block[] {
  let current = blocks;
  let granularity = Math.max(1, Math.floor(allStatements(current).length / 2));
  for (;;) {
    let removedAny = false;
    const statements = allStatements(current);
    // Later statements first: a dead branch is usually kept alive by what follows it.
    for (let start = statements.length - granularity; start >= 0; start -= granularity) {
      const chunk = new Set(statements.slice(start, start + granularity).map(b => b.id));
      const candidate = without(current, chunk);
      if (candidate.length === 0 || !holds(candidate)) continue;
      current = candidate;
      removedAny = true;
    }
    if (!removedAny) {
      if (granularity === 1) return current;
      granularity = Math.max(1, Math.floor(granularity / 2));
    }
  }
}

// ── 2. Substitution ─────────────────────────────────────────────────────────────

/** The state each top-level statement starts from. */
function prefixStates(blocks: Block[]): PState[] {
  const states: PState[] = [];
  let state = initState(puzzle);
  const { results } = evaluate(puzzle, blocks);
  for (const block of blocks) {
    states.push(state);
    const r = results.get(block.id);
    state = r?.state ?? state;
  }
  return states;
}

function substitute(blocks: Block[], attempts: number): Block[] {
  let current = blocks;
  const ranked = current
    .map((block, at) => ({ at, cost: statementCost(block) }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, attempts);

  for (const { at, cost } of ranked) {
    if (cost <= 1) continue;
    const states = prefixStates(current);
    const before = states[at];
    if (!before) continue;
    const options = [
      ...boardAdvancingMoves(puzzle, before, {}),
      ...contradictionMoves(puzzle, before, {}),
    ].filter(move => move.cost < cost).sort((a, b) => a.cost - b.cost);

    for (const move of options) {
      const candidate = [...current.slice(0, at), move.block, ...current.slice(at + 1)];
      if (!holds(candidate)) continue;
      console.log(`  statement ${at + 1}: cost ${cost} -> ${move.cost}`);
      current = candidate;
      break;
    }
  }
  return current;
}

// ── Run ─────────────────────────────────────────────────────────────────────────

console.log(`${puzzle.name} #${puzzle.categoryIndex} (index ${index})`);
if (!holds(original)) {
  console.error('The proof given does not hold as it stands — nothing to optimize.');
  process.exit(2);
}
console.log(`original:  ${describe(original)}`);

let started = Date.now();
let best = removeDeadWeight(original);
console.log(`removal:   ${describe(best)}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);

const attempts = Number(flag('substitute') ?? 0);
if (attempts > 0) {
  started = Date.now();
  best = substitute(best, attempts);
  console.log(`substitute:${describe(best)}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

const text = printProof(best, puzzle);
const check = runProof(puzzle, text);
console.log(`\nverified: solved=${check.solved} errors=${check.errorCount} admitted=${check.admitted}`);
if (!check.solved || check.errorCount > 0) {
  console.error('REFUSING TO WRITE: the optimized proof does not hold.');
  process.exit(3);
}
console.log(`cost ${proofCost(original)} -> ${proofCost(best)}`);
const out = flag('out');
if (out) {
  writeFileSync(out, `${text}\n`, 'utf8');
  console.log(`written to ${out}`);
}
