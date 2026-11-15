/*
 * Rotation analysis: are the reverse readings of this proof's steps actually traversable?
 *
 *   npx tsx scripts/study-rotation-paths.ts <proofFile> [index] [--out FILE] [--ceiling N]
 *
 * Classifying literals says how many rotations a step admits. This asks whether they go
 * anywhere, which needs care about WHERE a rotation lives.
 *
 * Step S reads a settled cell Y and settles C. Rotating S around Y reads
 * `(other premises) & ~C  ==>  ~Y`. That cannot be checked at S's own position: by then Y is
 * settled, so assuming ~C there contradicts immediately and only re-confirms S. The rotation
 * belongs at the position just before Y was settled -- call that step A. There Y is still
 * open, and so is C, since S comes after A.
 *
 * So for each step S this takes a premise cell Y settled earlier in the same body by step A,
 * rewinds to just before A, assumes ~C, and saturates to a contradiction.
 *
 * Asking merely WHETHER that contradicts is no question at all: C follows deductively from
 * that state, so assuming ~C there is unsatisfiable by soundness, and a yes only reports that
 * the saturator was strong enough to notice. What is worth measuring is the PRICE. The
 * forward route spends steps A..S to reach C; the reverse route spends one claim whose body
 * is the refutation of ~C. Where the reverse is cheaper, the rotation is a real saving.
 *
 * Y is taken as the EARLIEST premise settled in this body, so the rewind spans as much of the
 * proof as the rotation could replace.
 *
 * The comparison is indicative, not a verdict: steps A..S may settle cells besides C, which a
 * claim proving only C would not. The top candidates are re-checked by substitution.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { applyStep, assume, evaluate } from '../src/engine';
import { parseProof, printProof } from '../src/proofText';
import { parseLevels } from '../src/puzzles';
import { prune, saturate } from '../src/saturate';
import { statementCost } from '../src/search';
import levelsData from '../src/levels.json';
import type { Block, BoolExpr, HypExpr, PState, Puzzle } from '../src/types';

const argv = process.argv.slice(2);
const file = argv[0];
const index = Number(argv[1] ?? 414);
const flag = (n: string) => { const i = argv.indexOf(`--${n}`); return i === -1 ? undefined : argv[i + 1]; };
const ceiling = Number(flag('ceiling') ?? 3);
if (!file) { console.error('Usage: study-rotation-paths <proofFile> [index] [--out FILE] [--ceiling N]'); process.exit(1); }

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

/** The cells a hypothesis expression covers, facts expanded to their full board cell set. */
function covered(e: HypExpr | null | undefined, state: PState, out: Set<number> = new Set()): Set<number> {
  if (!e) return out;
  if (e.kind === 'clique' || e.kind === 'bound') { for (const c of e.cells) out.add(c); return out; }
  if (e.kind === 'ref') {
    if (!e.factId) return out;
    const all = [...Array(N * N).keys()];
    let m = /^row(\d+)$/.exec(e.factId);
    if (m) { for (const c of all.filter(c => Math.floor(c / N) === Number(m![1]) - 1)) out.add(c); return out; }
    m = /^col([A-Z])$/.exec(e.factId);
    if (m) { for (const c of all.filter(c => c % N === m![1].charCodeAt(0) - 65)) out.add(c); return out; }
    m = /^region(\d+)$/.exec(e.factId);
    if (m) { for (const c of all.filter(c => puzzle.regions[c] === Number(m![1]) - 1)) out.add(c); return out; }
    for (const c of state.facts.find(f => f.id === e.factId)?.cells ?? []) out.add(c);
    return out;
  }
  covered(e.left, state, out); covered(e.right, state, out);
  return out;
}

/*
 * Steps grouped by the body they sit in, each body in its own timeline.
 *
 * A body's steps form a chain of states, but steps in DIFFERENT bodies do not: a cell settled
 * inside a by-contradiction is settled only in that branch, which is refuted. Pooling them
 * into one sequence makes a branch-local cell look like board state, and the rewind then
 * lands in a context that never held it. So every rotation stays inside one body.
 */
