/*
 * Rotation savings measured against the dependency cone, not the span.
 *
 *   npx tsx scripts/study-rotation-cones.ts <proofFile> [index] [--ceiling N] [--show AT]
 *
 * `study-rotation-paths.ts` compared the reverse reading of a step against every statement
 * between the step and the premise it rotates around. That span is the wrong unit: it is a
 * contiguous slice of the proof text, and the steps a conclusion actually needs are a cone in
 * the dependency DAG, which is neither contiguous nor contained in the slice. The span both
 * includes work for other conclusions -- which is why its targets settled dozens of unrelated
 * cells -- and excludes earlier steps the cone reaches back to.
 *
 * So: build the DAG, take the transitive cone of the step, cost that, and compare. Exact, and
 * it needs no replay, which is what defeated the pruned comparison on half the candidates.
 */
import { readFileSync } from 'node:fs';
import { assume, evaluate } from '../src/engine';
import { parseProof, printProof } from '../src/proofText';
import { parseLevels } from '../src/puzzles';
import { saturate } from '../src/saturate';
import { statementCost } from '../src/search';
import levelsData from '../src/levels.json';
import type { Block, BoolExpr, HypExpr, PState, Puzzle } from '../src/types';

const argv = process.argv.slice(2);
const file = argv[0];
const index = Number(argv[1] ?? 414);
const flag = (n: string) => { const i = argv.indexOf(`--${n}`); return i === -1 ? undefined : argv[i + 1]; };
const ceiling = Number(flag('ceiling') ?? 3);
const show = flag('show');
if (!file) { console.error('Usage: study-rotation-cones <proofFile> [index] [--ceiling N] [--show AT]'); process.exit(1); }

const puzzle: Puzzle = parseLevels(levelsData)[index];
const N = puzzle.size;
const blocks = parseProof(readFileSync(file, 'utf8'), puzzle);
const { results } = evaluate(puzzle, blocks);
const label = (i: number) => `${String.fromCharCode(65 + (i % N))}${Math.floor(i / N) + 1}`;
const kids = (b: Block): Block[][] => {
  const a = b as any;
  return [a.body, a.left, a.right, a.positive, a.negative].filter(Boolean);
};
const CONTAINERS = ['argument', 'claim', 'suppose', 'constructor', 'or_elim', 'by_cases'];
const one = (b: Block) =>
  printProof([{ ...b, body: [], left: [], right: [] } as any], puzzle).split('\n')[0].trim();

const lineOf = (id: string): number[] | null => {
  const all = [...Array(N * N).keys()];
  let m = /^row(\d+)$/.exec(id);
  if (m) return all.filter(c => Math.floor(c / N) === Number(m![1]) - 1);
  m = /^col([A-Z])$/.exec(id);
  if (m) return all.filter(c => c % N === m![1].charCodeAt(0) - 65);
  m = /^region(\d+)$/.exec(id);
  if (m) return all.filter(c => puzzle.regions[c] === Number(m![1]) - 1);
  return null;
};
function scan(e: HypExpr | null | undefined, st: PState, cells: Set<number>, ids: Set<string>): void {
  if (!e) return;
  if (e.kind === 'clique' || e.kind === 'bound') { for (const c of e.cells) cells.add(c); return; }
  if (e.kind === 'ref') {
    if (!e.factId) return;
    ids.add(e.factId);
    for (const c of lineOf(e.factId) ?? st.facts.find(f => f.id === e.factId)?.cells ?? []) cells.add(c);
    return;
  }
  scan(e.left, st, cells, ids); scan(e.right, st, cells, ids);
}

type Node = {
  at: number; block: Block; cost: number; prev: PState;
  readCells: number[]; citedFacts: string[]; wroteCells: number[]; madeFacts: string[];
};
const bodies = new Map<string, Node[]>();
const walk = (list: Block[], owner: string) => {
  for (const b of list) {
    const r = results.get(b.id);
    if (r && r.status === 'ok' && !CONTAINERS.includes(b.type)) {
      const a = b as any;
      const cells = new Set<number>(), ids = new Set<string>();
      for (const e of [a.expr, a.contradiction] as (HypExpr | null)[]) scan(e, r.prev, cells, ids);
      for (const p of (a.parts ?? []) as HypExpr[]) scan(p, r.prev, cells, ids);
      for (const id of [a.factId, a.targetFactId, a.fromFactId, a.subFactId, a.addFactId, a.toFactId]) {
        if (typeof id === 'string') ids.add(id);
      }
      const end = r.scope ?? r.state;
      const had = new Set(r.prev.facts.map(f => f.id));
      const here = bodies.get(owner) ?? [];
      here.push({
        at: here.length, block: b, cost: statementCost(b), prev: r.prev,
        readCells: [...cells].filter(c => r.prev.cells[c] !== null),
        citedFacts: [...ids],
        wroteCells: end.cells.map((c, i) => (c !== null && r.prev.cells[i] === null ? i : -1)).filter(i => i >= 0),
        madeFacts: end.facts.filter(f => !had.has(f.id)).map(f => f.id),
      });
      bodies.set(owner, here);
    }
    kids(b).forEach(k => walk(k, b.id));
  }
};
walk(blocks, 'top');

/** Immediate predecessors of every node in a body. */
function predecessors(ns: Node[]): number[][] {
  const settledBy = new Map<number, number>(), madeBy = new Map<string, number>();
  for (const v of ns) {
    for (const c of v.wroteCells) if (!settledBy.has(c)) settledBy.set(c, v.at);
    for (const f of v.madeFacts) if (!madeBy.has(f)) madeBy.set(f, v.at);
  }
  return ns.map(v => {
    const from = new Set<number>();
    for (const c of v.readCells) { const a = settledBy.get(c); if (a !== undefined && a < v.at) from.add(a); }
    for (const f of v.citedFacts) { const a = madeBy.get(f); if (a !== undefined && a < v.at) from.add(a); }
    return [...from].sort((a, b) => a - b);
  });
}

