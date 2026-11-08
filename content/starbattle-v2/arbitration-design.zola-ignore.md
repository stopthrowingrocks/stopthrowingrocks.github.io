# Which tool next: arithmetic or an argument?

Difficulty here is defined by the prover, not by the board: a puzzle is as hard as the
dearest tool our algorithm had to reach for. That makes the ranking a function of the
algorithm, which is fine — it is the current meta — but it means the ordering of tools
*is* the metric, and getting it wrong distorts the grades as well as the proofs.

So: should arguing a case be interleaved with arithmetic, rather than held back until
arithmetic exhausts its ceiling? Measured on 300 boards from the 1500-board 5x5 pool.

## Two different prices

A statement has two costs and they are not the same thing:

- **what it costs to write** — `statementCost`, the length of the finished proof;
- **what it costs to find** — the size of the class you must sift to reach it.

Only the first was ever measured here. The second is the one a solver feels: checking every
cell against every hypothesis for a one-step contradiction is 25x15 on a 5x5 however short
the claim that comes out. `WorkProbe` now counts candidates examined per tool, and the two
prices disagree about nearly everything below.

## What the prices look like

An argument is available at body ceiling 1 on **every** board that stalls under arithmetic
alone (54 of 54 sampled), and costs **3** at the median — one for the claim, one for the
contradiction, one for the body. Arithmetic at the top of the ladder costs 4 to 6.

By statement cost, then, the argument is always the bargain, and holding it back until
arithmetic has run to level 6 looks obviously wrong.

## It is not wrong

Two interleavings were built and measured against arithmetic-first, same boards, same
60-second budget:

| order | solved | mean cost | cheaper on | time |
|---|---|---|---|---|
| arithmetic first (current) | 300/300 | 20.7 | 10 | 5s |
| interleaved by statement cost | 298/300 | 20.7 | 16 | 7s |
| arbitrated by cost per cell | 242/300 | 18.3 | 6 | 8s |

Both lose. The mean cost does not move at all, and both give up boards the current order
finishes.

The reason is that statement cost is the wrong basis for comparing two *different* tools.
An argument settles exactly one cell by construction. A dear arithmetic statement can settle
several. Priced both ways, per cell settled at the stall:

| | per statement | per candidate examined |
|---|---|---|
| cheapest argument | 3.00 | **6,619** |
| best arithmetic above the stall | 2.00 | **904** |
| arithmetic is the better buy | 24/36 stalls | **34/36 stalls** |

Statement cost makes it a close thing — 1.5x, arithmetic ahead two times in three. Search
work makes it lopsided: **7.3x**, arithmetic ahead 34 times in 36. Class size is the dominant
term, and it is the term that was not being counted. That is also why both interleavings lost
on wall-clock as well as on cost: the contradiction tool is simply dear to search.

So exhausting arithmetic first is right, and far more robustly than the statement-cost
numbers suggested. Arbitrating explicitly on cost-per-cell still does not pay, because the
lookahead needed to price the unbought arithmetic levels costs more than the 2 stalls it
would win. Kept behind `bidCases`, off by default, because the conclusion changes as soon as
a tool arrives whose progress is not measured in cells — see below.

## This is the difficulty measure

Search work turns out to be what the grading should have rested on all along. Against proof
cost, over 125 boards proved four times each with the order of equals shuffled:

| | moved by the shuffle | moved by more than 10% |
|---|---|---|
| proof cost | 89% | 64% |
| search work | **9%** | **6%** |

Cost is mostly the draw; work is the board. And work orders the tool ladder monotonically,
at a near-constant multiple per rung:

| band | median work | against the rung below |
|---|---|---|
| forced only | 59 | |
| one-step arithmetic | 623 | x10.6 |
| compound arithmetic | 1,861 | x3.0 |
| deep arithmetic | 6,075 | x3.3 |
| one case split | 17,667 | x2.9 |
| several case splits | 52,544 | x3.0 |

So the ladder is a geometric scale in search work, roughly a factor of three per rung, and
difficulty is naturally logarithmic. Cost does not see this: `deep arithmetic` to
`one case split` is x2.9 in work and **+1** in cost. Boards exist where the two diverge
outright — #742 costs 15 to write and 7,807 to find.

The corpus is therefore picked by spreading evenly in *log* work rather than by quota per
band, which gives a smooth ladder from 39 to 183,191 with the bands falling out in order.
The bands stay as labels; work does the ranking, including inside a band.

## The next tool: `count(S) != k`

Proving a count *cannot* be some value, so that a bound tightens. Most of this already
exists:

- `!=` is a first-class `FactOp`, not something to add.
- `claimConclusion` already recognises a claim whose DNF is `(<= k-1) OR (>= k+1)` and
  collapses it to a single `!= k` fact, so a claim can conclude a disequality today.
- `normalize` already turns an unreachable `!=` into a no-op, an empty-cell `!=` into a
  contradiction, and a clash between `= t` and `!= t` into a contradiction.
- `applyStars` / `applyElims` already force a cell from a single-cell `!= 0` or `!= 1`.

Two things are missing.

**The payoff step.** Nothing combines `count(S) != t` with a bound on the same cells at the
same target. The cross-fact pass in `normalize` matches only `=` against `!=`. Needed:
`<= t` with `!= t` gives `<= t-1`, and `>= t` with `!= t` gives `>= t+1`. Without this a
multi-cell disequality is inert, which is presumably why it has never paid off.

**A generator.** `findCase` only ever proposes cell predicates. The space of `(S, k)` is far
too large to enumerate, but it does not need enumerating, because a disequality only *does*
anything when `k` sits at an endpoint of the interval already known for `count(S)`. Proving
`!= k` for an interior `k` tightens nothing on its own. So the candidate set is:

> for each known fact over cells `S` with known interval `[l, u]` and `l < u`:
> try `k = u` (tightening to `<= u-1`) and `k = l` (tightening to `>= l+1`).

That is at most two candidates per known fact, not `2^cells`.

This also subsumes the existing case finder rather than sitting beside it. For a single cell
`c`, `count({c})` is in `[0, 1]`; proving `!= 1` *is* `is-elim c` and proving `!= 0` *is*
`is-star c`. `findCase` is the `|S| = 1` instance, so the general version replaces it, and
the current tests pin the singleton behaviour while it is rebuilt.

**The catch, and why `bidCases` is worth keeping.** A multi-cell disequality settles no
cells — it tightens a bound. Any per-cell measure scores it at infinity, so under the
arbitration measured above it would never be bought at all. Adding this tool therefore
requires the progress measure to count bound-tightening as progress (`gainsGround` already
does, counting new facts; the *ratio* used for arbitration does not).

Its class size also wants thinking about before it is built. Restricting candidates to the
endpoints of known intervals gives two per fact, so with 15 or so hypotheses in play that is
about 30 suppositions, against the 50 a cell-based case finder opens on a 5x5 — the same
order. But each one is a nested contradiction search, so the measured 6,600 candidates per
cell settled is the right thing to expect per attempt, and the tool only pays if a tightened
bound unlocks more than a settled cell does. That is exactly the lookahead question, and it
is the reason not to guess: instrument it with `WorkProbe` and measure, as above.

The arbitration question is settled for the tools we have now, and reopens the moment this
one lands.
