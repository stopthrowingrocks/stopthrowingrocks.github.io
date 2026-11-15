/*
 * Shared derivation inside arguments, which a supposition could factor out.
 *
 * Comparing the hypotheses two arguments assume is the narrowest test of reuse there is. The
 * interesting case is two arguments that assume different things but, partway down, reach a
 * similar position and take the same steps from there -- "once we get here, this is how the
 * rest of the board fills in". That is what `(suppose S P ...)` plus two `(use S)`s collapses.
 *
 * Statements are compared by printed text, which carries no block ids, so two statements
 * match when they say the same thing about the same cells.
 */
import { readFileSync } from 'node:fs';
import { parseProof, printProof } from '../src/proofText';
import { parseLevels } from '../src/puzzles';
import levelsData from '../src/levels.json';
import type { Block, Puzzle } from '../src/types';

const puzzle: Puzzle = parseLevels(levelsData)[Number(process.argv[3] ?? 414)];
const blocks = parseProof(readFileSync(process.argv[2], 'utf8'), puzzle);

const kids = (b: Block): Block[][] => {
  const a = b as any;
  return [a.body, a.left, a.right, a.positive, a.negative].filter(Boolean);
};
/** One statement's own text, with any nested body stripped: the step, not the subtree. */
const stepText = (b: Block): string => {
  const bare = { ...b } as any;
  for (const k of ['body', 'left', 'right', 'positive', 'negative']) if (bare[k]) bare[k] = [];
  return printProof([bare], puzzle).split('\n')[0].trim();
};

/** Each statement, tagged with the chain of arguments enclosing it. */
type Entry = { text: string; owner: string; depth: number; seq: number };
const entries: Entry[] = [];
let seq = 0;
const walk = (list: Block[], owner: string, depth: number) => {
  for (const b of list) {
    entries.push({ text: stepText(b), owner, depth, seq: seq++ });
    const mine = b.type === 'claim' ? `${owner}/${stepText(b)}` : owner;
    kids(b).forEach(k => walk(k, mine, depth + (b.type === 'claim' ? 1 : 0)));
  }
};
walk(blocks, 'top', 0);

// ── 1. single statements that recur in more than one argument ───────────────────
const byText = new Map<string, Entry[]>();
for (const e of entries) byText.set(e.text, [...(byText.get(e.text) ?? []), e]);
const shared = [...byText.entries()]
  .map(([text, list]) => ({ text, list, owners: new Set(list.map(e => e.owner)) }))
  .filter(s => s.owners.size > 1)
  .sort((a, b) => b.owners.size - a.owners.size);

console.log(`${entries.length} statements, ${byText.size} distinct, `
  + `${new Set(entries.map(e => e.owner)).size} distinct argument contexts\n`);
console.log(`statements appearing in more than one argument: ${shared.length}`);
for (const s of shared.slice(0, 15)) {
  console.log(`  ${String(s.owners.size).padStart(2)} contexts, ${String(s.list.length).padStart(2)}x  ${s.text.slice(0, 68)}`);
}

// ── 2. repeated runs of consecutive statements ──────────────────────────────────
// A run is worth factoring only if it is contiguous in both places: that is the
// "and then these steps" the supposition would hold.
const runs = new Map<string, { owners: Set<string>; n: number; len: number }>();
const MIN = 2;
for (let i = 0; i < entries.length; i++) {
  for (let len = MIN; len <= 10 && i + len <= entries.length; len++) {
    const slice = entries.slice(i, i + len);
    if (new Set(slice.map(e => e.owner)).size !== 1) break;   // a run lives in one argument
    const key = slice.map(e => e.text).join(' | ');
    const got = runs.get(key) ?? { owners: new Set<string>(), n: 0, len };
    got.owners.add(slice[0].owner);
    got.n++;
    runs.set(key, got);
  }
}
const sharedRuns = [...runs.entries()]
  .filter(([, r]) => r.owners.size > 1)
  .sort((a, b) => b[1].len - a[1].len || b[1].owners.size - a[1].owners.size);

console.log(`\nruns of ${MIN}+ consecutive statements repeated across arguments: ${sharedRuns.length}`);
for (const [key, r] of sharedRuns.slice(0, 10)) {
  console.log(`\n  ${r.len} statements in ${r.owners.size} arguments:`);
  for (const step of key.split(' | ')) console.log(`      ${step.slice(0, 72)}`);
}
