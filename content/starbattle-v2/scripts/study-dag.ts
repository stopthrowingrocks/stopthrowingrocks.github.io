/*
 * The proof as a DAG over facts, to see whether contraposition is chain-shaped here.
 *
 * Reversing a chain p->q->r->~p into p->~r->~q->~p works a link at a time because each link
 * has one premise: the contrapositive of `q -> r` is `~r -> ~q`, another single link. A step
 * with two premises does not reverse that way -- the contrapositive of `(a & b) -> c` is
 * `~c -> (~a | ~b)`, a disjunction, so reversing it costs a case split rather than a step.
 *
 * So the question is how many premises a step actually has. In-degree is the number of
 * distinct facts a statement cites; `clique` and `bound` leaves are not counted, since they
 * are built from cells rather than derived from earlier statements.
 */
import { readFileSync } from 'node:fs';
import { parseProof, printProof } from '../src/proofText';
import { parseLevels } from '../src/puzzles';
import { statementCost } from '../src/search';
import levelsData from '../src/levels.json';
import type { Block, HypExpr, Puzzle } from '../src/types';

const puzzle: Puzzle = parseLevels(levelsData)[Number(process.argv[3] ?? 414)];
const blocks = parseProof(readFileSync(process.argv[2], 'utf8'), puzzle);

/** Every fact id cited anywhere in a hypothesis expression. */
function refs(e: HypExpr | null | undefined, out: Set<string> = new Set()): Set<string> {
  if (!e) return out;
  if (e.kind === 'ref') { if (e.factId) out.add(e.factId); return out; }
  if (e.kind === 'add' || e.kind === 'sub' || e.kind === 'combine') {
    refs(e.left, out); refs(e.right, out);
  }
  return out;
}

/** The facts one statement reads, not counting its nested body. */
function premises(b: Block): Set<string> {
  const a = b as any;
  const out = new Set<string>();
  for (const e of [a.expr, a.contradiction] as (HypExpr | null)[]) refs(e, out);
  for (const p of (a.parts ?? []) as HypExpr[]) refs(p, out);
  for (const id of [a.factId, a.targetFactId, a.fromFactId, a.subFactId, a.addFactId, a.toFactId]) {
    if (typeof id === 'string') out.add(id);
  }
  return out;
}

const kids = (b: Block): Block[][] => {
  const a = b as any;
  return [a.body, a.left, a.right, a.positive, a.negative].filter(Boolean);
};
const one = (b: Block) => printProof([{ ...b, body: [], left: [], right: [] } as any], puzzle)
  .split('\n')[0].trim();

const rows: { deg: number; type: string; text: string; cost: number }[] = [];
const walk = (list: Block[]) => {
  for (const b of list) {
    // Container forms derive nothing themselves; their premises are their body's.
    if (!['argument', 'claim', 'suppose', 'constructor', 'or_elim', 'by_cases'].includes(b.type)) {
      rows.push({ deg: premises(b).size, type: b.type, text: one(b), cost: statementCost(b) });
    }
    kids(b).forEach(walk);
  }
};
walk(blocks);

const hist = new Map<number, number>();
for (const r of rows) hist.set(r.deg, (hist.get(r.deg) ?? 0) + 1);
console.log(`${rows.length} derivation steps (containers excluded)\n`);
console.log('premises  steps   share');
for (const deg of [...hist.keys()].sort((a, b) => a - b)) {
  const n = hist.get(deg)!;
  console.log(`  ${String(deg).padStart(5)}  ${String(n).padStart(5)}   ${(100 * n / rows.length).toFixed(1)}%`);
}
const single = rows.filter(r => r.deg <= 1).length;
const multi = rows.filter(r => r.deg >= 2).length;
console.log(`\nreversible a link at a time (<=1 premise): ${single} (${(100 * single / rows.length).toFixed(1)}%)`);
console.log(`reversal needs a case split (>=2 premises): ${multi} (${(100 * multi / rows.length).toFixed(1)}%)`);

console.log('\nby statement type:');
const byType = new Map<string, { n: number; deg: number }>();
for (const r of rows) {
  const g = byType.get(r.type) ?? { n: 0, deg: 0 };
  g.n++; g.deg += r.deg;
  byType.set(r.type, g);
}
for (const [t, g] of [...byType].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${t.padEnd(10)} ${String(g.n).padStart(4)} steps, mean ${(g.deg / g.n).toFixed(2)} premises`);
}

console.log('\nthe widest steps:');
for (const r of rows.sort((a, b) => b.deg - a.deg).slice(0, 6)) {
  console.log(`  ${r.deg} premises  ${r.text.slice(0, 84)}`);
}
