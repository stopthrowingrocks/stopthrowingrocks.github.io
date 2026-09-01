Here's the full inventory from the four proofs in starbattle.lean, grouped by implementation status.

Already covered by the MVP
Tactic	How it's covered
expand_row/col/shape(s)	all line facts auto-initialized
ssimp, simp [h] at h'	automatic normalization on every change
extract_stars	"place forced ★" block (incl. auto neighbor elims)
extract_elims	"cross out ✕" block
scontra	"suppose" C-block
expand_adj	automatic when any star is placed
solve_board	automatic win detection
clear, rename	bookkeeping — unnecessary (facts are auto-spent)
Not yet implemented — each maps cleanly to a block
adj_le_one h [cells] as hb — "at most one ★ among these cells" (king-move clique). Block: multi-select cells on the board, engine validates pairwise adjacency, emits a ≤ 1 fact. The Fact type already supports ≤. Needs the same board multi-pick UI as #3.

subsum ht at h — subtract a sub-count from a line fact: if A's cells ⊆ B's cells, then B−A is a fact over the difference. Block: "subtract [fact A] from [fact B]". Pure set/arithmetic check.

starcount sl [cells] = k (the have : … := by … claims) — assert a count over an arbitrary cell set, justified by a nested sub-proof. Block: a C-block "claim ★{cells} = k", with the body establishing it. Needs multi-pick plus a notion of what justifies a claim (see the note below).

by_cases h : sl p = .star — case split on a cell. Block: a two-armed C-block ("either A3 is ★ … or A3 is ✕ …"); what you may conclude afterward is the intersection of facts derived in both arms. This also covers the ≠ claims (like hn_shape7_col0), which are just "suppose this count holds → contradiction" — our suppose generalized from cells to counts.

expand_count h — turn a count fact into its n-choose-k cases. Generalization of #4: an n-armed case block, one arm per placement choice, again concluding the intersection.

congrArg₂ (· + ·) h_row8 h_row9 — add two facts together (the row8+row9 trick). Block: "combine [fact] + [fact]" — cells union, targets sum.

subsum_leq ht at h — like subsum but when only some cells overlap, yielding a ≥ bound. Needs adding '>=' to Fact['op'] — a one-line type change; normalization already generalizes.

omega_using [facts] — the general arithmetic glue. This is the only one without an obvious single-block shape, but it has a clean implementation path: every fact is a linear constraint over 0/1 cell variables, so "does this set of facts entail this conclusion / a contradiction?" is decidable by the engine (bounded search over the ≤ ~20 involved cells, or simple bound propagation). A "combine facts" block where you pick the facts and state the conclusion, and the engine verifies entailment, is faithful to how omega_using is used.

(sub_summand is defined in the file but never used in the proofs; it's subsumed by #2 anyway. Cell.ite_star_le_one feeds omega the 0/1 upper bound — implicit in #8's model. omega/decide/native_decide/funext/fin_cases are internal machinery, not player steps.)

The one structural takeaway
Everything is implementable because the whole proof language lives in linear arithmetic over 0/1 variables — the engine can always verify a step by brute force over the involved cells. The real design decisions are UX, not feasibility:

Board multi-select (needed by 1, 3, 5) — a "pick cells" mode like the existing pick-cell, plus toggling.
Multi-arm C-blocks (4, 5) — the workspace currently assumes one body per block; suppose bodies would generalize to a list of arms.
How "claim" blocks are justified (3) — nested sub-proof vs. engine-verified entailment (#8 style) vs. both.
Nothing in the current Block/Fact/engine design blocks any of these — the additions are new block variants and one new op value, not rearchitecting.
