/*
 * Build and analyse the dependency DAG of a proof.
 *
 *   npx tsx scripts/study-chain.ts <proofFile> [index] [--out FILE]
 *
 * The engine records no provenance -- `normalize` folds every settled cell into its facts'
 * targets and drops it, so a finished state cannot say what made it. The DAG has to be
 * reconstructed, and there are two ways one step can need another:
 *
 *   cell edge   A settles a cell that B's hypothesis covers and B needs already settled
 *   fact edge   A produces a fact (a split part, a define, a claim's result) that B cites
 *
 * `search.ts` already uses the first for commutativity -- a Move's `reads` and `writes` are
 * cell sets, and `commute` asks whether two moves disturb each other. This is that relation,
 * materialised and closed transitively.
 *
 * Each body is its own DAG. Steps in different bodies are not comparable: a cell settled
 * inside a by-contradiction holds only in that branch.
 *
 * What comes out:
 *   depth     longest chain of genuine dependencies -- the proof's irreducible sequence
 *   width     how many steps sit at the busiest level, all mutually independent
 *   linked    share of step pairs where one depends on the other, transitively
 *   free      the rest: pairs in either order, so the size of the reordering class
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { evaluate } from '../src/engine';
import { parseProof, printProof } from '../src/proofText';
import { parseLevels } from '../src/puzzles';
import { statementCost } from '../src/search';
import levelsData from '../src/levels.json';
import type { Block, HypExpr, PState, Puzzle } from '../src/types';

const argv = process.argv.slice(2);
const file = argv[0];
const index = Number(argv[1] ?? 414);
const flag = (n: string) => { const i = argv.indexOf(`--${n}`); return i === -1 ? undefined : argv[i + 1]; };
if (!file) { console.error('Usage: study-chain <proofFile> [index] [--out FILE]'); process.exit(1); }

const puzzle: Puzzle = parseLevels(levelsData)[index];
const N = puzzle.size;
const blocks = parseProof(readFileSync(file, 'utf8'), puzzle);
const { results } = evaluate(puzzle, blocks);

const kids = (b: Block): Block[][] => {
  const a = b as any;
  return [a.body, a.left, a.right, a.positive, a.negative].filter(Boolean);
};
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

/** Cells covered, and fact ids cited, by one statement's own hypothesis expressions. */
function scan(e: HypExpr | null | undefined, state: PState, cells: Set<number>, ids: Set<string>): void {
  if (!e) return;
  if (e.kind === 'clique' || e.kind === 'bound') { for (const c of e.cells) cells.add(c); return; }
  if (e.kind === 'ref') {
    if (!e.factId) return;
    ids.add(e.factId);
    for (const c of lineOf(e.factId) ?? state.facts.find(f => f.id === e.factId)?.cells ?? []) cells.add(c);
    return;
  }
  scan(e.left, state, cells, ids); scan(e.right, state, cells, ids);
}

type Node = {
  at: number; block: Block; cost: number;
  readCells: number[];   // covered and already settled when it ran
  citedFacts: string[];
  wroteCells: number[];
  madeFacts: string[];
};

const bodies = new Map<string, Node[]>();
/*
 * What each body is for, in readable terms. A body's own container is often a
 * `by_contradiction`, which says nothing on its own -- the useful name is the goal of the
 * claim it argues for, so the label is threaded down the walk and only a `claim` replaces it.
 */
const goals = new Map<string, string>();

/*
 * Which blocks are steps, and which open a timeline of their own.
 *
 * `argument` is pure grouping and `by_contradiction` is a claim's proof method; neither
 * asserts anything, so both are transparent -- their children belong to the timeline around
 * them. A `claim` is the opposite of transparent: it is a step in its parent sequence, since
 * it produces a fact that later steps there cite, AND it owns the timeline of its own
 * argument, which runs under a hypothesis the parent never sees. Treating a claim as only a
 * container drops it from its parent, and with it every edge from "this was proved" to "this
 * uses it".
 */
const TRANSPARENT = ['argument', 'by_contradiction'];
const OPENS = ['claim', 'suppose', 'constructor', 'or_elim', 'by_cases'];

