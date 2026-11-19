/**
 * Rewrite references to split parts that no longer exist, using the engine's own notes.
 *
 * A split part that says exactly what a hypothesis already says gets no second name, so a
 * proof referring to it by position has to name the hypothesis instead. The engine reports the
 * pairing ("row 9-2 is region 7-3, already known"), so the rewrite is read off that rather
 * than guessed.
 *
 * One reference per round, located by block id. A position name like `rows 11,12-2` is made by
 * several different splits in these proofs, in different bodies, and is suppressed in only some
 * of them — so a textual replace would corrupt the contexts where the part is real.
 *
 *   npx tsx scripts/_rewrite_aliases.ts <index> <proofFile>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { evaluate } from '../src/engine';
import { parseProof, printProof } from '../src/proofText';
import { parseLevels } from '../src/puzzles';
import levelsData from '../src/levels.json';
import type { Block, HypExpr, Puzzle, RawLevel } from '../src/types';

const index = Number(process.argv[2]);
const file = process.argv[3];
const puzzle: Puzzle = parseLevels(levelsData as RawLevel[])[index];

/*
 * A label is not quite an id. A split named with `as` keeps its name verbatim, spaces and all,
 * so `columns E,F-2` is the id; one taking its name from a line drops them, so `row 9-2` is
 * `row9-2`. Which applies cannot be told from the label, so both are offered and the one that
 * exists where the broken reference sits is chosen.
 */
const candidates = (label: string) => [label.trim(), label.trim().replace(/\s+/g, '')];

const kids = (b: Block): Block[][] => {
  const a = b as unknown as Record<string, Block[] | undefined>;
  return [a.body, a.left, a.right, a.positive, a.negative].filter(Boolean) as Block[][];
};
function walk(list: Block[], f: (b: Block) => void): void {
  for (const b of list) { f(b); for (const k of kids(b)) walk(k, f); }
}

/** Point every `ref` in this expression at a surviving name that exists here. */
function remap(expr: HypExpr | null, map: Map<string, string[]>, here: Set<string>): string[] {
  if (!expr) return [];
  if (expr.kind === 'ref') {
    const options = expr.factId ? map.get(expr.factId) : undefined;
    const to = options?.find(option => here.has(option));
    if (!to) return [];
    const from = expr.factId!;
    expr.factId = to;
    return [`${from} -> ${to}`];
  }
  if (expr.kind === 'add' || expr.kind === 'sub' || expr.kind === 'combine') {
    return [...remap(expr.left, map, here), ...remap(expr.right, map, here)];
  }
  return [];
}

let blocks: Block[] = parseProof(readFileSync(file, 'utf8'), puzzle);
let rounds = 0;
for (; rounds < 40; rounds++) {
  const { results } = evaluate(puzzle, blocks);

  const map = new Map<string, string[]>();
  for (const r of results.values()) {
    for (const m of (r.note ?? '').matchAll(/([^;]+?) is ([^,]+?), already known/g)) {
      for (const key of candidates(m[1])) map.set(key, candidates(m[2]));
    }
  }

  let changed: string[] = [];
  walk(blocks, b => {
    if (changed.length) return;
    const r = results.get(b.id);
    if (r?.status !== 'error' || !/not available here/.test(r.error ?? '')) return;
    const here = new Set(r.prev.facts.map(fact => fact.id));
    const target = b as unknown as { expr?: HypExpr | null; parts?: HypExpr[] };
    const hits = [
      ...remap(target.expr ?? null, map, here),
      ...(target.parts ?? []).flatMap(part => remap(part, map, here)),
    ];
    if (hits.length) changed = hits;
  });

  if (!changed.length) break;
  console.log(`round ${rounds + 1}: ${changed.join(', ')}`);
}

const { final, results } = evaluate(puzzle, blocks);
const errors = [...results.values()].filter(r => r.status === 'error');
const settled = final.cells.filter(c => c !== null).length;
console.log(`after ${rounds} rewrite(s): ${errors.length} error(s), `
  + `${settled}/${puzzle.size ** 2} cells`);
for (const e of errors.slice(0, 3)) console.log(`  still failing: ${e.error}`);
if (!errors.length) {
  writeFileSync(file, `${printProof(blocks, puzzle)}\n`, 'utf8');
  console.log(`rewritten ${file}`);
} else {
  console.log('left alone: it does not check out, so writing it back would only hide that');
}