type Step = { at: number; block: Block; prev: PState; reads: Set<number>; writes: number[] };
const bodies = new Map<string, Step[]>();
const walk = (list: Block[], owner: string) => {
  for (const b of list) {
    const r = results.get(b.id);
    if (r && r.status === 'ok' && !CONTAINERS.includes(b.type)) {
      const a = b as any;
      const reads = new Set<number>();
      for (const e of [a.expr, a.contradiction] as (HypExpr | null)[]) covered(e, r.prev, reads);
      for (const p of (a.parts ?? []) as HypExpr[]) covered(p, r.prev, reads);
      const end = r.scope ?? r.state;
      const writes = end.cells
        .map((c, i) => (c !== null && r.prev.cells[i] === null ? i : -1)).filter(i => i >= 0);
      const here = bodies.get(owner) ?? [];
      here.push({ at: here.length, block: b, prev: r.prev, reads, writes });
      bodies.set(owner, here);
    }
    // Each container opens a fresh timeline for its own body.
    kids(b).forEach(k => walk(k, b.id));
  }
};
walk(blocks, 'top');

const cellPred = (cell: number, kind: 'is_star' | 'is_elim'): BoolExpr => ({ eid: `r${cell}`, kind, cell });
const opposite = (v: string) => (v === 'star' ? 'is_elim' : 'is_star') as 'is_star' | 'is_elim';

type Row = {
  at: number; text: string; Y: number; A: number; C: number;
  forward: number; reverse: number; span: number; extra: number; note: string;
};
const rows: Row[] = [];
const t0 = Date.now();
let total = 0;

for (const [owner, steps] of bodies) {
  // Within this body only: which of its steps first settled each cell.
  const settledBy = new Map<number, number>();
  for (const s of steps) for (const c of s.writes) if (!settledBy.has(c)) settledBy.set(c, s.at);
  total += steps.length;

  for (const s of steps) {
    if (s.writes.length === 0) continue;
    // Premise cells: read by this step, settled before it ran, and settled in THIS body --
    // a cell the body inherited already settled has no step here to rewind behind.
    const premises = [...s.reads]
      .filter(c => s.prev.cells[c] !== null && settledBy.has(c) && settledBy.get(c)! < s.at);
    if (premises.length === 0) continue;
    // The EARLIEST premise settled here: the longest rewind, so the widest span a rotation
    // could replace.
    const Y = premises.reduce((best, c) => (settledBy.get(c)! < settledBy.get(best)! ? c : best), premises[0]);
    const A = settledBy.get(Y)!;
    const base = steps[A].prev;
    const C = s.writes.find(c => base.cells[c] === null);
    if (C === undefined || base.cells[Y] !== null) continue;

    const want = results.get(s.block.id)!;
    const endC = (want.scope ?? want.state).cells[C]!;
    const opened = assume(puzzle, base, cellPred(C, opposite(endC)));
    if ('error' in opened) continue;
    const inner = saturate(puzzle, opened.state, st => st.contradiction,
      { maxCeiling: ceiling, noCases: true, timeLimitMs: 5000 });
    if (!inner.state.contradiction) continue;   // the saturator could not find the reverse

    const broken = inner.state.facts.find(f => f.impossible);
    if (!broken) continue;
    const rotated: Block = {
      id: `rot-${owner}-${s.at}`, type: 'claim', pred: cellPred(C, endC === 'star' ? 'is_star' : 'is_elim'),
      body: [{ id: `rot-bc-${owner}-${s.at}`, type: 'by_contradiction', body: inner.blocks,
        contradiction: { eid: `rv${s.at}`, kind: 'ref', factId: broken.id } }],
    } as Block;

    const span = steps.slice(A, s.at + 1);
    const forward = span.reduce((n, x) => n + statementCost(x.block), 0);
    const reverse = statementCost(rotated);
    // Cells the replaced span settles besides C: what a claim proving only C would drop.
    const sEnd = want.scope ?? want.state;
    const extra = sEnd.cells.filter((c, i) => c !== null && base.cells[i] === null && i !== C).length;
    rows.push({ at: s.at, text: one(s.block), Y, A, C, forward, reverse, span: span.length, extra,
      note: owner === 'top' ? '' : `in ${owner}` });
  }
}

