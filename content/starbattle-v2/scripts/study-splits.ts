/**
 * What does a good split look like?
 *
 *   npx tsx scripts/study-splits.ts <index> <proofFile>
 *
 * Reads every split in a proof and reports its shape — what was partitioned, what the parts
 * were made of, whether the parts tile the hypothesis as cliques — and its value, meaning
 * how many later statements use the facts it produced and how soon. The point is to find
 * the signature a generator could enumerate, rather than guessing at one.
 */
import { readFileSync } from 'node:fs';
import { evaluate, hypothesisForm } from '../src/engine';
import { parseProof, printProof } from '../src/proofText';
import { factName, neighbors, parseLevels } from '../src/puzzles';
import levelsData from '../src/levels.json';
import type { Block, HypExpr, PState, Puzzle } from '../src/types';

const puzzle: Puzzle = parseLevels(levelsData)[Number(process.argv[2])];
const blocks = parseProof(readFileSync(process.argv[3], 'utf8'), puzzle);
const { results } = evaluate(puzzle, blocks);

function allStatements(list: Block[]): Block[] {
  const out: Block[] = [];
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      out.push(b);
      if (b.type === 'argument' || b.type === 'claim' || b.type === 'by_contradiction') walk(b.body);
      if (b.type === 'constructor') { walk(b.left); walk(b.right); }
      if (b.type === 'by_cases') { walk(b.positive); walk(b.negative); }
    }
  };
  walk(list);
  return out;
}

const statements = allStatements(blocks);

/** How an expression is built, in one word. */
function shape(expr: HypExpr | null): string {
  if (!expr) return 'empty';
  switch (expr.kind) {
    case 'ref': return 'fact';
    case 'clique': return `adj${expr.cells.length}`;
    case 'bound': return 'bound';
    default: return 'derived';
  }
}

/** Do these cells form a king-move clique? */
const isClique = (cells: number[]) =>
  cells.every((a, i) => cells.slice(i + 1).every(b => neighbors(a, puzzle.size).includes(b)));

/** Which later statements mention this fact id? */
function usedBy(id: string, from: number): number[] {
  const mentions = (expr: HypExpr | null): boolean => {
    if (!expr) return false;
    if (expr.kind === 'ref') return expr.factId === id;
    if (expr.kind === 'add' || expr.kind === 'sub' || expr.kind === 'combine') {
      return mentions(expr.left) || mentions(expr.right);
    }
    return false;
  };
  const uses: number[] = [];
  statements.forEach((b, i) => {
    if (i <= from) return;
    const exprs: (HypExpr | null)[] = [];
    if (b.type === 'stars' || b.type === 'elims' || b.type === 'define' || b.type === 'replace') exprs.push(b.expr);
    if (b.type === 'split') exprs.push(b.expr, ...b.parts);
    if (b.type === 'by_contradiction') exprs.push(b.contradiction);
    if (b.type === 'clear' || b.type === 'rename') { if (b.factId === id) uses.push(i); return; }
    if (exprs.some(mentions)) uses.push(i);
  });
  return uses;
}

let count = 0;
statements.forEach((block, index) => {
  if (block.type !== 'split') return;
  count++;
  const state: PState = results.get(block.id)!.prev;
  const whole = block.expr ? hypothesisForm(state, puzzle, block.expr) : { error: 'none' };
  if ('error' in whole) { console.log(`split ${count}: could not evaluate (${whole.error})`); return; }

  const parts = block.parts.map(p => {
    const form = hypothesisForm(state, puzzle, p);
    return 'fact' in form
      ? { cells: form.fact.cells, target: form.fact.target, op: form.fact.op, shape: shape(p) }
      : null;
  });
  const prefix = block.name.trim() || whole.fact.id;
  const produced = parts.map((_, i) => `${prefix}-${i + 1}`);
  const uses = produced.map((id, i) => ({ id, at: usedBy(id, index), part: parts[i] }));

  const allCliques = parts.every(p => p && isClique(p.cells));
  const partsAreOne = parts.every(p => p && p.target === 1);
  console.log(`\nsplit ${count} (statement ${index + 1}): ${printProof([block], puzzle).trim().slice(0, 74)}`);
  console.log(`  whole: ${factName(whole.fact)} = ${whole.fact.target}★ over ${whole.fact.cells.length} cells`);
  console.log(`  parts: ${parts.length} [${parts.map(p => p ? `${p.shape}:${p.cells.length}c=${p.target}` : '?').join(' ')}]` +
    `${allCliques ? '  all cliques' : ''}${partsAreOne ? ', each holds exactly 1' : ''}`);
  console.log(`  parts = target? ${parts.length === whole.fact.target ? 'yes' : `no (${parts.length} parts, ${whole.fact.target}★)`}`);
  for (const u of uses) {
    console.log(`  ${u.id.padEnd(16)} used by ${u.at.length ? u.at.map(a => `#${a + 1}`).join(' ') : '(never)'}` +
      `${u.at.length ? `, first after ${u.at[0] - index} statements` : ''}`);
  }
});
console.log(`\n${count} splits in this proof`);