const walk = (list: Block[], owner: string, goal: string) => {
  goals.set(owner, goal);
  for (const b of list) {
    const r = results.get(b.id);
    if (r && r.status === 'ok' && !TRANSPARENT.includes(b.type)) {
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
        at: here.length, block: b, cost: statementCost(b),
        readCells: [...cells].filter(c => r.prev.cells[c] !== null),
        citedFacts: [...ids],
        wroteCells: end.cells.map((c, i) => (c !== null && r.prev.cells[i] === null ? i : -1)).filter(i => i >= 0),
        madeFacts: end.facts.filter(f => !had.has(f.id)).map(f => f.id),
      });
      bodies.set(owner, here);
    }
    kids(b).forEach(k => walk(k, OPENS.includes(b.type) ? b.id : owner,
      b.type === 'claim' ? one(b) : goal));
  }
};
walk(blocks, 'top', 'the proof itself');

/*
 * A claim's own premises. Its predicate is a goal, not a hypothesis expression, so scanning
 * it finds nothing to depend on -- which would park every claim at depth 0. What the claim
 * actually needs from its parent is whatever its argument reached back for: take the reads of
 * the steps inside it, and keep the ones the parent had already settled.
 */
for (const [owner, ns] of bodies) {
  for (const v of ns) {
    if (v.block.type !== 'claim') continue;
    const inside = bodies.get(v.block.id);
    if (!inside) continue;
    const prev = results.get(v.block.id)!.prev;
    const cells = new Set<number>(), ids = new Set<string>();
    for (const w of inside) {
      for (const c of w.readCells) if (prev.cells[c] !== null) cells.add(c);
      for (const f of w.citedFacts) ids.add(f);
    }
    // Only facts that exist outside the argument; the rest were built inside it.
    const outer = new Set(prev.facts.map(f => f.id));
    v.readCells = [...cells];
    v.citedFacts = [...ids].filter(f => outer.has(f));
    void owner;
  }
}

type Report = {
  owner: string; n: number; cost: number; depth: number; width: number;
  linked: number; free: number; edges: number; longest: number[];
};
const reports: Report[] = [];

/** Everything a render needs, keyed by body. Built in the same pass as the report. */
type Dumped = {
  owner: string; label: string; goal: string;
  n: number; cost: number; depth: number; width: number; edges: number;
  linked: number; pairs: number; longest: number[];
  nodes: { at: number; text: string; type: string; cost: number; level: number;
    settles: string[]; preds: number[] }[];
};
const dumped: Dumped[] = [];

const cellLabel = (i: number) => `${String.fromCharCode(65 + (i % N))}${Math.floor(i / N) + 1}`;

for (const [owner, nodes] of bodies) {
  const n = nodes.length;
  if (n === 0) continue;
  // ── edges ────────────────────────────────────────────────────────────────────
  const settledBy = new Map<number, number>();
  const madeBy = new Map<string, number>();
  for (const v of nodes) {
    for (const c of v.wroteCells) if (!settledBy.has(c)) settledBy.set(c, v.at);
    for (const f of v.madeFacts) if (!madeBy.has(f)) madeBy.set(f, v.at);
  }
  const pred: number[][] = nodes.map(() => []);
  let edges = 0;
  for (const v of nodes) {
    const from = new Set<number>();
    for (const c of v.readCells) { const a = settledBy.get(c); if (a !== undefined && a < v.at) from.add(a); }
    for (const f of v.citedFacts) { const a = madeBy.get(f); if (a !== undefined && a < v.at) from.add(a); }
    pred[v.at] = [...from];
    edges += from.size;
  }
  // ── longest path, by layering in index order (edges always go forward) ───────
  const level = new Array(n).fill(0);
  const back = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    for (const p of pred[i]) {
      if (level[p] + 1 > level[i]) { level[i] = level[p] + 1; back[i] = p; }
    }
  }
  const depth = Math.max(...level) + 1;
  const counts = new Map<number, number>();
  for (const l of level) counts.set(l, (counts.get(l) ?? 0) + 1);
  const width = Math.max(...counts.values());
  // the longest chain itself
  let end = level.indexOf(Math.max(...level));
  const longest: number[] = [];
  while (end !== -1) { longest.unshift(end); end = back[end]; }
  // ── transitive closure, for how many pairs are genuinely ordered ─────────────
  const reach: Set<number>[] = nodes.map(() => new Set<number>());
  for (let i = 0; i < n; i++) {
    for (const p of pred[i]) { reach[i].add(p); for (const q of reach[p]) reach[i].add(q); }
  }
  const linked = reach.reduce((t, s) => t + s.size, 0);
  const pairs = (n * (n - 1)) / 2;
  reports.push({
    owner, n, cost: nodes.reduce((t, v) => t + v.cost, 0), depth, width,
    linked, free: pairs - linked, edges, longest,
  });

  dumped.push({
    owner,
    label: owner === 'top' ? 'top level' : owner,
    goal: goals.get(owner) ?? 'the proof itself',
    n, cost: nodes.reduce((t, v) => t + v.cost, 0), depth, width, edges, linked, pairs, longest,
    nodes: nodes.map(v => ({
      at: v.at, text: one(v.block), type: v.block.type, cost: v.cost, level: level[v.at],
      settles: v.wroteCells.map(cellLabel), preds: pred[v.at],
    })),
  });
}