const cheaper = rows.filter(r => r.reverse < r.forward).sort((a, b) => (a.reverse - a.forward) - (b.reverse - b.forward));
console.log(`${puzzle.name} #${puzzle.categoryIndex}: ${total} steps across ${bodies.size} bodies, `
  + `${rows.length} rotations the saturator could close. ceiling ${ceiling}\n`);
console.log(`reverse cheaper than forward: ${cheaper.length} of ${rows.length}`);
const spans = rows.map(r => r.span).sort((a, b) => a - b);
console.log(`span a rotation would replace: median ${spans[Math.floor(spans.length / 2)]} steps, `
  + `max ${spans[spans.length - 1]}`);
console.log(`\nbest candidates (forward cost -> reverse cost, cells lost besides the target):`);
for (const r of cheaper.slice(0, 10)) {
  console.log(`  [${String(r.at).padStart(3)}] ${String(r.forward).padStart(3)} -> ${String(r.reverse).padStart(3)}`
    + `  over ${String(r.span).padStart(2)} steps, ${r.extra} other cells  ${label(r.C)}  ${r.note}`);
}
/*
 * The fair comparison. A span settles much more than C, so its whole cost is the wrong
 * denominator -- the reverse claim proves C alone. Delta-debug the span down to the
 * statements C actually needs, and compare against that.
 */
console.log('\nagainst the pruned forward derivation of the target cell alone:');
let realWins = 0;
for (const r of cheaper.slice(0, 13)) {
  const steps = bodies.get(r.note.replace(/^in /, '') || 'top');
  if (!steps) continue;
  const base = steps[r.A].prev;
  const span = steps.slice(r.A, r.at + 1).map(x => x.block);
  const endC = (results.get(steps[r.at].block.id)!.scope ?? results.get(steps[r.at].block.id)!.state).cells[r.C];
  const holds = (list: Block[]) => {
    let st = base;
    for (const b of list) {
      const step = applyStep(puzzle, st, b);
      if (step.status !== 'ok') return false;
      st = step.state;
    }
    return st.cells[r.C] === endC;
  };
  if (!holds(span)) continue;              // the span does not reproduce outside its body
  const need = prune(span, holds);
  const needCost = need.reduce((n, b) => n + statementCost(b), 0);
  const verdict = r.reverse < needCost ? `SAVES ${needCost - r.reverse}` : `no win (+${r.reverse - needCost})`;
  if (r.reverse < needCost) realWins++;
  console.log(`  [${String(r.at).padStart(3)}] ${label(r.C)}: span ${r.forward} -> needed ${needCost}`
    + ` (${need.length}/${span.length} steps) vs reverse ${r.reverse}   ${verdict}`);
}
console.log(`\nrotations that beat the derivation they would replace: ${realWins}`);
console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`);

const out = flag('out');
if (out) {
  const lines = [`# rotation analysis: ${file}`, `# ${puzzle.name} #${puzzle.categoryIndex}, ceiling ${ceiling}`, ''];
  for (const r of rows.sort((a, b) => (a.reverse - a.forward) - (b.reverse - b.forward))) {
    const verdict = r.reverse < r.forward ? `SAVES ${r.forward - r.reverse}` : `costs ${r.reverse - r.forward} more`;
    lines.push(`[${String(r.at).padStart(3)}] ${verdict.padEnd(18)} forward ${r.forward} -> reverse ${r.reverse}`
      + `  rotate around ${label(r.Y)} (step ${r.A}), assume ~${label(r.C)}`
      + `, span ${r.span} steps, ${r.extra} other cells${r.note ? `, ${r.note}` : ''}`);
    lines.push(`      ${r.text.slice(0, 100)}`);
  }
  writeFileSync(out, `${lines.join('\n')}\n`, 'utf8');
  console.log(`\nper-step report written to ${out}`);
}