const cellPred = (cell: number, kind: 'is_star' | 'is_elim'): BoolExpr => ({ eid: `k${cell}`, kind, cell });
const opposite = (v: string) => (v === 'star' ? 'is_elim' : 'is_star') as 'is_star' | 'is_elim';

type Row = { owner: string; at: number; C: number; cone: number[]; coneCost: number; reverse: number; span: number };
const rows: Row[] = [];

for (const [owner, ns] of bodies) {
  const pred = predecessors(ns);
  for (const v of ns) {
    if (v.wroteCells.length === 0) continue;
    // Does this step rest on a cell settled earlier in this body? Only then is there a
    // rotation to take, and only then does the cone reach back past the board's own facts.
    const settledHere = new Set<number>();
    for (const w of ns) if (w.at < v.at) for (const c of w.wroteCells) settledHere.add(c);
    const premises = v.readCells.filter(c => settledHere.has(c));
    if (premises.length === 0) continue;

    const cone = new Set<number>();
    const stack = [...pred[v.at]];
    while (stack.length) {
      const x = stack.pop()!;
      if (cone.has(x)) continue;
      cone.add(x);
      for (const p of pred[x]) stack.push(p);
    }
    const base = ns[Math.min(...[...cone, v.at])].prev;
    const C = v.wroteCells.find(c => base.cells[c] === null);
    if (C === undefined) continue;
    const endC = (results.get(v.block.id)!.scope ?? results.get(v.block.id)!.state).cells[C]!;
    const opened = assume(puzzle, base, cellPred(C, opposite(endC)));
    if ('error' in opened) continue;
    const inner = saturate(puzzle, opened.state, st => st.contradiction,
      { maxCeiling: ceiling, noCases: true, timeLimitMs: 5000 });
    if (!inner.state.contradiction) continue;
    const broken = inner.state.facts.find(f => f.impossible);
    if (!broken) continue;
    const rotated: Block = {
      id: `rc-${owner}-${v.at}`, type: 'claim', pred: cellPred(C, endC === 'star' ? 'is_star' : 'is_elim'),
      body: [{ id: `rcb-${owner}-${v.at}`, type: 'by_contradiction', body: inner.blocks,
        contradiction: { eid: `rcv${v.at}`, kind: 'ref', factId: broken.id } }],
    } as Block;
    const coneCost = [...cone, v.at].reduce((n, i) => n + ns[i].cost, 0);
    rows.push({
      owner, at: v.at, C, cone: [...cone].sort((a, b) => a - b), coneCost,
      reverse: statementCost(rotated), span: v.at - Math.min(...[...cone, v.at]) + 1,
    });
  }
}

const wins = rows.filter(r => r.reverse < r.coneCost).sort((a, b) => (a.reverse - a.coneCost) - (b.reverse - b.coneCost));
console.log(`${puzzle.name} #${puzzle.categoryIndex}: ${rows.length} rotations closed at ceiling ${ceiling}\n`);
console.log('cone  cost  reverse   verdict        cell   body');
for (const r of rows.sort((a, b) => (a.reverse - a.coneCost) - (b.reverse - b.coneCost)).slice(0, 14)) {
  const v = r.reverse < r.coneCost ? `SAVES ${r.coneCost - r.reverse}` : `+${r.reverse - r.coneCost}`;
  console.log(`${String(r.cone.length + 1).padStart(4)}  ${String(r.coneCost).padStart(4)}  ${String(r.reverse).padStart(7)}`
    + `   ${v.padEnd(13)}  ${label(r.C).padEnd(5)}  ${r.owner}`);
}
console.log(`\nrotations cheaper than the cone they replace: ${wins.length} of ${rows.length}`);
console.log(`total saving if every one were taken: ${wins.reduce((n, r) => n + r.coneCost - r.reverse, 0)}`);
const ratio = rows.map(r => r.cone.length + 1).sort((a, b) => a - b);
const spans = rows.map(r => r.span).sort((a, b) => a - b);
console.log(`cone size: median ${ratio[Math.floor(ratio.length / 2)]} steps; `
  + `the text span it sits in: median ${spans[Math.floor(spans.length / 2)]}`);

if (show) {
  const [owner, at] = show.split(':');
  const ns = bodies.get(owner);
  const row = rows.find(r => r.owner === owner && r.at === Number(at));
  if (ns && row) {
    const inCone = new Set(row.cone);
    console.log(`\n${owner} step ${at} -> ${label(row.C)}: cone ${row.cone.length + 1} of the ${row.span}-step span`);
    for (let i = Math.min(...row.cone); i <= row.at; i++) {
      const mark = i === row.at ? '=>' : inCone.has(i) ? ' *' : '  ';
      const settles = ns[i].wroteCells.length;
      console.log(`  ${mark} [${String(i).padStart(3)}] cost ${String(ns[i].cost).padStart(2)}`
        + ` settles ${String(settles).padStart(2)}  ${one(ns[i].block).slice(0, 72)}`);
    }
    const off = [...Array(row.at + 1).keys()].filter(i => i >= Math.min(...row.cone) && !inCone.has(i) && i !== row.at);
    const offCells = off.reduce((n, i) => n + ns[i].wroteCells.length, 0);
    console.log(`  ${off.length} steps in the span but off the cone, settling ${offCells} cells`);
  }
}
