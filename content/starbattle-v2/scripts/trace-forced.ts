/**
 * Trace the forced proof of a 5x5 shape string, using only the move kinds in
 * the requested skeleton: `stars`, `elims`, and one-level `(- X Y)` subsums.
 * At each state it lists every legal progressing move, so a stall says exactly
 * what the skeleton cannot reach.
 *
 *   npx tsx trace.ts 12333 13313 11111 44445 44555
 */
import { parseLevels } from '../src/puzzles';
import { runProof } from '../src/agentTool';
import type { Puzzle, RawLevel } from '../src/types';

const shapes = process.argv.slice(2);
if (shapes.length !== 5) { console.error('give 5 row strings'); process.exit(1); }

const level: RawLevel = { difficulty: 'normal', stars: 1, size: 5, shapes };
const puzzle: Puzzle = parseLevels([level])[0];

const names = [
  ...Array.from({ length: 5 }, (_, i) => `row${i + 1}`),
  ...Array.from({ length: 5 }, (_, i) => `col${'ABCDE'[i]}`),
  ...Array.from({ length: 5 }, (_, i) => `region${i + 1}`),
];

function candidates(): string[] {
  const out: string[] = [];
  for (const n of names) { out.push(`(stars ${n})`); out.push(`(elims ${n})`); }
  for (const a of names) for (const b of names) {
    if (a === b) continue;
    out.push(`(elims (- ${a} ${b}))`);
    out.push(`(stars (- ${a} ${b}))`);
  }
  return out;
}
const CANDS = candidates();

const rank = (s: string) => s.startsWith('(stars (-') ? 3 : s.startsWith('(stars') ? 0
  : s.startsWith('(elims (-') ? 2 : 1;

let proof: string[] = [];
let proven = 0;

console.log(runProof(puzzle, '').board ?? '');

for (let step = 1; step <= 20; step++) {
  const legal: Array<{ text: string; gain: number; note: string }> = [];
  for (const c of CANDS) {
    const r = runProof(puzzle, [...proof, c].join('\n'));
    if (!r.ok || r.errorCount > 0 || r.contradiction) continue;
    if (r.cellsProven <= proven) continue;
    const line = (r.annotated ?? '').trim().split('\n').filter(Boolean).pop() ?? '';
    legal.push({ text: c, gain: r.cellsProven - proven, note: line.replace(/^.*; ok: /, '') });
  }
  if (!legal.length) {
    console.log(`\nSTALLED after ${proof.length} steps — ${proven}/25 cells proven.`);
    console.log('No stars / elims / one-level subsum move makes progress.');
    console.log(runProof(puzzle, proof.join('\n')).board ?? '');
    console.log(runProof(puzzle, proof.join('\n')).facts ?? '');
    break;
  }
  legal.sort((a, b) => rank(a.text) - rank(b.text) || b.gain - a.gain);
  console.log(`\nstep ${step}: ${legal.length} legal move(s)`);
  for (const l of legal.slice(0, 8)) console.log(`    ${l.text.padEnd(34)} +${l.gain}  ${l.note}`);
  if (legal.length > 8) console.log(`    ... ${legal.length - 8} more`);
  const pick = legal[0];
  proof.push(pick.text);
  const r = runProof(puzzle, proof.join('\n'));
  proven = r.cellsProven;
  console.log(`  -> ${pick.text}`);
  if (r.solved) {
    console.log(`\nSOLVED in ${proof.length} steps:`);
    console.log(proof.map(p => '  ' + p).join('\n'));
    break;
  }
}