reports.sort((a, b) => b.n - a.n);
console.log(`${puzzle.name} #${puzzle.categoryIndex}: ${reports.length} bodies, `
  + `${reports.reduce((t, r) => t + r.n, 0)} steps\n`);
console.log('steps  depth  width  edges   ordered pairs   reorderable   body');
for (const r of reports.slice(0, 14)) {
  const pairs = (r.n * (r.n - 1)) / 2;
  const pct = pairs ? (100 * r.linked / pairs).toFixed(1) : '—';
  console.log(`${String(r.n).padStart(5)}  ${String(r.depth).padStart(5)}  ${String(r.width).padStart(5)}`
    + `  ${String(r.edges).padStart(5)}   ${String(r.linked).padStart(6)}/${String(pairs).padEnd(6)} ${String(pct).padStart(5)}%`
    + `   ${String(r.free).padStart(6)}       ${r.owner}`);
}

const allPairs = reports.reduce((t, r) => t + (r.n * (r.n - 1)) / 2, 0);
const allLinked = reports.reduce((t, r) => t + r.linked, 0);
console.log(`\nacross every body: ${allLinked} of ${allPairs} step pairs are genuinely ordered `
  + `(${(100 * allLinked / allPairs).toFixed(1)}%)`);
console.log(`the other ${allPairs - allLinked} could be written in either order.`);

const big = reports[0];
console.log(`\nlongest dependency chain in the largest body (${big.n} steps, depth ${big.depth}):`);
const nodes = bodies.get(big.owner)!;
for (const i of big.longest) {
  console.log(`  [${String(i).padStart(3)}] cost ${String(nodes[i].cost).padStart(3)}  ${one(nodes[i].block).slice(0, 86)}`);
}

const json = flag('json');
if (json) {
  dumped.sort((a, b) => b.n - a.n);
  writeFileSync(json, JSON.stringify({
    puzzle: `${puzzle.name} #${puzzle.categoryIndex}`, size: N, file, bodies: dumped,
  }, null, 1), 'utf8');
  console.log(`\nDAG as JSON written to ${json}`);
}

const out = flag('out');
if (out) {
  const lines: string[] = [`# dependency DAG: ${file}`, `# ${puzzle.name} #${puzzle.categoryIndex}`, ''];
  for (const r of reports) {
    const ns = bodies.get(r.owner)!;
    lines.push(`## ${r.owner}: ${r.n} steps, cost ${r.cost}, depth ${r.depth}, width ${r.width}, `
      + `${r.edges} edges, ${r.free} reorderable pairs`);
    for (const v of ns) {
      lines.push(`  [${String(v.at).padStart(3)}] <- [${pred0(r.owner, v.at).join(' ')}]  ${one(v.block).slice(0, 92)}`);
    }
    lines.push('');
  }
  writeFileSync(out, `${lines.join('\n')}\n`, 'utf8');
  console.log(`\nfull DAG written to ${out}`);
}

/** Predecessors recomputed for the report file. */
function pred0(owner: string, at: number): number[] {
  const ns = bodies.get(owner)!;
  const settledBy = new Map<number, number>(), madeBy = new Map<string, number>();
  for (const v of ns) {
    for (const c of v.wroteCells) if (!settledBy.has(c)) settledBy.set(c, v.at);
    for (const f of v.madeFacts) if (!madeBy.has(f)) madeBy.set(f, v.at);
  }
  const v = ns[at];
  const from = new Set<number>();
  for (const c of v.readCells) { const a = settledBy.get(c); if (a !== undefined && a < at) from.add(a); }
  for (const f of v.citedFacts) { const a = madeBy.get(f); if (a !== undefined && a < at) from.add(a); }
  return [...from].sort((a, b) => a - b);
}
