// Discharging a supposition can close a branch rather than advance it.
//
// A record folded against the board can come out saying "one star among no cells". `pred`
// implies the count, the board has settled every cell it covered, and between them they are
// inconsistent — so the branch assuming `pred` is closed. `use` used to drop such a record on
// its way in, because its import loop skipped any fact left with no cells, which is exactly
// the case worth having.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/engine.ts';
import { parseProof } from '../src/proofText.ts';
import { parseLevels } from '../src/puzzles.ts';
import levels from '../src/levels.json' with { type: 'json' };
import type { Block, BlockResult, Puzzle, RawLevel } from '../src/types.ts';

const puzzles = parseLevels(levels as RawLevel[]);
/** 10x10 2★ Normal #1: region2 is D1 E1 F1 G1 D2 E2 F2, and G2's neighbours cover F1 G1 F2. */
const P: Puzzle = puzzles[250];
const G2 = 1 * P.size + 6;

function run(text: string) {
  const blocks = parseProof(text, P);
  const { results, final } = evaluate(P, blocks);
  const flat: string[] = [];
  const walk = (list: Block[]) => {
    for (const b of list) {
      const r = results.get(b.id) as BlockResult;
      flat.push(`${b.type}: ${r.status}${r.error ? ' ' + r.error : ''}`);
      for (const [, kids] of [['body', (b as { body?: Block[] }).body ?? []] as const]) walk(kids);
    }
  };
  walk(blocks);
  return { flat, final, results };
}

/*
 * S splits region2 while supposing a count over J2/J3. Later the count becomes known outright
 * — J3 is starred and its adjacency crosses J2 out — so S is established. Inside a branch that
 * assumes G2 is a star, G2's neighbours cross out F1, G1 and F2, which is every cell of S's
 * second split part. S says exactly one of them holds a star, so the branch cannot stand.
 */
const PROOF = `
(suppose S (= (count J2 J3) 1)
  (elims (- (clique I2 J2 I3 J3) "asm19_29=1"))
  (split region2 _ (clique D1 E1 D2 E2) (clique F1 G1 F2))
)
(stars (- region4 (clique I1 J1 J2)))
(claim (is-elim G2)
  (by-contradiction
    (body
      (use S)
    )
  )
)
`;

test('a record the board has ruled out closes the branch that used it', () => {
  const { flat, final } = run(PROOF);
  assert.ok(!flat.some(line => line.includes('error')), flat.join(' / '));
  assert.equal(final.cells[G2], 'elim', 'G2 is proved empty');
});

test('the record arrives as a hypothesis, impossible and nameable', () => {
  /*
   * It is imported like any other fact and `normalize` does the rest: `★{} = 1` is marked
   * impossible, which sets the contradiction and keeps the fact — so the branch closes and a
   * `via` has something to point at. Nothing in `use` needs to test satisfiability itself.
   */
  const { results } = run(PROOF);
  const used = [...results.values()].find(r => /gives/.test(r.note ?? ''));
  assert.ok(used, 'the use step ran');
  const broken = used!.state.facts.filter(fact => fact.impossible);
  assert.equal(broken.length, 1, used!.note);
  assert.equal(broken[0].id, 'S-region2-2');
  assert.equal(broken[0].cells.length, 0, 'no cells left for the count to live in');
  assert.equal(broken[0].target, 1);
  assert.equal(used!.state.contradiction, true);
});

/*
 * The same refutation is visible without taking the step.
 *
 * `normalize` folds every record in scope against the board it just changed, so inside the
 * branch assuming G2 the record covering F1 G1 F2 has no cells left to put its star in. That
 * makes S's predicate false, which the suppositions panel reads off `contradiction` -- the
 * branch can be closed by `use S`, and now you can see that before writing it.
 */
test('the board ruling a record out marks the supposition itself', () => {
  const { results } = run(PROOF.replace('(use S)', '(sorry)'));
  const inBody = [...results.values()].find(r => r.state.cells[G2] === 'star');
  assert.ok(inBody, 'a step inside the branch assuming G2');
  const S = inBody!.state.suppositions.find(sup => sup.name === 'S');
  assert.ok(S, 'S is in scope there');
  assert.equal(S!.contradiction, true, 'its record cannot hold, so what it supposes is false');
});

test('naming that hypothesis as the via closes it the same way', () => {
  const { flat, final } = run(PROOF.replace(
    '    )\n  )\n', '    )\n    (via "S-region2-2")\n  )\n'));
  assert.ok(!flat.some(line => line.includes('error')), flat.join(' / '));
  assert.equal(final.cells[G2], 'elim');
});
