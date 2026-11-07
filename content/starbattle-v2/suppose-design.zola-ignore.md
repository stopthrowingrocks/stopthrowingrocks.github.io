# `suppose` — stored conditional derivations

## What it is

`suppose S (P)` opens a body that is evaluated with `P` assumed. Nothing escapes it and it
proves nothing on its own. What it leaves behind is a **record**: "if `P` held, these cells
would be resolved and these hypotheses would follow."

`use S` discharges that record in the forward direction — modus ponens. It requires `P` to be
established at that point in the proof, and then brings in what `S` derived.

The contrapositive direction (modus tollens: something `S` derived is false, therefore `¬P`)
is deliberately **out of scope for now**. The record stores everything needed to add it later.

This is a generalization of the Lean `scontra` tactic that the TODO lists as "suppose": that
is the special case where the body goes contradictory and you discharge backwards. Since
only the forward direction is being built, `scontra` is **not** yet subsumed — the existing
`claim` + `by-contradiction` pairing stays the way to do it.

## Blocks

```
suppose [ S ] ( <hexagon> )        statement, C-block
  <body>

use [ S ▾ ]                        statement
```

Text format:

```
(suppose <name> <bool> <stmt>*)
(use <name>)
```

`use` takes a name, not an expression, because the contrapositive wrapper that would have
justified an expression slot is out of scope. When it arrives, the slot becomes
`(use <name>)` | `(use (contrapositive <name>))` without disturbing this grammar.

## The record

Stored on `PState` beside `facts`, so it clones, nests and scopes exactly as facts do:

```ts
interface Supposition {
  name: string;          // its id; `use` refers to it by this
  pred: BoolExpr;        // P
  cells: CellK[];        // the body's final board
  facts: Fact[];         // the body's final hypothesis pool
  contradiction: boolean;// the body reached a contradiction
}
```

The body is evaluated from a clone of the state entering the block, with `P` added by the
existing `addGoalFacts` — the same call `by_contradiction` and `by_cases` already use, so a
cell predicate marks the board and a count predicate becomes an `assumption` fact.

## What `use S` brings in — the diff

The record is a snapshot; `use` splices in the difference against what is known now.

1. **Cells.** Every cell the record has resolved that is still unknown is set, through the
   normal `setStar`/`setElim` path, so a star still eliminates its neighbours. A cell the
   record marks one way and the current board marks the other sets `contradiction`, which is
   correct: `P` is true and `P` implies that cell, so the current branch is impossible.
2. **Normalize**, which narrows the outer facts by the cells just imported. This is why
   narrowed copies of outer facts do not need importing — normalization reproduces them.
3. **Hypotheses.** Every fact in the record with no match in the current pool — matching on
   `(op, cells, target)`, not on name — is added as `S-<its name>`. Facts you already know
   are skipped, so a repeated `use` is a no-op rather than a pile of duplicates. If `S-<name>`
   somehow exists already, that fact is skipped.

The record itself stays available; `use S` can be used again in another branch.

## When `use S` is allowed

`P` must be established in the current state, tested with the existing `goalSatisfied` —
the same predicate test `claim` uses to decide whether its body proved its goal. It accepts a
cell that carries the right mark, a matching proven proposition, or facts matching the
predicate's lowered form.

## Why it is sound

A `use` is sound when everything the body relied on still holds. Inside a scope, knowledge
only grows: cells are resolved and never unresolved, and a fact that is cleared or consumed
was true when the body used it. So the state at `use` entails the state at `suppose`, and
`P` plus that state entails what the body derived.

Scoping needs no new machinery. The record lives in `PState`, so a supposition written
inside a `claim` or a case arm is invisible outside it — those bodies run on clones whose
state does not flow out. A supposition written inside an `argument` does flow out, which is
right, since `argument` is transparent grouping.

## Errors

| Block | Condition | Message |
|---|---|---|
| `suppose` | no predicate | choose something to suppose |
| `suppose` | no name | enter a name for this supposition |
| `suppose` | name already used | `<name>` is already supposed |
| `suppose` | predicate cannot be assumed | (propagated from `addGoalFacts`) |
| `suppose` | a body step errored | the supposition contains an invalid step |
| `use` | nothing chosen | choose a supposition |
| `use` | not in scope | that supposition is not available here |
| `use` | `P` not established | `<name>` is not established — prove its supposition first |
| `use` | nothing new to add | you already know everything `<name>` derived |

## Testing

Unit tests in `tests/suppose.test.ts`, against real puzzles as the split tests are:

- a supposition records its body and leaves the outer state untouched
- `use` before `P` is established is refused; after a `claim` proves `P`, it is accepted
- imported hypotheses are named `S-x`, and ones already known are skipped
- imported cells resolve the board, and a clash sets a contradiction
- a supposition written in a claim body is not visible outside it
- a repeated `use` adds nothing the second time
- text round trip, and block-id independence

Browser: the `use` dropdown lists in-scope suppositions and survives a reload; clicking into
a `suppose` body shows the board under `P`, which the existing scope machinery gives for free.

## Referring to what a body derived (for the deferred contrapositive)

There are two ways a slot can name a hypothesis that only exists inside a body, and the
contrapositive will want one of them.

`BlockResult.scope` is the existing one: a block stores its body's end state there, and the
fact dropdown walks up to the nearest evaluated ancestor and prefers `scope` over `prev`.
This is why `by-contradiction`'s `via` term can name a hypothesis derived in its own body,
and why selecting that block shows the board as of the body's end. It only works for a slot
*on the block that owns the body*, since the lookup walks the block tree.

A detached `use (contrapositive S)` has no such ancestor to walk, so it would read the
record instead: choosing `S` fills a second dropdown from `S.facts`. That is a new lookup
path, but a cheap one — the record already holds the pool.

The detached form is the one that matches the point of this design, that you discharge a
supposition once you find out which way it goes rather than committing at the time you
write it. It also makes the "name the one derived fact that is false" variant practical,
as an alternative to injecting the whole collection and testing for a contradiction.

## Notes and risks

- The "already known" test is exact-match, so a body fact strictly weaker than one you hold
  is still imported. Harmless, but it is clutter rather than a silent error.
- A contradictory body is recorded rather than refused. With only the forward direction, such
  a record is unusable in practice — `use` would require proving a `P` that is in fact false.
  It becomes the useful case the moment the contrapositive lands.
- `by_contradiction` inside a `suppose` body still needs an enclosing goal and will error
  without one, exactly as it does today at the top level of a proof.
