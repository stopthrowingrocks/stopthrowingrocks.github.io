/*
 * Which rotations of a proof step are usable?
 *
 * A step is a clause: `~F1 | ~F2 | ~(cells read) | (cell written)`. Any literal can be the
 * head, which is what makes `(1&2&3)->4` and `(1&2&~4)->~3` the same step written twice. A
 * rotation is usable when the literal moved to the head negates into something this engine
 * can still reason with, so the question is per literal kind:
 *
 *   cell          star or elim, exhaustive and exclusive          -> EXTENDS, immediately
 *   `<=`/`!=`     negation is `>=` / `=`, the strongest facts     -> EXTENDS, immediately
 *   `=` fact      negation is `!=`                                -> EXTENDS, deferred
 *   clique/bound  `<= 1` over adjacent cells -> `>= 2`            -> TERMINATES
 *
 * Two cases need care.
 *
 * A clique's negation is syntactically live, but `applyClique` only accepts pairwise-adjacent
 * cells, so `<= 1` is a theorem of the no-adjacent-stars rule rather than a hypothesis. Its
 * negation is unsatisfiable, so rotating a clique into the head yields a contradiction rather
 * than a fact to carry on from -- useful, since that is how a refutation closes, but it ends
 * a path instead of extending it. Same for `bound`, whose `>= 0` and single-cell `<= 1` forms
 * are likewise rule-forced.
 *
 * An `=` fact negates to `!=`, which is weaker but not dead: `applyStars` fires a `!= 0` once
 * it narrows to one cell, and `applyElims` fires a `!= 1` the same way, so a `!=` waits
 * rather than sitting inert. It extends a path on a delay.
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
const N = puzzle.size;

/** The full cell set of a line fact id (`row3`, `colB`, `region7`), straight from the board. */
function lineCells(id: string): number[] | null {
  const all = [...Array(N * N).keys()];
  let m = /^row(\d+)$/.exec(id);
  if (m) return all.filter(c => Math.floor(c / N) === Number(m![1]) - 1);
  m = /^col([A-Z])$/.exec(id);
  if (m) return all.filter(c => c % N === m![1].charCodeAt(0) - 65);
  m = /^region(\d+)$/.exec(id);
  if (m) return all.filter(c => puzzle.regions[c] === Number(m![1]) - 1);
  return null;
}

/** Pairwise adjacent, so the set carries `count <= 1` from the no-adjacent-stars rule. */
function isClique(cells: number[]): boolean {
  if (cells.length < 2) return cells.length === 1;
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const [a, b] = [cells[i], cells[j]];
      const dr = Math.abs(Math.floor(a / N) - Math.floor(b / N));
      const dc = Math.abs((a % N) - (b % N));
      if (dr > 1 || dc > 1) return false;
    }
  }
  return true;
}

type Tally = { cells: number; terminal: number; strong: number; clean: number; deferred: number };
function literals(e: HypExpr | null | undefined, state: PState, t: Tally, covered: Set<number>): void {
  if (!e) return;
  // Rule-forced, so the negation is unsatisfiable: these close a path, not extend it.
  if (e.kind === 'clique' || e.kind === 'bound') {
    t.terminal++;
    for (const c of e.cells) covered.add(c);
    return;
  }
  if (e.kind === 'ref') {
    if (!e.factId) return;
    const fact = state.facts.find(f => f.id === e.factId);
    if (fact?.op !== '=') t.strong++;
    // `= k` negates to `!= k`, which `applyCombine` tightens to an exact value given a bound
    // one step from k. A pairwise-adjacent set carries `<= 1` for free, so `= 1` over one
    // negates cleanly to `= 0`; a whole-line `= 3` over 14 cells has no such bound to hand.
    else if (isClique(fact.cells) && fact.target === 1) t.clean++;
    else t.deferred++;
    const cs = lineCells(e.factId) ?? fact?.cells ?? [];
    for (const c of cs) covered.add(c);
    return;
  }
  literals(e.left, state, t, covered);
  literals(e.right, state, t, covered);
}

const kids = (b: Block): Block[][] => {
  const a = b as any;
  return [a.body, a.left, a.right, a.positive, a.negative].filter(Boolean);
};
const CONTAINERS = ['argument', 'claim', 'suppose', 'constructor', 'or_elim', 'by_cases'];

const rows: (Tally & { usable: number })[] = [];
const walk = (list: Block[]) => {
  for (const b of list) {
    const r = results.get(b.id);
    const a = b as any;
    if (r && r.status === 'ok' && !CONTAINERS.includes(b.type)) {
      const t: Tally = { cells: 0, terminal: 0, strong: 0, clean: 0, deferred: 0 };
      const covered = new Set<number>();
      for (const e of [a.expr, a.contradiction] as (HypExpr | null)[]) literals(e, r.prev, t, covered);
      for (const p of (a.parts ?? []) as HypExpr[]) literals(p, r.prev, t, covered);
      t.cells = [...covered].filter(c => r.prev.cells[c] !== null).length;
      rows.push({ ...t, usable: t.cells + t.strong + t.clean });
    }
    kids(b).forEach(walk);
  }
};
walk(blocks);

const sum = (f: (r: typeof rows[0]) => number) => rows.reduce((n, r) => n + f(r), 0);
const stat = (f: (r: typeof rows[0]) => number) => {
  const s = rows.map(f).sort((a, b) => a - b);
  return { median: s[Math.floor(s.length / 2)], mean: s.reduce((n, x) => n + x, 0) / s.length, max: s[s.length - 1] };
};

console.log(`${rows.length} derivation steps\n`);
console.log('literals across the proof, by what rotating them into the head yields:');
console.log(`  settled cells        ${String(sum(r => r.cells)).padStart(5)}   exact at once (star <-> elim)`);
console.log(`  <=, >=, != facts     ${String(sum(r => r.strong)).padStart(5)}   exact at once`);
console.log(`  "= 1" on a clique    ${String(sum(r => r.clean)).padStart(5)}   exact via one combine`);
console.log(`  other "=" facts      ${String(sum(r => r.deferred)).padStart(5)}   a != that waits for a bound`);
console.log(`  cliques and bounds   ${String(sum(r => r.terminal)).padStart(5)}   a contradiction: closes a path`);
const total = sum(r => r.usable) + sum(r => r.deferred) + sum(r => r.terminal);
console.log(`\nliterals rotating to an exact fact: ${(100 * sum(r => r.usable) / total).toFixed(1)}% of ${total}`);

const u = stat(r => r.usable);
console.log(`exact rotations per step: median ${u.median}, mean ${u.mean.toFixed(1)}, max ${u.max}`);
const stuck = rows.filter(r => r.usable === 0).length;
console.log(`steps with no exact rotation: ${stuck} (${(100 * stuck / rows.length).toFixed(1)}%)`);
console.log(`  of those, ones a clique/bound can still close: `
  + `${rows.filter(r => r.usable === 0 && r.terminal > 0).length}`);
