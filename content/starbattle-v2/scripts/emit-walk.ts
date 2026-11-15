/*
 * Emit one argument as a full walk: every statement at every nesting level, with the board.
 *
 *   npx tsx scripts/emit-walk.ts <proofFile> <index> <goal substring> [--out FILE]
 *
 * `emit-argument.ts` lists a body's own statements and shows a nested claim as a single row,
 * so the cells that claim proves arrive from nowhere. This walks into them.
 *
 * Containers get two rows rather than one, because the interesting part of an argument is
 * that it is discarded:
 *
 *   enter  a `by-contradiction` applies its assumption, and the board below it is hypothetical
 *   exit   the branch closes and the board COLLAPSES back; everything proved under the
 *          assumption is thrown away, and the one fact the claim establishes survives
 *
 * Without those two rows a reader sees a nested claim settle a cell and cannot tell that
 * dozens of other cells were settled and lost on the way.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { evaluate } from '../src/engine';
import { parseProof, printProof } from '../src/proofText';
import { parseLevels } from '../src/puzzles';
import { statementCost } from '../src/search';
import levelsData from '../src/levels.json';
import type { Block, PState, Puzzle } from '../src/types';

const argv = process.argv.slice(2);
const file = argv[0], index = Number(argv[1]), want = argv[2];
const flag = (n: string) => { const i = argv.indexOf(`--${n}`); return i === -1 ? undefined : argv[i + 1]; };
if (!file || !Number.isInteger(index) || !want) {
  console.error('Usage: emit-walk <proofFile> <index> <goal substring> [--out FILE]');
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
const one = (b: Block) =>
  printProof([{ ...b, body: [], left: [], right: [] } as any], puzzle).split('\n')[0].trim();
const cellLabel = (i: number) => `${String.fromCharCode(65 + (i % N))}${Math.floor(i / N) + 1}`;
const board = (s: PState) => s.cells.map(c => (c === 'star' ? 'S' : c === 'elim' ? 'X' : '.')).join('');
const CONTAINER = ['claim', 'by_contradiction', 'argument', 'suppose', 'constructor', 'or_elim', 'by_cases'];

/** The assumption a by-contradiction opens: the negation of the goal it is proving. */
function negate(goalText: string): string {
  let m = /\(is-elim ([A-Z]+\d+)\)/.exec(goalText);
  if (m) return `(is-star ${m[1]})`;
  m = /\(is-star ([A-Z]+\d+)\)/.exec(goalText);
  if (m) return `(is-elim ${m[1]})`;
  m = /\((=|!=|<=|>=) (\(count [^)]*\)) (\d+)\)/.exec(goalText);
  if (m) {
    const flip: Record<string, string> = { '=': '!=', '!=': '=', '<=': '>', '>=': '<' };
    return `(${flip[m[1]]} ${m[2]} ${m[3]})`;
  }
  return `not ${goalText}`;
}

type Row = {
  at: number; depth: number; kind: 'enter' | 'step' | 'exit';
  type: string; text: string; cost: number;
  board: string; settles: string[]; lost: string[];
  assume: string | null; note: string;
};

const rows: Row[] = [];
let prevBoard = '';
function push(r: Omit<Row, 'at' | 'settles' | 'lost'>) {
  const settles: string[] = [], lost: string[] = [];
  if (prevBoard) {
    for (let i = 0; i < r.board.length; i++) {
      if (prevBoard[i] === '.' && r.board[i] !== '.') settles.push(cellLabel(i));
      else if (prevBoard[i] !== '.' && r.board[i] === '.') lost.push(cellLabel(i));
    }
  }
  rows.push({ ...r, at: rows.length, settles, lost });
  prevBoard = r.board;
}

/** Pre-order, with an exit row for every container. */
function walk(b: Block, depth: number, goalText: string): void {
  const r = results.get(b.id);
  if (!r || r.status !== 'ok') return;
  const isContainer = CONTAINER.includes(b.type);
  const body: Block[] = kids(b).flat();

  if (!isContainer) {
    push({ depth, kind: 'step', type: b.type, text: one(b), cost: statementCost(b),
      board: board(r.scope ?? r.state), assume: null, note: r.note ?? '' });
    return;
  }

  // Entering: a by-contradiction applies its assumption before its first statement runs, so
  // the state to show is the one that statement sees.
  const inner = body.length ? results.get(body[0].id)?.prev : (r.scope ?? r.state);
  const opened = b.type === 'by_contradiction' ? (inner ?? r.prev) : r.prev;
  push({
    depth, kind: 'enter', type: b.type, text: one(b), cost: statementCost(b),
    board: board(opened),
    assume: b.type === 'by_contradiction' ? negate(goalText) : null,
    note: b.type === 'by_contradiction' ? 'assumed, to be refuted' : '',
  });

  const nextGoal = b.type === 'claim' ? one(b) : goalText;
  for (const child of body) walk(child, depth + 1, nextGoal);

  push({
    depth, kind: 'exit', type: b.type, text: one(b), cost: statementCost(b),
    board: board(r.state), assume: null,
    note: b.type === 'by_contradiction'
      ? 'contradiction reached — the branch is discarded'
      : (r.note ?? ''),
  });
}

/** Find the claim to walk, by goal text; take the largest when several match. */
const found: { block: Block; goal: string; total: number }[] = [];
const scan = (list: Block[]) => {
  for (const b of list) {
    if (b.type === 'claim' && one(b).includes(want)) {
      let n = 0;
      const go = (l: Block[]) => { for (const x of l) { n++; kids(x).forEach(go); } };
      go([b]);
      found.push({ block: b, goal: one(b), total: n });
    }
    kids(b).forEach(scan);
  }
};
scan(blocks);
if (found.length === 0) { console.error(`no claim whose goal contains "${want}"`); process.exit(2); }
found.sort((a, b) => b.total - a.total);
if (found.length > 1) console.log(`${found.length} claims match; taking the largest`);
const target = found[0];

prevBoard = board(results.get(target.block.id)!.prev);
const before = prevBoard;
walk(target.block, 0, target.goal);

console.log(`${target.goal}`);
console.log(`${rows.length} rows (${rows.filter(r => r.kind === 'step').length} statements, `
  + `${rows.filter(r => r.kind !== 'step').length} enter/exit)`);
const deepest = Math.max(...rows.map(r => r.depth));
console.log(`nesting depth ${deepest}, cost ${statementCost(target.block)}`);
const lostTotal = rows.reduce((n, r) => n + r.lost.length, 0);
console.log(`cells settled then discarded at a branch close: ${lostTotal}`);

const payload = {
  puzzle: `${puzzle.name} #${puzzle.categoryIndex}`,
  size: N, stars: puzzle.stars, regions: puzzle.regions,
  goal: target.goal, cost: statementCost(target.block),
  boardBefore: before, rows,
};
const out = flag('out');
if (out) { writeFileSync(out, JSON.stringify(payload, null, 1), 'utf8'); console.log(`written to ${out}`); }
