# Which tool next: arithmetic or an argument?

Difficulty here is defined by the prover, not by the board: a puzzle is as hard as the
dearest tool our algorithm had to reach for. That makes the ranking a function of the
algorithm, which is fine — it is the current meta — but it means the ordering of tools
*is* the metric, and getting it wrong distorts the grades as well as the proofs.

So: should arguing a case be interleaved with arithmetic, rather than held back until
arithmetic exhausts its ceiling? Measured on 300 boards from the 1500-board 5x5 pool.

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
several. Per cell settled, at the stall:

- cheapest argument: **3.00** (mean 3.36)
- best arithmetic above the stall: **2.00** (mean 2.22)

Arithmetic is the better buy at **31 of 36** stalls where both can move, and at 30 further
stalls only the argument can move at all, so it gets bought there regardless. Exhausting
arithmetic first is therefore the right rule about 86% of the time — not by accident of
implementation, but because that is where the value is.

Explicitly arbitrating on cost-per-cell should then match arithmetic-first and beat it on the
5 stalls where the argument really is better. It does not, because the lookahead needed to
price the unbought arithmetic levels costs more than those 5 stalls are worth. Kept behind
`bidCases`, off by default, because the conclusion changes as soon as a tool arrives whose
progress is not measured in cells — see below.

## What this means for the grading

The bands rest on the ladder, and the ladder is now known to be ordered correctly rather
than arbitrarily. That the two orders produce an identical mean cost also says the
"needs a case split" bands are not an artefact of when we choose to argue: those boards
need an argument under either order.

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
cells — it tightens a bound. Cost per cell settled scores it at infinity, so under the
arbitration measured above it would never be bought at all. Adding this tool therefore
requires the progress measure to count bound-tightening as progress (`gainsGround` already
does, counting new facts; the *ratio* used for arbitration does not), and the 2.00-against-3.00
comparison has to be re-measured once it does. The arbitration question is settled for the
tools we have now, and reopens the moment this one lands.
