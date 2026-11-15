/*
 * Is a refutation contraposable end to end?
 *
 * Per step, 83% of this proof has one premise, which is the shape that reverses a link at a
 * time. But reversing a derivation means reversing every link on it, and a step with two
 * premises turns into a disjunction when reversed. So the question is not the per-step rate,
 * it is whether any whole path from the hypothesis to the contradiction is single-premise.
 *
 * For each by-contradiction this walks back from the fact it cites, through the statements
 * that produced what it reads, and reports the back-cone: its size, its depth, and the
 * widest step on it.
 */
import { readFileSync } from 'node:fs';
import { evaluate } from '../src/engine';
import { parseProof, printProof } from '../src/proofText';
import { parseLevels } from '../src/puzzles';
import levelsData from '../src/levels.json';
import type { Block, HypExpr, Puzzle } from '../src/types';

const puzzle: Puzzle = parseLevels(levelsData)[Number(process.argv[3] ?? 414)];
const blocks = parseProof(readFileSync(process.argv[2], 'utf8'), puzzle);
const { results } = evaluate(puzzle, blocks);

function refs(e: HypExpr | null | undefined, out: Set<string> = new Set()): Set<string> {
  if (!e) return out;
  if (e.kind === 'ref') { if (e.factId) out.add(e.factId); return out; }
  if (e.kind === 'add' || e.kind === 'sub' || e.kind === 'combine') { refs(e.left, out); refs(e.right, out); }
  return out;
}
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

/** Which statement produced each fact: the ids its state has that its entering state did not. */
const producer = new Map<string, Block>();
const indexAll = (list: Block[]) => {
  for (const b of list) {
    const r = results.get(b.id);
    if (r && r.status === 'ok') {
      const had = new Set(r.prev.facts.map(f => f.id));
      for (const f of r.state.facts) if (!had.has(f.id)) if (!producer.has(f.id)) producer.set(f.id, b);
      // A by-contradiction's own branch facts live in its scope, not its after-state.
      if (r.scope) {
        const hadIn = new Set(r.prev.facts.map(f => f.id));
        for (const f of r.scope.facts) if (!hadIn.has(f.id)) if (!producer.has(f.id)) producer.set(f.id, b);
      }
    }
    kids(b).forEach(indexAll);
  }
};
indexAll(blocks);

type Row = { goal: string; cone: number; depth: number; widest: number; wide: number; via: string };
const rows: Row[] = [];
const scan = (list: Block[]) => {
  for (const b of list) {
    if (b.type === 'by_contradiction') {
      const cited = [...refs((b as any).contradiction)];
      const seen = new Set<string>();
      let widest = 0, wide = 0, depth = 0;
      // Breadth-first back through producers, so depth is the longest dependency chain.
      let frontier = cited.filter(id => producer.has(id));
      cited.forEach(id => seen.add(id));
      while (frontier.length) {
        depth++;
        const next: string[] = [];
        for (const id of frontier) {
          const p = producer.get(id);
          if (!p) continue;
          const deg = premises(p).size;
          widest = Math.max(widest, deg);
          if (deg >= 2) wide++;
          for (const dep of premises(p)) if (!seen.has(dep)) { seen.add(dep); next.push(dep); }
        }
        frontier = next.filter(id => producer.has(id));
        if (depth > 200) break;
      }
      const owner = [...seen].length;
      rows.push({
        goal: cited.join(','), cone: owner, depth, widest, wide,
        via: one(b).slice(0, 40),
      });
    }
    kids(b).forEach(scan);
  }
};
scan(blocks);

console.log(`${rows.length} refutations. back-cone of the cited contradiction:\n`);
console.log('facts  depth  widest  wide-steps   cited fact');
for (const r of rows.sort((a, b) => b.cone - a.cone)) {
  console.log(`${String(r.cone).padStart(5)}  ${String(r.depth).padStart(5)}  ${String(r.widest).padStart(6)}`
    + `  ${String(r.wide).padStart(10)}   ${r.goal.slice(0, 38)}`);
}
const clean = rows.filter(r => r.widest <= 1).length;
console.log(`\nrefutations whose whole back-cone is single-premise: ${clean}/${rows.length}`);
const meanDepth = rows.reduce((n, r) => n + r.depth, 0) / rows.length;
console.log(`mean dependency depth: ${meanDepth.toFixed(1)}`);
