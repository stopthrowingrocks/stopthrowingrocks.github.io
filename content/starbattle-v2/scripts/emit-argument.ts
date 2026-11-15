/*
 * Emit one argument as a sequence: each statement with the board as it stands after it.
 *
 *   npx tsx scripts/emit-argument.ts <proofFile> <index> <goal substring> --out FILE
 *
 * The DAG says what depends on what; this says what the board looked like while it happened.
 * Steps are the direct statements of one body, in written order, with the cells each one
 * settles called out -- the board inside a by-contradiction, which the outer proof never sees.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { evaluate } from '../src/engine';
import { parseProof, printProof } from '../src/proofText';
import { parseLevels } from '../src/puzzles';
import { statementCost } from '../src/search';
import levelsData from '../src/levels.json';
import type { Block, HypExpr, PState, Puzzle } from '../src/types';

const argv = process.argv.slice(2);
const file = argv[0], index = Number(argv[1]), want = argv[2];
const flag = (n: string) => { const i = argv.indexOf(`--${n}`); return i === -1 ? undefined : argv[i + 1]; };
if (!file || !Number.isInteger(index) || !want) {
  console.error('Usage: emit-argument <proofFile> <index> <goal substring> [--out FILE]');
  process.exit(1);
}

const puzzle: Puzzle = parseLevels(levelsData)[index];
const N = puzzle.size;
const blocks = parseProof(readFileSync(file, 'utf8'), puzzle);
const { results } = evaluate(puzzle, blocks);

const kids = (b: Block): Block[][] => {
  const a = b as any;
  return [a.body, a.left, a.right, a.positive, a.negative].filter(Boolean);
};
const TRANSPARENT = ['argument', 'by_contradiction'];
const OPENS = ['claim', 'suppose', 'constructor', 'or_elim', 'by_cases'];
const one = (b: Block) =>
  printProof([{ ...b, body: [], left: [], right: [] } as any], puzzle).split('\n')[0].trim();
const cellLabel = (i: number) => `${String.fromCharCode(65 + (i % N))}${Math.floor(i / N) + 1}`;
const board = (s: PState) => s.cells.map(c => (c === 'star' ? 'S' : c === 'elim' ? 'X' : '.')).join('');

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

type Step = {
  at: number; text: string; type: string; cost: number; nested: number;
  settles: string[]; reads: string[]; cites: string[];
  boardAfter: string; note: string;
};
const found = new Map<string, { goal: string; steps: Step[]; enter: PState }>();

const walk = (list: Block[], owner: string, goal: string) => {
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
      const entry = found.get(owner) ?? { goal, steps: [], enter: r.prev };
      // How many statements this one contains, so a claim shows the size of its argument.
      let nested = -1;
      const count = (l: Block[]) => { for (const x of l) { nested++; kids(x).forEach(count); } };
      count([b]);
      entry.steps.push({
        at: entry.steps.length, text: one(b), type: b.type, cost: statementCost(b), nested,
        settles: end.cells.map((c, i) => (c !== null && r.prev.cells[i] === null ? i : -1))
          .filter(i => i >= 0).map(cellLabel),
        reads: [...cells].filter(c => r.prev.cells[c] !== null).map(cellLabel),
        cites: [...ids],
        boardAfter: board(end),
        note: r.note ?? '',
      });
      found.set(owner, entry);
    }
    kids(b).forEach(k => walk(k, OPENS.includes(b.type) ? b.id : owner,
      b.type === 'claim' ? one(b) : goal));
  }
};
walk(blocks, 'top', 'the proof itself');

/*
 * More than one body can share a goal -- `is-elim L11` is proved twice in this proof, once
 * for cost 8 inside another argument and once for 390 at the top level. Take the largest
 * match and say so, rather than silently picking whichever came first.
 */
const hits = [...found.entries()]
  .filter(([, v]) => v.goal.includes(want))
  .sort((a, b) => b[1].steps.length - a[1].steps.length);
if (hits.length === 0) {
  console.error(`no body whose goal contains "${want}". Available:`);
  for (const [, v] of found) console.error(`  ${v.steps.length.toString().padStart(3)}  ${v.goal}`);
  process.exit(2);
}
if (hits.length > 1) {
  console.log(`${hits.length} bodies match; taking the largest `
    + `(${hits.map(([, v]) => v.steps.length).join(', ')} statements)`);
}
const [owner, body] = hits[0];
console.log(`${body.goal}  (${owner})`);
console.log(`${body.steps.length} statements, cost ${body.steps.reduce((n, s) => n + s.cost, 0)}`);
const settledIn = body.steps.reduce((n, s) => n + s.settles.length, 0);
console.log(`settles ${settledIn} cells inside the hypothesis`);

const payload = {
  puzzle: `${puzzle.name} #${puzzle.categoryIndex}`,
  size: N, stars: puzzle.stars, regions: puzzle.regions,
  goal: body.goal, owner,
  boardBefore: board(body.enter),
  steps: body.steps,
};
const out = flag('out');
if (out) { writeFileSync(out, JSON.stringify(payload, null, 1), 'utf8'); console.log(`written to ${out}`); }
