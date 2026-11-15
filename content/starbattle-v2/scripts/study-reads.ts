/*
 * What a step actually depends on.
 *
 * The fact-level view says 83% of steps cite one fact, which looks like a chain. But the
 * facts cited are mostly the board's own line constraints -- `row14`, `region13` -- which no
 * statement produced. What a step really consumes is cell knowledge: it reads the cells its
 * cliques and line facts cover, and writes the ones it settles. That is the DAG, and
 * `search.ts` already works this way -- a Move's `reads` and `writes` are sets of cells,
 * used to decide which moves commute.
 *
 * This matters for contraposition. Reversing `q -> r` is another single link only if q is one
 * proposition. If the step's premise is "these fourteen cells are as they are", the reverse
 * is "one of those fourteen is not", a disjunction, and the reversed proof needs a case split
 * over it rather than a step.
 */
import { readFileSync } from 'node:fs';
import { evaluate } from '../src/engine';
import { parseProof } from '../src/proofText';
import { parseLevels } from '../src/puzzles';
import levelsData from '../src/levels.json';
import type { Block, HypExpr, PState, Puzzle } from '../src/types';

const puzzle: Puzzle = parseLevels(levelsData)[Number(process.argv[3] ?? 414)];
const blocks = parseProof(readFileSync(process.argv[2], 'utf8'), puzzle);
const { results } = evaluate(puzzle, blocks);

/** Cells a hypothesis expression covers: clique and bound leaves directly, facts by lookup. */
function cells(e: HypExpr | null | undefined, state: PState, out: Set<number> = new Set()): Set<number> {
  if (!e) return out;
  if (e.kind === 'clique' || e.kind === 'bound') { for (const c of e.cells) out.add(c); return out; }
  if (e.kind === 'ref') {
    const fact = state.facts.find(f => f.id === e.factId);
    if (fact) for (const c of fact.cells) out.add(c);
    return out;
  }
  cells(e.left, state, out); cells(e.right, state, out);
  return out;
}

const kids = (b: Block): Block[][] => {
  const a = b as any;
  return [a.body, a.left, a.right, a.positive, a.negative].filter(Boolean);
};

const rows: { read: number; known: number; wrote: number; type: string }[] = [];
const walk = (list: Block[]) => {
  for (const b of list) {
    const r = results.get(b.id);
    const a = b as any;
    if (r && r.status === 'ok' && !['argument', 'claim', 'suppose', 'constructor', 'or_elim', 'by_cases'].includes(b.type)) {
      const read = new Set<number>();
      for (const e of [a.expr, a.contradiction] as (HypExpr | null)[]) cells(e, r.prev, read);
      for (const p of (a.parts ?? []) as HypExpr[]) cells(p, r.prev, read);
      // Only cells already settled on entry can be a premise; the rest are unknowns.
      const known = [...read].filter(c => r.prev.cells[c] !== null).length;
      const end = r.scope ?? r.state;
      const wrote = end.cells.filter((c, i) => c !== null && r.prev.cells[i] === null).length;
      rows.push({ read: read.size, known, wrote, type: b.type });
    }
    kids(b).forEach(walk);
  }
};
walk(blocks);

const stat = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return { median: s[Math.floor(s.length / 2)], mean: s.reduce((n, x) => n + x, 0) / s.length, max: s[s.length - 1] };
};
const known = stat(rows.map(r => r.known));
console.log(`${rows.length} derivation steps\n`);
console.log(`cells covered per step:        median ${stat(rows.map(r => r.read)).median}, `
  + `mean ${stat(rows.map(r => r.read)).mean.toFixed(1)}, max ${stat(rows.map(r => r.read)).max}`);
console.log(`of those, already settled:     median ${known.median}, mean ${known.mean.toFixed(1)}, max ${known.max}`);
console.log(`cells the step settles:        median ${stat(rows.map(r => r.wrote)).median}, `
  + `mean ${stat(rows.map(r => r.wrote)).mean.toFixed(1)}, max ${stat(rows.map(r => r.wrote)).max}`);

const one = rows.filter(r => r.known <= 1).length;
console.log(`\nsteps resting on at most one settled cell: ${one} (${(100 * one / rows.length).toFixed(1)}%)`);
console.log('a step resting on n settled cells reverses into a disjunction over n of them.\n');
const hist = new Map<number, number>();
for (const r of rows) {
  const bucket = r.known === 0 ? 0 : r.known <= 2 ? 2 : r.known <= 5 ? 5 : r.known <= 10 ? 10 : 99;
  hist.set(bucket, (hist.get(bucket) ?? 0) + 1);
}
for (const b of [0, 2, 5, 10, 99]) {
  const n = hist.get(b) ?? 0;
  const name = b === 0 ? '0' : b === 99 ? '11+' : `<=${b}`;
  console.log(`  ${name.padStart(4)} settled-cell premises: ${String(n).padStart(4)} (${(100 * n / rows.length).toFixed(1)}%)`);
}
