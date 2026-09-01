import Mathlib

structure Config where
  stars : Nat
  size  : Nat
  hsize : size > 0

/-- `NeZero cfg.size` from `cfg.hsize`, so typeclass synthesis for `OfNat (Fin cfg.size) k`
    (needed by every `⟨c, r⟩ : Pos cfg` literal) can discharge the `NeZero` obligation by
    unifying `cfg` directly — no per-literal reduction of `Config.size hardConfig` to `10`. -/
instance {cfg : Config} : NeZero cfg.size := .of_pos cfg.hsize

structure Pos (cfg : Config) where
  col : Fin cfg.size
  row : Fin cfg.size
  deriving DecidableEq

instance {cfg : Config} : Fintype (Pos cfg) :=
  Fintype.ofEquiv (Fin cfg.size × Fin cfg.size)
    ⟨fun ⟨c, r⟩ => ⟨c, r⟩, fun p => ⟨p.col, p.row⟩, fun _ => rfl, fun _ => rfl⟩

inductive Cell | star | elim
  deriving BEq, DecidableEq, Repr

instance : LawfulBEq Cell where
  eq_of_beq {a b} h := by cases a <;> cases b <;> revert h <;> decide
  rfl {a} := by cases a <;> rfl

abbrev Puzzle   (cfg : Config) := Pos cfg → Fin cfg.size
abbrev Solution (cfg : Config) := Pos cfg → Cell

def neighbors {cfg : Config} (p : Pos cfg) : List (Pos cfg) :=
  let offsets : List (Int × Int) := [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]
  offsets.filterMap fun (dc, dr) =>
    let c := (p.col.val : Int) + dc
    let r := (p.row.val : Int) + dr
    if h : 0 ≤ c ∧ c < cfg.size ∧ 0 ≤ r ∧ r < cfg.size
    then some ⟨⟨c.toNat, by omega⟩, ⟨r.toNat, by omega⟩⟩
    else none

structure PuzzleConstraints {cfg : Config} (puz : Puzzle cfg) (sl : Solution cfg) : Prop where
  rowCount   : ∀ i : Fin cfg.size,
      ∑ j : Fin cfg.size, (if sl (Pos.mk j i) = .star then 1 else 0) = cfg.stars
  colCount   : ∀ i : Fin cfg.size,
      ∑ j : Fin cfg.size, (if sl (Pos.mk i j) = .star then 1 else 0) = cfg.stars
  shapeCount : ∀ s : Fin cfg.size,
      ∑ p : Pos cfg, (if puz p = s ∧ sl p = .star then 1 else 0) = cfg.stars
  adj        : ∀ {p : Pos cfg} (_ : sl p = .star), ∀ n ∈ neighbors p, sl n = .elim


-----------------------
--- LEMMAS
-----------------------

@[simp] lemma Cell.ne_elim_iff {c : Cell} : c ≠ .elim ↔ c = .star := by cases c <;> simp
@[simp] lemma Cell.ne_star_iff {c : Cell} : c ≠ .star ↔ c = .elim := by cases c <;> simp

/- Auto-generate `Fin.sum_univ_<n>` for `n = 1 … 20`: the clean `n`-fold expansion
   `∑ i, f i = f 0 + f 1 + … + f (n-1)` with *literal* `(k : Fin n)` indices.

   Mathlib only ships `Fin.sum_univ_*` (word-named) up to eight, and `Fin.sum_univ_succ`
   leaves messy `n-1+1` sizes. These clean literal indices are what let `omega` match
   `Pos.mk i j` cells across row / column / shape hypotheses. The proof works for any
   `n`: peel the last summand with `Fin.sum_univ_castSucc` down to the empty sum, then
   `rfl` collapses the `castSucc`/`last` chains to the stated literals. To cover a larger
   board, widen the range bound below — it is the only change required. -/
open Lean Elab Command in
run_cmd do
  for n in [1:21] do
    let name := mkIdent (Name.str `Fin s!"sum_univ_{n}")
    let mut rhs ← `(f 0)
    for i in [1:n] do
      rhs ← `($rhs + f $(Lean.quote i))
    elabCommand (← `(command|
      theorem $name {M : Type*} [AddCommMonoid M] (f : Fin $(Lean.quote n) → M) :
          ∑ i, f i = $rhs := by
        simp only [Fin.sum_univ_castSucc, Fin.sum_univ_zero, zero_add]; rfl))

/-- Expand a sum over all positions of a board into a double sum over the two
    coordinates, so `Fin.sum_univ_*` can then enumerate it. The region predicate in
    `shapeCount` prunes the irrelevant cells once the puzzle is concrete. -/
lemma Pos.sum_univ {cfg : Config} {M : Type*} [AddCommMonoid M] (f : Pos cfg → M) :
    ∑ p, f p = ∑ c : Fin cfg.size, ∑ r : Fin cfg.size, f ⟨c, r⟩ :=
  calc ∑ p, f p
      = ∑ x : Fin cfg.size × Fin cfg.size, f ⟨x.1, x.2⟩ :=
        Fintype.sum_equiv
          ⟨fun p => (p.col, p.row), fun x => ⟨x.1, x.2⟩, fun _ => rfl, fun _ => rfl⟩
          f (fun x => f ⟨x.1, x.2⟩) (fun _ => rfl)
    _ = ∑ c : Fin cfg.size, ∑ r : Fin cfg.size, f ⟨c, r⟩ := Fintype.sum_prod_type _

/-- Restrict a `shapeCount` sum (over the whole board) to a sum over just the region's
    cells. `region` is the explicit cell-list of shape `s`; both side goals
    (`region` is duplicate-free, and it is exactly the shape-`s` cells) are closed by
    `decide`/`native_decide`. This avoids ever expanding all `size²` board cells. -/
lemma shapeCount_region {cfg : Config} {puz : Puzzle cfg} {sl : Solution cfg}
    {s : Fin cfg.size} (region : List (Pos cfg)) (hnd : region.Nodup)
    (hmem : ∀ p, puz p = s ↔ p ∈ region) :
    (∑ p : Pos cfg, if puz p = s ∧ sl p = .star then 1 else 0)
      = (region.map (fun p => if sl p = .star then 1 else 0)).sum := by
  have key : (Finset.univ.filter fun p => puz p = s) = region.toFinset := by
    ext p; simp [hmem p]
  calc (∑ p : Pos cfg, if puz p = s ∧ sl p = .star then 1 else 0)
      = ∑ p, if puz p = s then (if sl p = .star then 1 else 0) else 0 :=
        Finset.sum_congr rfl fun p _ => by by_cases hp : puz p = s <;> simp [hp]
    _ = ∑ p ∈ Finset.univ.filter fun p => puz p = s, if sl p = .star then 1 else 0 := by
        rw [← Finset.sum_filter]
    _ = ∑ p ∈ region.toFinset, if sl p = .star then 1 else 0 := by rw [key]
    _ = (region.map (fun p => if sl p = .star then 1 else 0)).sum :=
        List.sum_toFinset _ hnd

/-- If a cell's `if … = .star then 1 else 0` tally is `0`, the cell is `.elim`.
    This discharges the per-cell goal left after expanding a line sum with
    `Fin.sum_univ_*` and isolating one summand with `omega`. -/
lemma Cell.eq_elim_of_ite_zero {c : Cell} (h : (if c = .star then 1 else 0) = 0) : c = .elim := by
  cases c <;> simp_all

/-- Dual of `eq_elim_of_ite_zero`: if a cell's tally is `1`, the cell is `.star`. -/
lemma Cell.eq_star_of_ite_one {c : Cell} (h : (if c = .star then 1 else 0) = 1) : c = .star := by
  cases c <;> simp_all

/-- An `if … = .star then 1 else 0` tally never exceeds one. This is the upper bound
    `omega` lacks (it abstracts each `if` as an opaque `≥ 0`): feed one per summand and
    `omega` can conclude every term is `1` when a line's star count is saturated. -/
lemma Cell.ite_star_le_one (c : Cell) : (if c = .star then 1 else 0) ≤ 1 := by
  cases c <;> simp

/-- A two-cell tally of `2`: both cells are stars (the saturated two-cell case). -/
lemma Cell.ite_pair_eq_two {a b : Cell}
    (h : (if a = .star then 1 else 0) + (if b = .star then 1 else 0) = 2) :
    a = .star ∧ b = .star := by
  cases a <;> cases b <;> simp_all

/-- If the cells of `region` are pairwise adjacent — each later cell is a neighbour of every
    earlier one, i.e. a king-move clique such as a 2×2 block — then at most one of them can
    be a star, so their star tally is `≤ 1` (two stars would be adjacent, contradicting
    `adj`). The pairwise-adjacency side goal is decidable, so it is discharged by `decide`.

    Call pattern: `sum_le_one_of_pairwise_adj h [c₁, …, cₙ] (by decide)`, then expand the
    `List.map`/`List.sum` with `simp` (or use the `adj_le_one` tactic). -/
lemma sum_le_one_of_pairwise_adj {cfg : Config} {puz : Puzzle cfg} {sl : Solution cfg}
    (H : PuzzleConstraints puz sl) (region : List (Pos cfg))
    (hpw : region.Pairwise (fun p q => q ∈ neighbors p)) :
    (region.map (fun p => if sl p = .star then 1 else 0)).sum ≤ 1 := by
  induction region with
  | nil => simp
  | cons p rest ih =>
    rw [List.pairwise_cons] at hpw
    obtain ⟨hp_nbr, hrest⟩ := hpw
    simp only [List.map_cons, List.sum_cons]
    by_cases hp : sl p = .star
    · -- `p` is a star, so every other cell is `elim` and contributes `0`
      rw [if_pos hp]
      have hz : (rest.map (fun q => if sl q = .star then 1 else 0)).sum = 0 :=
        List.sum_eq_zero fun x hx => by
          obtain ⟨q, hq, rfl⟩ := List.mem_map.mp hx
          simp [H.adj hp q (hp_nbr q hq)]
      omega
    · rw [if_neg hp]
      have := ih hrest
      omega

-----------------------
--- TACTICS
-----------------------

open Lean Meta Elab Tactic in
/-- Drop one summand `t` from a `+`-tree `e`, returning the tree without it. -/
private partial def removeSummand (t e : Expr) : MetaM (Option Expr) := do
  match e.getAppFnArgs with
  | (``HAdd.hAdd, #[_, _, _, _, a, b]) =>
    if ← isDefEq a t then return some b
    else if ← isDefEq b t then return some a
    else if let some a' ← removeSummand t a then return some (← mkAppM ``HAdd.hAdd #[a', b])
    else if let some b' ← removeSummand t b then return some (← mkAppM ``HAdd.hAdd #[a, b'])
    else return none
  | _ => return none

open Lean Meta Elab Tactic in
/-- `sub_summand h using e` rewrites `h : S = n` by dropping a summand of the `+`-sum `S`:

    * if `e : ℕ` is the summand `t` itself, `h` becomes `S' = n - t`;
    * if `e : t = k` is a *proof* that the summand equals `k`, `h` becomes `S' = n - k`
      (the value `k` is subtracted instead of the symbolic term).

    `S'` is `S` with that summand removed; the result is discharged by `omega` (which also
    uses the supplied equation when `e` is a proof). For a summand whose value is known,
    passing the `= k` proof gives the cleaner `n - k`. -/
elab "sub_summand " hId:ident " using " eStx:term : tactic => do
  let (lhsStx, rhsStx) ← (← getMainGoal).withContext do
    let e ← elabTerm eStx none
    -- `e : t = k` ⇒ remove `t`, subtract `k`; otherwise `e` is the summand, subtract `e`.
    let (t, k) :=
      match (← instantiateMVars (← inferType e)).eq? with
      | some (_, t, k) => (t, k)
      | none => (e, e)
    let hLocal ← getLocalDeclFromUserName hId.getId
    let some (_, lhs, rhs) := (← instantiateMVars hLocal.type).eq?
      | throwError "hypothesis {hId} is not an equality"
    let some lhs' ← removeSummand t lhs
      | throwError "summand not found in the left-hand sum"
    return (← PrettyPrinter.delab lhs', ← PrettyPrinter.delab (← mkAppM ``HSub.hSub #[rhs, k]))
  evalTactic (← `(tactic| replace $hId : $lhsStx = $rhsStx := by omega))

open Lean Meta Elab Tactic in
/-- Flatten a `+`-tree into the list of its leaf summands. -/
private partial def collectSummands (e : Expr) : Array Expr :=
  match e.getAppFnArgs with
  | (``HAdd.hAdd, #[_, _, _, _, a, b]) => collectSummands a ++ collectSummands b
  | _ => #[e]

open Lean Meta in
/-- The `Nat` value of `e` if it is a literal (in either `OfNat` or raw form), else `none`. -/
private def natLitOf (e : Expr) : MetaM (Option Nat) := do
  match ← whnf e with
  | .lit (.natVal n) => return some n
  | e' => return e'.nat?

open Lean Meta Elab Tactic in
/-- Given proof `e : t₁ + … + tₙ = k` and an equality `lhs = rhs`, return delaborated syntax
    for `lhs` with each *cell* summand `tᵢ` removed, paired with `rhs`. Literal summands of the
    sub-sum (e.g. a `+1` a folded-in star left behind) are not searched for in `lhs`; instead
    they shrink the total, so the emitted left side is `lhs' + (k - Σ literals)`. -/
private def subsumPieces (eStx : Term) (lhs rhs : Expr) : TacticM (Term × Term) := do
  (← getMainGoal).withContext do
    let e ← elabTerm eStx none
    let some (_, t, k) := (← instantiateMVars (← inferType e)).eq?
      | throwError "the argument must prove `t₁ + … + tₙ = k`"
    let mut cur := lhs
    let mut constSum := 0
    for ti in collectSummands t do
      match ← natLitOf ti with
      | some n => constSum := constSum + n        -- literal: folds into the total, not removed
      | none =>
        let some cur' ← removeSummand ti cur
          | throwError "summand {← ppExpr ti} not found in the sum"
        cur := cur'
    let curStx ← PrettyPrinter.delab cur
    let kEffStx ← if constSum == 0 then PrettyPrinter.delab k
      else match ← natLitOf k with
        | some kn => `($(Lean.quote (kn - constSum)))
        | none => throwError
            "the total `{← ppExpr k}` must be a literal when the sub-sum has constant terms"
    return (← `($curStx + $kEffStx), ← PrettyPrinter.delab rhs)

/-- `subsum ht`, where `ht : t₁ + … + tₙ = k`, drops each `tᵢ` from a `+`-sum and
    subtracts `k` from the total:

    * `subsum ht at h` turns `h : S = n` into `h : S' = n - k`;
    * `subsum ht` turns a goal `S = n` into `S' = n - k`.

    `S'` is `S` with each `tᵢ` removed; the bridge is discharged by `omega` (which uses
    `ht`, so pass a hypothesis name). -/
syntax "subsum " term (" at " ident)? : tactic

open Lean Meta Elab Tactic in
elab_rules : tactic
  | `(tactic| subsum $e:term at $hId:ident) => do
    let hType ← (← getMainGoal).withContext do
      instantiateMVars (← getLocalDeclFromUserName hId.getId).type
    let some (_, lhs, rhs) := hType.eq? | throwError "hypothesis {hId} is not an equality"
    let (lhsStx, rhsStx) ← subsumPieces e lhs rhs
    evalTactic (← `(tactic| replace $hId : $lhsStx = $rhsStx := by omega))
  | `(tactic| subsum $e:term) => do
    let some (_, lhs, rhs) := (← getMainTarget).eq? | throwError "goal is not an equality"
    let (lhsStx, rhsStx) ← subsumPieces e lhs rhs
    evalTactic (← `(tactic| suffices hsubsum : $lhsStx = $rhsStx by omega))

open Lean Meta Elab Tactic in
/-- Like `subsumPieces`, but silently skips any `tᵢ` not present in `lhs` (so removed
    terms are a *subset* of the `tᵢ`), returning `(cur + k, rhs)`. -/
private def subsumLeqPieces (eStx : Term) (lhs rhs : Expr) : TacticM (Term × Term) := do
  (← getMainGoal).withContext do
    let e ← elabTerm eStx none
    let some (_, t, k) := (← instantiateMVars (← inferType e)).eq?
      | throwError "the argument must prove `t₁ + … + tₙ = k`"
    let mut cur := lhs
    for ti in collectSummands t do
      if let some cur' ← removeSummand ti cur then
        cur := cur'
    return (← PrettyPrinter.delab (← mkAppM ``HAdd.hAdd #[cur, k]), ← PrettyPrinter.delab rhs)

/-- `subsum_leq ht at h`, where `ht : t₁ + … + tₙ = k`, removes from `h : S = n` each `tᵢ`
    that *occurs* in `S` (silently skipping any `tᵢ` absent from `S`) and replaces `h` with
    the inequality `S' + k ≥ n`. Unlike `subsum` (which needs every `tᵢ` present and yields
    an equality), this stays sound when only some of the `tᵢ` are in the line. `omega`. -/
syntax "subsum_leq " term " at " ident : tactic

open Lean Meta Elab Tactic in
elab_rules : tactic
  | `(tactic| subsum_leq $e:term at $hId:ident) => do
    let hType ← (← getMainGoal).withContext do
      instantiateMVars (← getLocalDeclFromUserName hId.getId).type
    let some (_, lhs, rhs) := hType.eq? | throwError "hypothesis {hId} is not an equality"
    let (lhsStx, rhsStx) ← subsumLeqPieces e lhs rhs
    evalTactic (← `(tactic| replace $hId : $lhsStx ≥ $rhsStx := by omega))

open Lean Meta in
/-- Extract the condition `p` from a summand `if p then 1 else 0` (unfolding reducibly). -/
private def iteCond? (e : Expr) : MetaM (Option Expr) := do
  match (← whnfR e).getAppFnArgs with
  | (``ite, #[_, p, _, _, _]) => return some p
  | _ => return none

/-- All length-`n` boolean masks with exactly `k` `true`s (the `n choose k` subsets). -/
private partial def chooseMasks : Nat → Nat → List (List Bool)
  | 0,    0    => [[]]
  | 0,    _+1  => []
  | n+1,  0    => (chooseMasks n 0).map (false :: ·)
  | n+1,  k+1  => (chooseMasks n k).map (true :: ·) ++ (chooseMasks n (k+1)).map (false :: ·)

open Lean Meta in
/-- Right-associated fold of binary `op` over `xs`, returning `unit` when empty. -/
private def foldBin (op : Name) (unit : Expr) : List Expr → MetaM Expr
  | []      => pure unit
  | [x]     => pure x
  | x :: xs => do mkAppM op #[x, ← foldBin op unit xs]

/-- A `0/1` indicator is at most one — the upper bound `omega` needs. -/
lemma ite_one_le {p : Prop} [Decidable p] : (if p then (1:ℕ) else 0) ≤ 1 := by split <;> simp
/-- `if p then 1 else 0 = 1 ↔ p` — converts an arithmetic disjunct back to the proposition. -/
lemma ite_one_eq_one_iff {p : Prop} [Decidable p] : (if p then (1:ℕ) else 0) = 1 ↔ p := by
  split <;> simp_all
/-- `if p then 1 else 0 = 0 ↔ ¬p`. -/
lemma ite_one_eq_zero_iff {p : Prop} [Decidable p] : (if p then (1:ℕ) else 0) = 0 ↔ ¬p := by
  split <;> simp_all

open Lean Meta Elab Tactic in
/-- `expand_count h`, where `h : (if p₁ then 1 else 0) + … + (if pₙ then 1 else 0) = k`,
    replaces `h` with the `n choose k` disjunction: one disjunct per way of choosing which
    `k` of the `pᵢ` hold (the rest negated). Generalizes the `Cell.ite_pair_eq_*` lemmas.

    The disjunction is proved in arithmetic form (`termᵢ = 1`/`= 0`) by a single `omega`
    (fed a `≤ 1` bound per summand), then converted to `pᵢ`/`¬pᵢ` form. So it scales to
    large `n` for *extreme* `k` (`0, 1, n-1, n`, where the disjunction stays small); the
    middle `k` are still combinatorially large in the output regardless. -/
elab "expand_count " hId:ident : tactic => do
  let (DpropStx, DarithStx, termStxs) ← (← getMainGoal).withContext do
    let some (_, lhs, rhs) := (← instantiateMVars (← getLocalDeclFromUserName hId.getId).type).eq?
      | throwError "hypothesis {hId} is not an equality"
    let some k := (← whnf rhs).nat?
      | throwError "the right-hand side must be a numeral"
    let terms := (collectSummands lhs).toList
    let conds ← terms.mapM fun s => do
      let some p ← iteCond? s | throwError "a summand is not an `if _ then 1 else 0`"
      pure p
    let masks := chooseMasks conds.length k
    let Dprop ← foldBin ``Or (mkConst ``False) (← masks.mapM fun m => do
      foldBin ``And (mkConst ``True) (← (conds.zip m).mapM fun (p, b) =>
        if b then pure p else mkAppM ``Not #[p]))
    let Darith ← foldBin ``Or (mkConst ``False) (← masks.mapM fun m => do
      foldBin ``And (mkConst ``True) (← (terms.zip m).mapM fun (t, b) =>
        mkAppM ``Eq #[t, mkNatLit (if b then 1 else 0)]))
    return (← PrettyPrinter.delab Dprop, ← PrettyPrinter.delab Darith,
            ← terms.mapM fun t => do pure (← PrettyPrinter.delab t))
  for tStx in termStxs do
    evalTactic (← `(tactic| have : $tStx ≤ 1 := ite_one_le))
  evalTactic (← `(tactic| have hexpand : $DarithStx := by omega))
  evalTactic (← `(tactic|
    replace $hId : $DpropStx := by
      simpa only [ite_one_eq_one_iff, ite_one_eq_zero_iff] using hexpand))
  evalTactic (← `(tactic| clear hexpand))

open Lean Elab Tactic in
/-- `expand_shape h n` introduces `h_shapeₙ := h.shapeCount n`, already expanded and
    pruned via `simp only [Pos.sum_univ, Fin.sum_univ_succ]` + `simp (decide := true)`.
    The new hypothesis is named `h_shape<n>` after the shape index. -/
elab "expand_shape " hStx:term:max nTok:num : tactic => do
  let name := mkIdent (Name.mkSimple s!"h_shape{nTok.getNat}")
  evalTactic (← `(tactic| have $name := ($hStx).shapeCount $nTok))
  evalTactic (← `(tactic| simp only [Pos.sum_univ, Fin.sum_univ_succ] at $name:ident))
  evalTactic (← `(tactic| simp (config := { decide := true }) at $name:ident))

open Lean Meta Elab Tactic in
/-- `expand_shapes h` runs the `expand_shape` expansion for *every* shape index of the
    board — `0 … size-1`, with `size` inferred from `h`'s config — introducing
    `h_shape0 … h_shape<size-1>` all at once. -/
elab "expand_shapes " hStx:term:max : tactic => withMainContext do
  let some cfg := (← instantiateMVars (← inferType (← elabTerm hStx none))).getAppArgs[0]?
    | throwError "`{hStx}` is not a `PuzzleConstraints`"
  let size ← match ← whnf (← mkAppM ``Config.size #[cfg]) with
    | .lit (.natVal n) => pure n
    | e => throwError "could not determine the board size (got {e})"
  for n in [0:size] do
    let name := mkIdent (Name.mkSimple s!"h_shape{n}")
    evalTactic (← `(tactic| have $name := ($hStx).shapeCount $(Lean.quote n)))
    evalTactic (← `(tactic| simp only [Pos.sum_univ, Fin.sum_univ_succ] at $name:ident))
    evalTactic (← `(tactic| simp (config := { decide := true }) at $name:ident))

open Lean Meta Elab Tactic in
/-- The board size of the `PuzzleConstraints` term `hStx`, as a `Nat`. -/
private def boardSize (hStx : Term) : TacticM Nat := withMainContext do
  let some cfg := (← instantiateMVars (← inferType (← elabTerm hStx none))).getAppArgs[0]?
    | throwError "`{hStx}` is not a `PuzzleConstraints`"
  match ← whnf (← mkAppM ``Config.size #[cfg]) with
  | .lit (.natVal n) => return n
  | e => throwError "could not determine the board size (got {e})"

open Lean Meta Elab Tactic in
/-- The clean `Fin.sum_univ_<size>` expander (auto-generated above) for the given board
    `size` — literal indices, so `omega` can match cells across hypotheses. Errors if the
    generator's range doesn't reach `size`. -/
private def finSumUnivIdent (size : Nat) : TacticM Ident := do
  let nm := Name.str `Fin s!"sum_univ_{size}"
  unless (← getEnv).contains nm do
    throwError "no clean `Fin.sum_univ_{size}` was generated; widen the generator range \
                (search `run_cmd` near the top of the file)"
  return mkIdent nm

open Lean Meta Elab Tactic in
/-- `expand_row h i` introduces `h_rowᵢ := h.rowCount i`, expanded via the size-appropriate
    `Fin.sum_univ_*` (clean literal indices). Follow with your own `simp [known] at h_rowᵢ`. -/
elab "expand_row " hStx:term:max iTok:num : tactic => do
  let lem ← finSumUnivIdent (← boardSize hStx)
  let name := mkIdent (Name.mkSimple s!"h_row{iTok.getNat}")
  evalTactic (← `(tactic| have $name := ($hStx).rowCount $iTok))
  evalTactic (← `(tactic| simp only [$lem:ident] at $name:ident))

open Lean Meta Elab Tactic in
/-- `expand_col h i` introduces `h_colᵢ := h.colCount i`, expanded via the size-appropriate
    `Fin.sum_univ_*` (clean literal indices). Follow with your own `simp [known] at h_colᵢ`. -/
elab "expand_col " hStx:term:max iTok:num : tactic => do
  let lem ← finSumUnivIdent (← boardSize hStx)
  let name := mkIdent (Name.mkSimple s!"h_col{iTok.getNat}")
  evalTactic (← `(tactic| have $name := ($hStx).colCount $iTok))
  evalTactic (← `(tactic| simp only [$lem:ident] at $name:ident))

open Lean Meta Elab Tactic in
/-- `expand_rows h` runs `expand_row` for *every* row `0 … size-1` (size inferred from `h`),
    introducing `h_row0 … h_row<size-1>` all at once. -/
elab "expand_rows " hStx:term:max : tactic => do
  let size ← boardSize hStx
  let lem ← finSumUnivIdent size
  for i in [0:size] do
    let name := mkIdent (Name.mkSimple s!"h_row{i}")
    evalTactic (← `(tactic| have $name := ($hStx).rowCount $(Lean.quote i)))
    evalTactic (← `(tactic| simp only [$lem:ident] at $name:ident))

open Lean Meta Elab Tactic in
/-- `expand_cols h` runs `expand_col` for *every* column `0 … size-1` (size inferred from
    `h`), introducing `h_col0 … h_col<size-1>` all at once. -/
elab "expand_cols " hStx:term:max : tactic => do
  let size ← boardSize hStx
  let lem ← finSumUnivIdent size
  for i in [0:size] do
    let name := mkIdent (Name.mkSimple s!"h_col{i}")
    evalTactic (← `(tactic| have $name := ($hStx).colCount $(Lean.quote i)))
    evalTactic (← `(tactic| simp only [$lem:ident] at $name:ident))

open Lean Meta Elab Tactic in
/-- `scontra h` is `by_contra` specialised to a `Cell` goal `sl p = .elim` (or `= .star`):
    it introduces `h` as the *positive* opposite fact `sl p = .star` (resp. `= .elim`),
    via `Cell.ne_elim_iff`/`Cell.ne_star_iff`, leaving `False` to prove. Replaces the
    `by_contra h_ne; have h := Cell.ne_elim_iff.mp h_ne` boilerplate. The name is optional:
    bare `scontra` uses `this` (still visible to `ssimp`/`assumption`). -/
elab "scontra" name:(ppSpace colGt ident)? : tactic => withMainContext do
  let nm : Ident := name.getD (mkIdent `this)
  let some (α, _, rhs) := (← instantiateMVars (← getMainTarget)).eq?
    | throwError "`scontra` expects a goal `sl p = .elim/.star`"
  unless α.isConstOf ``Cell do throwError "`scontra` goal must be a `Cell` equality"
  let lemId ←
    if rhs.isConstOf ``Cell.elim then pure (mkIdent ``Cell.ne_elim_iff)
    else if rhs.isConstOf ``Cell.star then pure (mkIdent ``Cell.ne_star_iff)
    else throwError "`scontra` goal must end in `.elim` or `.star`"
  evalTactic (← `(tactic| by_contra $nm:ident))
  evalTactic (← `(tactic| replace $nm := Iff.mp $lemId $nm))

open Lean Meta in
/-- The `Nat` value of a fully-reduced `Fin` literal `⟨n, _⟩`. -/
private def finLitNat (e : Expr) : MetaM Nat := do
  match (← whnf e).getAppFnArgs with
  | (``Fin.mk, #[_, v, _]) =>
    match ← whnf v with
    | .lit (.natVal n) => return n
    | v' => match v'.nat? with
      | some n => return n
      | none => throwError "expected a `Fin` literal, got `{v'}`"
  | _ => throwError "expected a `Fin.mk`, got `{e}`"

open Lean Meta in
/-- The `(col, row)` literals of a concrete `Pos.mk` expression. -/
private def posCoords (p : Expr) : MetaM (Nat × Nat) := do
  match (← whnf p).getAppFnArgs with
  | (``Pos.mk, #[_, colFin, rowFin]) => return (← finLitNat colFin, ← finLitNat rowFin)
  | _ => throwError "expected a `Pos.mk`, got `{p}`"

open Lean Meta in
/-- Every `sl P` that is the LHS of a `Cell` equality anywhere in `e` — whether an
    `if sl P = .star …` condition or a bare `sl P = .star/.elim`. Full-expression traversal. -/
private partial def collectStarCells (e : Expr) : MetaM (Array Expr) := do
  let mut acc : Array Expr := #[]
  if let some (α, lhs, _) := e.eq? then
    if α.isConstOf ``Cell && lhs.isApp then acc := acc.push lhs
  for a in e.getAppArgs do
    acc := acc ++ (← collectStarCells a)
  return acc

/-- The in-board king-move neighbours of `(c, r)` on a `size × size` board (matches `neighbors`). -/
private def kingNeighbors (c r size : Nat) : Array (Nat × Nat) := Id.run do
  let cs := (if c ≥ 1 then #[c - 1] else #[]) ++ #[c] ++ (if c + 1 < size then #[c + 1] else #[])
  let rs := (if r ≥ 1 then #[r - 1] else #[]) ++ #[r] ++ (if r + 1 < size then #[r + 1] else #[])
  let mut ns : Array (Nat × Nat) := #[]
  for nc in cs do
    for nr in rs do
      unless nc == c && nr == r do ns := ns.push (nc, nr)
  return ns

open Lean Meta Elab Tactic in
/-- Build `simp` arguments for the board facts in scope. Scans the context once into a
    `cell → fact` and `star cell → hyp` index, then:

    * with `targets?` given (`ssimp`), emits a fact only for each *target* cell — a direct
      `sl _ = …` hypothesis, or, if the cell borders a star, the **specific** `sl ⟨c,r⟩ = .elim`
      from that star's `.adj` (never the quantified lemma);
    * with `targets? = none` (`solve_board`), emits every direct fact plus every star's
      materialised neighbour eliminations (deduped).

    `skip?` omits one hypothesis (the `ssimp` target). -/
private def boardSimpArgs (skip? : Option Name) (targets? : Option (Array (Nat × Nat))) :
    TacticM (Array Term) := withMainContext do
  let mut direct  : Array ((Nat × Nat) × Ident) := #[]   -- cell → a direct fact
  let mut stars   : Array ((Nat × Nat) × Ident) := #[]   -- star cell → its hyp
  let mut consId? : Option Ident := none
  let mut cfg?    : Option Expr := none
  for decl in ← getLCtx do
    if decl.isImplementationDetail || decl.userName.hasMacroScopes then continue
    if skip?.any (· == decl.userName) then continue
    let ty ← instantiateMVars decl.type
    if ty.getAppFn.isConstOf ``PuzzleConstraints then
      consId? := some (mkIdent decl.userName)
      cfg? := ty.getAppArgs[0]?
    -- `sl P = .star/.elim` (positive), or its negation `≠` / `¬ (… = …)`
    let cell? : Option (Expr × Expr × Bool) :=      -- (slP, rhs, isPositive)
      if let some (α, lhs, rhs) := ty.eq? then
        if α.isConstOf ``Cell then some (lhs, rhs, true) else none
      else if let some (α, lhs, rhs) := ty.ne? then
        if α.isConstOf ``Cell then some (lhs, rhs, false) else none
      else match ty.getAppFnArgs with
        | (``Not, #[e]) => match e.eq? with
          | some (α, lhs, rhs) => if α.isConstOf ``Cell then some (lhs, rhs, false) else none
          | none => none
        | _ => none
    if let some (slP, rhs, isPos) := cell? then
      if slP.isApp && (rhs.isConstOf ``Cell.star || rhs.isConstOf ``Cell.elim) then
        let cr ← posCoords slP.appArg!
        let id := mkIdent decl.userName
        direct := direct.push (cr, id)
        if isPos && rhs.isConstOf ``Cell.star then stars := stars.push (cr, id)
  let size? ← match cfg? with
    | some cfg =>
      match ← whnf (← mkAppM ``Config.size #[cfg]) with
      | .lit (.natVal n) => pure (some n)
      | _ => pure none
    | none => pure none
  let mkAdj (consId starId : Ident) (c r : Nat) : TacticM Term :=
    `(($consId).adj $starId ⟨$(Lean.quote c), $(Lean.quote r)⟩ (by decide))
  let mut lemmas : Array Term := #[]
  match targets? with
  | some targets =>
    let mut seen : Array (Nat × Nat) := #[]
    for cr in targets do
      if seen.contains cr then continue
      seen := seen.push cr
      if let some id := (direct.find? (·.1 == cr)).map (·.2) then
        lemmas := lemmas.push id
      else
        match consId?, size? with
        | some consId, some size =>
          for nb in kingNeighbors cr.1 cr.2 size do
            if let some starId := (stars.find? (·.1 == nb)).map (·.2) then
              lemmas := lemmas.push (← mkAdj consId starId cr.1 cr.2)
              break
        | _, _ => pure ()
  | none =>
    let mut seen : Array (Nat × Nat) := #[]
    for (cr, id) in direct do
      lemmas := lemmas.push id
      seen := seen.push cr
    match consId?, size? with
    | some consId, some size =>
      for (scr, starId) in stars do
        for nb in kingNeighbors scr.1 scr.2 size do
          unless seen.contains nb do
            seen := seen.push nb
            lemmas := lemmas.push (← mkAdj consId starId nb.1 nb.2)
    | _, _ => pure ()
  return lemmas

open Lean Meta Elab Tactic in
/-- Fold literal summands of a `cells + c = n` target into the total, giving `cells = n - c`.
    A no-op unless the target (hyp `tgt?`, or the goal) is a `Nat` equality with both a cell
    part and a nonzero literal part. Keeps `ssimp`'s output as a clean `sum = count`. -/
private def foldConstants (tgt? : Option Ident) : TacticM Unit := do
  if (← getGoals).isEmpty then return
  withMainContext do
    let ty ← match tgt? with
      | some h => instantiateMVars (← getLocalDeclFromUserName h.getId).type
      | none   => instantiateMVars (← getMainTarget)
    let some (α, lhs, rhs) := ty.eq? | return
    unless α.isConstOf ``Nat do return
    let mut cells : Array Expr := #[]
    let mut constSum := 0
    for ti in collectSummands lhs do
      match ← natLitOf ti with
      | some n => constSum := constSum + n
      | none   => cells := cells.push ti
    let some rn ← natLitOf rhs | return
    if constSum == 0 || cells.isEmpty then return
    let mut lhsStx ← PrettyPrinter.delab cells[0]!
    for i in [1:cells.size] do
      lhsStx ← `($lhsStx + $(← PrettyPrinter.delab cells[i]!))
    match tgt? with
    | some h => evalTactic (← `(tactic|
        replace $h : $lhsStx = $(Lean.quote (rn - constSum)) := by omega))
    | none   => evalTactic (← `(tactic|
        suffices hsub : $lhsStx = $(Lean.quote (rn - constSum)) by omega))

open Lean Meta Elab Tactic in
/-- Shared core of `ssimp`: `tgt?` is the hypothesis to simplify, or `none` for the goal. -/
private def ssimpCore (tgt? : Option Ident) : TacticM Unit := withMainContext do
  -- targeted: only the cells actually appearing in the target need facts
  let targetTy ← match tgt? with
    | some h => instantiateMVars (← getLocalDeclFromUserName h.getId).type
    | none   => instantiateMVars (← getMainTarget)
  let targets ← (← collectStarCells targetTy).mapM fun slP => posCoords slP.appArg!
  let simpArgs ← (← boardSimpArgs (tgt?.map (·.getId)) (some targets)).mapM fun t =>
    `(Lean.Parser.Tactic.simpLemma| $t:term)
  -- `simp only` (not full `simp`) so the *only* rewrites are: substitute the known cells,
  -- reduce the now-concrete `if`s (`reduceIte`) and fold constants (`Nat.reduce*`,
  -- `add_zero`/`zero_add`). It deliberately does NOT collapse `(if _)=1 → .star`, decompose
  -- `_ + _ = 0`, or turn `_ ≠ 0` into a disjunction — those are the prover's explicit
  -- `extract_stars` / `extract_elims` moves, not a hidden side-effect of simplification.
  -- `try` so a line that only needs the constant-fold below (no cells to substitute) isn't
  -- rejected for "no progress".
  match tgt? with
  | some tgt => evalTactic (← `(tactic|
      try simp (config := { decide := true }) only
        [$simpArgs,*, ite_true, ite_false, add_zero, zero_add] at $tgt:ident))
  | none     => evalTactic (← `(tactic|
      try simp (config := { decide := true }) only
        [$simpArgs,*, ite_true, ite_false, add_zero, zero_add]))
  -- fold any literal left over on the LHS into the total: `cells + c = n` ↦ `cells = n - c`
  foldConstants tgt?

/-- `ssimp at h` simplifies hypothesis `h` (bare `ssimp` simplifies the goal) to its
    *arithmetic normal form*: it substitutes every `sl _ = .star`/`= .elim` fact in scope
    (plus, for each `sl _ = .star`, the neighbour eliminations the local `PuzzleConstraints`
    derives via `.adj`), reduces the resulting concrete `if`s and folds constants — but leaves
    the surviving `if`-terms and the top-level (in)equality intact. Turning a saturated line
    into `.star`/`.elim` cell facts is the explicit job of `extract_stars` / `extract_elims`. -/
syntax "ssimp" (" at " ident)? : tactic
elab_rules : tactic
  | `(tactic| ssimp)            => ssimpCore none
  | `(tactic| ssimp at $h:ident) => ssimpCore (some h)

open Lean Meta Elab Tactic in
/-- The local `PuzzleConstraints` hypothesis and the concrete board size, when both are
    determinable from the context. Used to materialise a star's neighbour eliminations. -/
private def consAndSize? : TacticM (Option (Ident × Nat)) := withMainContext do
  let mut consId? : Option Ident := none
  let mut cfg?    : Option Expr := none
  for decl in ← getLCtx do
    if decl.isImplementationDetail || decl.userName.hasMacroScopes then continue
    let ty ← instantiateMVars decl.type
    if ty.getAppFn.isConstOf ``PuzzleConstraints then
      consId? := some (mkIdent decl.userName)
      cfg?    := ty.getAppArgs[0]?
  match consId?, cfg? with
  | some consId, some cfg =>
    match ← whnf (← mkAppM ``Config.size #[cfg]) with
    | .lit (.natVal n) => return some (consId, n)
    | _ => return none
  | _, _ => return none

open Lean Meta Elab Tactic in
/-- `solve_board` discharges the final `sl = <stated solution>` goal. It first ensures every
    cell has a direct `sl ⟨c,r⟩ = .star`/`.elim` hypothesis in context — reusing what the proof
    already produced, and materialising `h_<c><r>_elim` via `.adj` for any missing cell that
    borders a known star — then splits `sl` per cell with `funext ⟨c,r⟩ <;> fin_cases c <;>
    fin_cases r` and closes each of the `size²` goals with a bare `assumption`. Much cheaper
    than a per-cell `simp`, since the goal `sl ⟨c,r⟩ = .X` unifies directly against the matching
    hypothesis without touching a simp set. -/
elab "solve_board" : tactic => withMainContext do
  let some (consId, size) := (← consAndSize?)
    | throwError "`solve_board`: no `PuzzleConstraints` in context"
  -- Scan the context: cells that already have a fact under *some* name, and the star hyps
  -- we can call `.adj` on to fill in gaps.
  let mut hasFact : Array (Nat × Nat) := #[]
  let mut stars   : Array ((Nat × Nat) × Ident) := #[]
  for decl in ← getLCtx do
    if decl.isImplementationDetail || decl.userName.hasMacroScopes then continue
    let ty ← instantiateMVars decl.type
    let some (α, lhs, rhs) := ty.eq? | continue
    unless α.isConstOf ``Cell do continue
    unless lhs.isApp do continue
    let cr ← try posCoords lhs.appArg! catch _ => continue
    hasFact := hasFact.push cr
    if rhs.isConstOf ``Cell.star then
      stars := stars.push (cr, mkIdent decl.userName)
  -- For every cell without a fact, try to derive `h_<c><r>_elim` from an adjacent star.
  let mut filled := 0
  let mut uncovered : Array (Nat × Nat) := #[]
  for c in [0:size] do
    for r in [0:size] do
      if hasFact.contains (c, r) then continue
      let mut ok := false
      for nb in kingNeighbors c r size do
        if let some starId := (stars.find? (·.1 == nb)).map (·.2) then
          let name := mkIdent (Name.mkSimple s!"h_{c}{r}_elim")
          evalTactic (← `(tactic|
            have $name := ($consId).adj $starId ⟨$(Lean.quote c), $(Lean.quote r)⟩ (by decide)))
          filled := filled + 1
          ok := true
          break
      unless ok do uncovered := uncovered.push (c, r)
  logInfo s!"solve_board coverage: {hasFact.size} preexisting cell facts, \
    {filled} filled by adjacency, {uncovered.size} still uncovered ({uncovered.toList}); \
    stars in scope: {stars.size}"
  evalTactic (← `(tactic| funext ⟨c, r⟩))
  evalTactic (← `(tactic| fin_cases c <;> fin_cases r <;> assumption))

open Lean Meta in
/-- Reduce a concrete `neighbors p` list to the `(col, row)` pairs of its elements. -/
private partial def neighborCoords (l : Expr) : MetaM (Array (Nat × Nat)) := do
  match (← whnf l).getAppFnArgs with
  | (``List.cons, #[_, hd, tl]) =>
    match (← whnf hd).getAppFnArgs with
    | (``Pos.mk, #[_, colFin, rowFin]) =>
      return #[(← finLitNat colFin, ← finLitNat rowFin)] ++ (← neighborCoords tl)
    | _ => throwError "`expand_adj`: neighbour was not a `Pos.mk` (got `{hd}`)"
  | (``List.nil, _) => return #[]
  | _ => throwError "`expand_adj`: could not reduce the neighbour list (got `{l}`)"

open Lean Meta Elab Tactic in
/-- `expand_adj (h.adj hstar)` takes an adjacency proof `∀ n ∈ neighbors p, sl n = .elim`
    (for a `sl p = .star`) and introduces, for every neighbour `⟨c, r⟩` of `p`, a hypothesis
    `h_<c><r>_elim : sl ⟨c, r⟩ = .elim`. It *computes* `neighbors p` (see `neighborCoords`)
    and walks it, so boundary cells (fewer than 8 neighbours) just yield fewer hypotheses. -/
elab "expand_adj " adjStx:term:max : tactic => withMainContext do
  let ty ← instantiateMVars (← inferType (← elabTerm adjStx none))
  let some listExpr := ty.find? (·.getAppFn.isConstOf ``neighbors)
    | throwError "`expand_adj` expects an adjacency proof mentioning `neighbors p`"
  for (c, r) in ← neighborCoords listExpr do
    let name := mkIdent (Name.mkSimple s!"h_{c}{r}_elim")
    evalTactic (← `(tactic|
      have $name := $adjStx ⟨$(Lean.quote c), $(Lean.quote r)⟩ (by decide)))

open Lean Meta Elab Tactic in
/-- `omega_using [a₁, …, aₙ]` runs `omega` seeing only the listed facts (plus the goal): every
    *other* clearable hypothesis is removed first, so `omega` cannot pick up unrelated
    arithmetic facts. Each `aᵢ` is either

    * a local hypothesis name — kept in context; or
    * any other term/proof — e.g. `Cell.ite_star_le_one (sl ⟨5, 0⟩)` — which is introduced as a
      fresh hypothesis first, so you can hand `omega` a bound it can't infer without a separate
      `have`.

    Faster and more predictable than bare `omega` in a context cluttered with row/column/shape
    sums. -/
elab "omega_using " "[" args:term,* "]" : tactic => withMainContext do
  -- classify each arg against the *current* context, before introducing anything
  let lctx0 ← getLCtx
  let mut keepNames : Array Name := #[]
  let mut termArgs : Array Term := #[]
  for arg in args.getElems do
    match arg with
    | `($id:ident) =>
      if (lctx0.findFromUserName? id.getId).isSome then keepNames := keepNames.push id.getId
      else termArgs := termArgs.push arg
    | _ => termArgs := termArgs.push arg
  -- introduce the non-hypothesis terms as fresh kept hypotheses
  for i in [0:termArgs.size] do
    let name := Name.mkSimple s!"omega_arg_{i}"
    keepNames := keepNames.push name
    evalTactic (← `(tactic| have $(mkIdent name) := $(termArgs[i]!)))
  -- clear everything not kept, then omega
  withMainContext do
    let toClear := (← getLCtx).foldl (init := #[]) fun acc decl =>
      if decl.isImplementationDetail || keepNames.contains decl.userName then acc
      else acc.push decl.fvarId
    liftMetaTactic1 (·.tryClearMany toClear)
    evalTactic (← `(tactic| omega))

/-- `adj_le_one h [c₁, …, cₙ] as hb` records that a pairwise-adjacent (king-move clique) set
    of cells holds at most one star: it introduces
    `hb : (if sl c₁ = .star then 1 else 0) + … + (if sl cₙ = .star then 1 else 0) ≤ 1`,
    discharging the clique side-condition with `decide`. Thin wrapper over
    `sum_le_one_of_pairwise_adj` that also expands the `List.map`/`List.sum` to a `+`-tree. -/
macro "adj_le_one " h:term:max " [" cells:term,* "]" " as " name:ident : tactic =>
  `(tactic|
    (have $name := sum_le_one_of_pairwise_adj $h [$cells,*] (by decide);
     simp only [List.map_cons, List.map_nil, List.sum_cons, List.sum_nil, add_zero]
       at $name:ident))

open Lean Meta in
/-- Collect the `sl _` subterms of every `if sl _ = .star then 1 else 0` leaf of a `+`-tree. -/
private partial def starIteCells (e : Expr) : MetaM (Array Expr) := do
  match e.getAppFnArgs with
  | (``HAdd.hAdd, #[_, _, _, _, a, b]) => return (← starIteCells a) ++ (← starIteCells b)
  | (``ite, #[_, cond, _, _, _]) =>
    match cond.eq? with
    | some (α, lhs, rhs) =>
      if α.isConstOf ``Cell && rhs.isConstOf ``Cell.star then return #[lhs] else return #[]
    | none => return #[]
  | _ => return #[]

open Lean Meta in
/-- The nested `rcases` pattern that names each `sl _ = .elim` leaf of an `∧`-tree
    `h_<c><r>_elim` — used to destructure a conjunction of elim facts that `ssimp` may have
    already collapsed the line into. -/
private partial def elimConjPattern (e : Expr) : MetaM (TSyntax `rcasesPat) := do
  match e.getAppFnArgs with
  | (``And, #[a, b]) => `(rcasesPat| ⟨$(← elimConjPattern a), $(← elimConjPattern b)⟩)
  | _ =>
    let some (α, lhs, rhs) := e.eq?
      | throwError "`extract_elims`: expected `sl _ = .elim`, got `{e}`"
    unless α.isConstOf ``Cell && rhs.isConstOf ``Cell.elim do
      throwError "`extract_elims`: expected `sl _ = .elim`, got `{e}`"
    let (c, r) ← posCoords lhs.appArg!
    `(rcasesPat| $(mkIdent (Name.mkSimple s!"h_{c}{r}_elim")):ident)

open Lean Meta Elab Tactic in
/-- `_extract_elims h` (the raw extractor; use `extract_elims`, which `ssimp`s first) names
    the forced eliminations of a line hypothesis `h`, in whichever form it currently has:

    * a *saturated* sum `(∑ if sl cᵢ = .star then 1 else 0) + known = target` (known constants
      already meeting `target`, in any position) — each `if`-cell is forced to `0`, introduced
      as `h_<c><r>_elim` and discharged by `omega_using [h]` via `Cell.eq_elim_of_ite_zero`;
    * a conjunction of `sl _ = .elim` facts (e.g. after `ssimp` already collapsed the sum) —
      simply destructured into the same `h_<c><r>_elim` names. -/
elab "_extract_elims " hId:ident : tactic => withMainContext do
  let hLocal ← getLocalDeclFromUserName hId.getId
  let ty ← instantiateMVars hLocal.type
  if ty.isAppOf ``And then
    evalTactic (← `(tactic| obtain $(← elimConjPattern ty) := $hId:ident))
  else
    let some (_, lhs, _) := ty.eq?
      | throwError "`{hId}` is not an equality or a conjunction of elims"
    for slP in ← starIteCells lhs do
      let (c, r) ← posCoords slP.appArg!
      let slPStx ← PrettyPrinter.delab slP
      let name := mkIdent (Name.mkSimple s!"h_{c}{r}_elim")
      evalTactic (← `(tactic|
        have $name : $slPStx = .elim := Cell.eq_elim_of_ite_zero (by omega_using [$hId:ident])))
    evalTactic (← `(tactic|clear $hId:ident))

open Lean Meta Elab Tactic in
/-- `_extract_stars h` (the raw extractor; use `extract_stars`, which `ssimp`s first) reads a
    *tight* line hypothesis `h : (∑ if sl cᵢ = .star then 1 else 0) + known = target` in which
    the number of `if`-cells exactly equals `target - known` — so every cell is forced to a
    star — and introduces `h_<c><r>_star : sl ⟨c, r⟩ = .star` for each. Since `omega` has no
    upper bound on an `if`-atom, it first feeds in the `Cell.ite_star_le_one` bounds, then
    discharges each cell with `omega_using` through `Cell.eq_star_of_ite_one`.

    For every star it introduces, it then materialises that star's king-move neighbour
    eliminations — `h_<nc><nr>_elim : sl ⟨nc, nr⟩ = .elim` via the local `PuzzleConstraints`'
    `.adj` — but only for neighbours whose `h_<nc><nr>_elim` is not already in scope, so no
    duplicate elim hypotheses accumulate. This also lets subsequent `ssimp`s hit a direct fact
    instead of re-deriving the adjacency on the fly (a large kernel-time win). -/
elab "_extract_stars " hId:ident : tactic => withMainContext do
  let hLocal ← getLocalDeclFromUserName hId.getId
  let some (_, lhs, _) := (← instantiateMVars hLocal.type).eq?
    | throwError "`{hId}` is not an equality"
  let cells ← (← starIteCells lhs).mapM fun slP => do
    let (c, r) ← posCoords slP.appArg!
    return (← PrettyPrinter.delab slP, c, r)
  -- 1. the `≤ 1` upper bounds `omega` lacks on each `if`-atom
  let mut bounds : Array Ident := #[]
  for (slPStx, c, r) in cells do
    let bname := mkIdent (Name.mkSimple s!"hb_{c}{r}")
    evalTactic (← `(tactic| have $bname := Cell.ite_star_le_one $slPStx))
    bounds := bounds.push bname
  -- 2. with the bounds in hand, every cell is forced to a star
  let omegaArgs := #[hId] ++ bounds
  for (slPStx, c, r) in cells do
    let name := mkIdent (Name.mkSimple s!"h_{c}{r}_star")
    evalTactic (← `(tactic|
      have $name : $slPStx = .star := Cell.eq_star_of_ite_one (by omega_using [$omegaArgs,*])))
  -- 3. drop the scaffolding bounds and the spent line
  for b in bounds do evalTactic (← `(tactic| clear $b:ident))
  evalTactic (← `(tactic| clear $hId:ident))
  -- 4. materialise each new star's neighbour eliminations, skipping any `h_<nc><nr>_elim`
  --    already in scope (so no duplicate elim hypotheses accumulate). Sharing one `fvar` for
  --    each adjacency lets `ssimp` reuse it as a direct fact instead of re-embedding a fresh
  --    `.adj … (by decide)` proof term per call — the deduplication that saves the kernel.
  if let some (consId, size) := (← consAndSize?) then
    for (_, c, r) in cells do
      let starName := mkIdent (Name.mkSimple s!"h_{c}{r}_star")
      for (nc, nr) in kingNeighbors c r size do
        withMainContext do
          let elimName := Name.mkSimple s!"h_{nc}{nr}_elim"
          if ((← getLCtx).findFromUserName? elimName).isSome then return
          evalTactic (← `(tactic|
            have $(mkIdent elimName) :=
              ($consId).adj $starName ⟨$(Lean.quote nc), $(Lean.quote nr)⟩ (by decide)))

/-- `extract_elims h` normalises the line `h` with `ssimp` first (so already-known cells are
    folded into the constant), then names its forced eliminations with `_extract_elims`. The
    `ssimp` is a `try` so it's a no-op when `h` is already in normal form. -/
macro "extract_elims " h:ident : tactic =>
  `(tactic| ((try ssimp at $h:ident); _extract_elims $h:ident))

/-- `extract_stars h` normalises the line `h` with `ssimp` first, then names its forced stars
    with `_extract_stars` — which also materialises each new star's neighbour eliminations
    (`h_<nc><nr>_elim`), skipping any already in scope. The `ssimp` is a `try` so it's a no-op
    when `h` is already normal. -/
macro "extract_stars " h:ident : tactic =>
  `(tactic| ((try ssimp at $h:ident); _extract_stars $h:ident))

open Lean in
/-- `starcount sl [c₁, …, cₙ]` is the star tally over the listed cells — it expands (at parse
    time) to `(if sl c₁ = .star then 1 else 0) + … + (if sl cₙ = .star then 1 else 0)`, the
    exact `+`-tree every tactic (`ssimp`, `omega_using`, `subsum`, `extract_*`) already handles.
    So it is purely a concise way to *write* a partial-sum goal; proving it is unchanged.
    (Named `starcount`, not `stars`, to avoid clashing with the `Config.stars` field.) -/
macro "starcount " sl:term:max " [" cells:term,* "]" : term => do
  let cs := cells.getElems
  if cs.isEmpty then
    `((0 : Nat))
  else
    let mut e ← `(if $sl $(cs[0]!) = .star then 1 else 0)
    for i in [1:cs.size] do
      e ← `($e + if $sl $(cs[i]!) = .star then 1 else 0)
    return e

-------------------------------------------
--- TINY PUZZLE
-------------------------------------------

abbrev tinyConfig : Config := { stars := 1, size := 4, hsize := by omega }

def tinyPuzzle : Puzzle tinyConfig := fun pos =>
  let grid : Fin 4 → Fin 4 → Fin 4 := ![
    ![0, 0, 1, 1],
    ![2, 0, 0, 1],
    ![2, 2, 0, 3],
    ![2, 2, 3, 3]
  ]
  grid pos.row pos.col

set_option profiler true in
set_option profiler.threshold 500 in
theorem tinyProof : ∃! sl : Solution tinyConfig,
    PuzzleConstraints tinyPuzzle sl := by
  refine ⟨?_, ?_, ?_⟩
  · exact fun p =>
      let grid : Fin 4 → Fin 4 → Cell := ![
        ![.elim, .star, .elim, .elim],
        ![.elim, .elim, .elim, .star],
        ![.star, .elim, .elim, .elim],
        ![.elim, .elim, .star, .elim]
      ]
      grid p.row p.col
  · constructor <;> native_decide
  · intro sl h
    expand_shapes h
    expand_rows h
    expand_cols h

    have h_22_elim : sl ⟨2, 2⟩ = .elim := by
      scontra
      ssimp at h_shape3
    have h_21_elim : sl ⟨2, 1⟩ = .elim := by
      scontra
      ssimp at h_shape1
    have h_20_elim : sl ⟨2, 0⟩ = .elim := by
      scontra
      extract_elims h_row0
      ssimp at h_shape0

    extract_stars h_col2
    extract_stars h_row2
    extract_stars h_row1
    extract_stars h_col1

    solve_board

-------------------------------------------
--- HARD PUZZLE
-------------------------------------------

abbrev hardConfig : Config := { stars := 2, size := 10, hsize := by omega }

def hardPuzzle : Puzzle hardConfig := fun pos =>
  let grid : Fin 10 → Fin 10 → Fin 10 := ![
    ![0, 0, 0, 0, 0, 1, 1, 1, 1, 1],
    ![2, 0, 0, 0, 0, 0, 1, 1, 3, 3],
    ![2, 2, 0, 0, 0, 0, 4, 1, 3, 3],
    ![2, 5, 5, 0, 0, 0, 4, 4, 3, 3],
    ![2, 5, 5, 5, 5, 5, 4, 6, 6, 3],
    ![2, 2, 2, 5, 5, 6, 6, 6, 6, 6],
    ![7, 7, 7, 5, 5, 6, 6, 6, 6, 6],
    ![7, 8, 8, 5, 5, 6, 6, 6, 6, 6],
    ![7, 8, 8, 8, 8, 8, 6, 9, 9, 6],
    ![8, 8, 8, 8, 8, 8, 8, 9, 9, 9]
  ]
  grid pos.row pos.col


set_option maxHeartbeats 1000000
set_option profiler true in
set_option profiler.threshold 500 in
theorem hardProof : ∃! sl : Solution hardConfig,
    PuzzleConstraints hardPuzzle sl := by
  refine ⟨?_, ?_, ?_⟩
  · exact fun p =>
      let grid : Fin 10 → Fin 10 → Cell := ![
        ![.elim, .elim, .elim, .elim, .elim, .star, .elim, .star, .elim, .elim],
        ![.elim, .elim, .elim, .star, .elim, .elim, .elim, .elim, .elim, .star],
        ![.elim, .star, .elim, .elim, .elim, .elim, .star, .elim, .elim, .elim],
        ![.elim, .elim, .elim, .elim, .star, .elim, .elim, .elim, .star, .elim],
        ![.elim, .elim, .star, .elim, .elim, .elim, .star, .elim, .elim, .elim],
        ![.star, .elim, .elim, .elim, .star, .elim, .elim, .elim, .elim, .elim],
        ![.elim, .elim, .star, .elim, .elim, .elim, .elim, .elim, .star, .elim],
        ![.star, .elim, .elim, .elim, .elim, .star, .elim, .elim, .elim, .elim],
        ![.elim, .elim, .elim, .star, .elim, .elim, .elim, .star, .elim, .elim],
        ![.elim, .star, .elim, .elim, .elim, .elim, .elim, .elim, .elim, .star]
      ]
      grid p.row p.col
  · constructor <;> native_decide
  · intro sl h

    expand_shape h 9
    have h_89_elim : sl ⟨8, 9⟩ = .elim := by
      scontra
      ssimp at h_shape9
    have h_88_elim : sl ⟨8, 8⟩ = .elim := by
      scontra
      ssimp at h_shape9
    have h_99_star : sl ⟨9, 9⟩ = .star := by
      scontra
      extract_stars h_shape9
      ssimp at h_79_star

    ssimp at h_shape9
    expand_shape h 4
    have h_63_elim : sl ⟨6, 3⟩ = .elim := by
      scontra
      ssimp at h_shape4
    have h_73_elim : sl ⟨7, 3⟩ = .elim := by
      scontra
      ssimp at h_shape4
    extract_stars h_shape4

    expand_col h 6
    extract_elims h_col6

    expand_shape h 1
    ssimp at h_shape1
    expand_row h 0
    subsum h_shape1 at h_row0
    extract_elims h_row0
    have h_81_elim : sl ⟨8, 1⟩ = .elim := by
      scontra
      ssimp at h_shape1
      omega_using [h_shape1, (sl ⟨5, 0⟩).ite_star_le_one]

    expand_shape h 7
    have h_17_elim : sl ⟨1, 7⟩ = .elim := by
      scontra
      ssimp at h_shape7
    have h_15_elim : sl ⟨1, 5⟩ = .elim := by
      scontra
      ssimp at h_shape7
      adj_le_one h [⟨0, 7⟩, ⟨0, 8⟩] as hb
      omega_using [h_shape7, hb]
    expand_col h 1
    ssimp at h_col1

    -- Is there a way to simplify these calculations? For example, clever use of omega_using
    expand_shape h 2
    expand_col h 0
    have hn_shape7_col0 : starcount sl [⟨0, 6⟩, ⟨0, 8⟩] ≠ 2 := by
      intro h_ne
      extract_stars h_ne
      extract_elims h_col0
      extract_stars h_shape2
      ssimp at h_col1
    have h_27_elim : sl ⟨2, 7⟩ = .elim := by
      scontra h_27_star
      have h_07_elim : sl ⟨0, 7⟩ = .elim := by
        scontra
        ssimp at h_shape7
      ssimp at h_shape7
      exact hn_shape7_col0 h_shape7
    have h_shape7_col0 : starcount sl [⟨0, 6⟩, ⟨0, 7⟩, ⟨0, 8⟩] = 1 := by
      by_cases h_07 : sl ⟨0, 7⟩ = .star
      · ssimp
      · have h7 : starcount sl [⟨0, 7⟩] = 0 := by simp [h_07]
        adj_le_one h [⟨1, 6⟩, ⟨2, 6⟩] as hb
        omega_using [hb, h_shape7, h7, hn_shape7_col0, Cell.ite_star_le_one (sl ⟨0, 6⟩), Cell.ite_star_le_one (sl ⟨0, 8⟩)]
    clear hn_shape7_col0
    subsum h_shape7_col0 at h_col0
    ssimp at h_col0
    subsum h_shape7_col0 at h_shape7
    ssimp at h_shape7
    have h_25_elim : sl ⟨2, 5⟩ = .elim := by
      scontra
      ssimp at h_shape7
    have h_12_star : sl ⟨1, 2⟩ = .star := by
      scontra
      ssimp at h_shape2
      subsum h_shape2 at h_col0
      omega_using [h_col0]
    ssimp at h_shape2
    subsum h_shape2 at h_col0
    extract_elims h_col0

    have h_14_elim : sl ⟨1, 4⟩ = .elim := by
      scontra
      ssimp at h_shape2

    expand_row h 2
    extract_elims h_row2

    expand_shape h 3
    ssimp at h_shape3
    expand_col h 9
    ssimp at h_col9
    have h_shape3_col9 : starcount sl [⟨9, 1⟩, ⟨9, 3⟩, ⟨9, 4⟩] = 1 := by
      omega_using [h_shape3, h_col9, Cell.ite_star_le_one (sl ⟨8, 3⟩)]
    subsum h_shape3_col9 at h_shape3
    extract_stars h_shape3
    extract_stars h_shape3_col9
    extract_elims h_col9

    extract_stars h_shape1

    expand_col h 7
    subsum h_shape9 at h_col7
    extract_elims h_col7

    expand_shape h 8
    ssimp at h_shape8
    expand_row h 8
    ssimp at h_row8
    expand_row h 9
    ssimp at h_row9
    have h_rows89 := congrArg₂ (· + ·) h_row8 h_row9
    simp at h_rows89
    subsum h_shape8 at h_rows89
    subsum h_shape9 at h_rows89
    extract_elims h_rows89
    clear h_shape8
    clear h_row8
    simp [h_08_elim] at h_shape7_col0
    have h_16_elim : sl ⟨1, 6⟩ = .elim := by
      scontra
      ssimp at h_shape7_col0
    extract_stars h_shape7
    ssimp at h_col1
    have h_28_elim : sl ⟨2, 8⟩ = .elim := by
      scontra
      ssimp at h_col1
    have h_29_elim : sl ⟨2, 9⟩ = .elim := by
      scontra
      ssimp at h_col1
    expand_col h 2
    extract_stars h_col2
    expand_row h 3
    extract_stars h_row3
    expand_row h 4
    extract_elims h_row4
    extract_stars h_shape2
    extract_stars h_shape7_col0
    extract_stars h_col1
    extract_elims h_row9
    extract_stars h_shape9
    expand_col h 3
    extract_stars h_col3
    expand_row h 7
    extract_stars h_row7
    expand_col h 4
    extract_stars h_col4
    expand_row h 6
    extract_stars h_row6

    solve_board


-------------------------------------------
--- EXPERT PUZZLE
-------------------------------------------

abbrev expertConfig : Config := { stars := 2, size := 10, hsize := by omega }

def expertPuzzle : Puzzle hardConfig := fun pos =>
  let grid : Fin 10 → Fin 10 → Fin 10 := ![
    ![0, 0, 1, 1, 1, 1, 1, 2, 2, 2],
    ![0, 0, 0, 0, 0, 2, 2, 2, 2, 2],
    ![3, 4, 3, 3, 0, 0, 0, 2, 2, 2],
    ![3, 4, 3, 3, 5, 0, 0, 2, 6, 6],
    ![3, 4, 3, 3, 5, 5, 0, 0, 6, 6],
    ![3, 3, 3, 3, 5, 5, 6, 6, 6, 6],
    ![7, 7, 3, 8, 5, 6, 6, 6, 9, 6],
    ![7, 3, 3, 8, 6, 6, 8, 9, 9, 6],
    ![7, 8, 8, 8, 8, 8, 8, 9, 9, 9],
    ![7, 8, 8, 8, 8, 8, 8, 9, 9, 9]
  ]
  grid pos.row pos.col


set_option maxHeartbeats 2000000
set_option profiler true in
set_option profiler.threshold 500 in
theorem expertProof : ∃! sl : Solution expertConfig,
    PuzzleConstraints expertPuzzle sl := by
  refine ⟨?_, ?_, ?_⟩
  · exact fun p =>
      let grid : Fin 10 → Fin 10 → Cell := ![
        ![.elim, .elim, .star, .elim, .elim, .elim, .star, .elim, .elim, .elim],
        ![.elim, .elim, .elim, .elim, .star, .elim, .elim, .elim, .elim, .star],
        ![.elim, .star, .elim, .elim, .elim, .elim, .elim, .star, .elim, .elim],
        ![.elim, .elim, .elim, .elim, .star, .elim, .elim, .elim, .elim, .star],
        ![.elim, .star, .elim, .elim, .elim, .elim, .elim, .star, .elim, .elim],
        ![.elim, .elim, .elim, .star, .elim, .star, .elim, .elim, .elim, .elim],
        ![.star, .elim, .elim, .elim, .elim, .elim, .elim, .elim, .star, .elim],
        ![.elim, .elim, .star, .elim, .elim, .star, .elim, .elim, .elim, .elim],
        ![.star, .elim, .elim, .elim, .elim, .elim, .elim, .elim, .star, .elim],
        ![.elim, .elim, .elim, .star, .elim, .elim, .star, .elim, .elim, .elim]
      ]
      grid p.row p.col
  · constructor <;> native_decide
  · intro sl h

    expand_shape h 4
    have h_13_elim : sl ⟨1, 3⟩ = .elim := by
      scontra
      ssimp at h_shape4
    extract_stars h_shape4
    expand_col h 1
    extract_elims h_col1

    expand_row h 0
    expand_shape h 1
    subsum h_shape1 at h_row0
    extract_elims h_row0
    have h_31_elim : sl ⟨3, 1⟩ = .elim := by
      scontra
      extract_stars h_shape1
      ssimp at h_50_star
    have h_51_elim : sl ⟨5, 1⟩ = .elim := by
      scontra
      extract_stars h_shape1
      ssimp at h_30_star

    expand_shape h 2
    have h_62_elim : sl ⟨6, 2⟩ = .elim := by
      scontra
      adj_le_one h [⟨8, 1⟩, ⟨9, 1⟩, ⟨8, 2⟩, ⟨9, 2⟩] as hb
      ssimp at h_shape2
      omega_using [h_shape2, hb]
    expand_shape h 5
    have h_53_elim : sl ⟨5, 3⟩ = .elim := by
      scontra
      adj_le_one h [⟨4, 5⟩, ⟨5, 5⟩, ⟨4, 6⟩] as hb
      ssimp at h_shape5
      omega_using [h_shape5, hb]
    have h_56_elim : sl ⟨5, 6⟩ = .elim := by
      scontra
      adj_le_one h [⟨4, 4⟩, ⟨5, 4⟩, ⟨4, 3⟩] as hb
      ssimp at h_shape5
      omega_using [h_shape5, hb]
    expand_row h 4
    have h_34_elim : sl ⟨3, 4⟩ = .elim := by
      scontra h_34_star
      have h_55_elim : sl ⟨5, 5⟩ = .elim := by
        scontra h_55_star
        ssimp at h_shape5
      extract_stars h_shape5
      -- TODO this is ugly, should just be able to do ssimp at h_row4
      have : starcount sl [⟨1, 4⟩, ⟨3, 4⟩, ⟨5, 4⟩] = 3 := by ssimp
      omega_using [h_row4, this]
    expand_shape h 3
    have h_36_elim : sl ⟨3, 6⟩ = .elim := by
      scontra
      adj_le_one h [⟨3, 2⟩, ⟨3, 3⟩] as hb
      ssimp at h_shape3
      omega_using [h_shape3, hb]

    expand_shape h 0
    expand_col h 4
    have h_35_star : sl ⟨3, 5⟩ = .star := by
      scontra h_35_elim
      ssimp at h_shape3
      have h_shape3_col3 : starcount sl [⟨3, 2⟩, ⟨3, 3⟩] = 1 := by
        by_contra hn_shape3_col3
        adj_le_one h [⟨3, 2⟩, ⟨3, 3⟩] as hb3
        adj_le_one h [⟨2, 6⟩, ⟨2, 7⟩] as hb2
        omega_using [h_shape3, hn_shape3_col3, hb3, hb2]
      subsum h_shape3_col3 at h_shape3; rename _ => h_shape3_col2
      have : starcount sl [⟨4, 2⟩, ⟨4, 3⟩] = 0 := by
        adj_le_one h [⟨3, 2⟩, ⟨3, 3⟩, ⟨4, 2⟩, ⟨4, 3⟩] as hb3
        omega_using [hb3, h_shape3_col3]
      extract_elims this
      have h_45_elim : sl ⟨4, 5⟩ = .elim := by
        scontra
        ssimp at h_shape5
      have h_55_elim : sl ⟨5, 5⟩ = .elim := by
        scontra
        ssimp at h_shape5
      have h_46_star : sl ⟨4, 6⟩ = .star := by
        scontra
        extract_stars h_shape5
        ssimp at h_44_star
      ssimp at h_shape5
      subsum h_shape5 at h_row4
      extract_elims h_row4
      have h_52_elim : sl ⟨5, 2⟩ = .elim := by
        scontra
        ssimp at h_shape0
      extract_stars h_shape0
      extract_elims h_col4
      ssimp at h_shape5
    have h_54_elim : sl ⟨5, 4⟩ = .elim := by
      scontra
      ssimp at h_shape5
    extract_stars h_shape5
    extract_stars h_shape3
    expand_row h 5
    extract_elims h_row5
    have h_41_star : sl ⟨4, 1⟩ = .star := by
      scontra
      extract_stars h_shape0
      ssimp at h_63_star
    extract_elims h_col4
    extract_stars h_shape1
    expand_col h 3
    extract_stars h_col3
    have h_73_elim : sl ⟨7, 3⟩ = .elim := by
      scontra
      ssimp at h_shape0
    have h_81_elim : sl ⟨8, 1⟩ = .elim := by
      scontra
      ssimp at h_shape2
    have h_82_elim : sl ⟨8, 2⟩ = .elim := by
      scontra
      ssimp at h_shape2
    have h_72_star : sl ⟨7, 2⟩ = .star := by
      scontra
      extract_stars h_shape2
      ssimp at h_91_star
    extract_stars h_shape0
    expand_row h 3
    extract_stars h_row3
    clear h_row4
    extract_stars h_shape2
    expand_col h 6
    ssimp at h_col6
    expand_shape h 8
    subsum h_col6 at h_shape8
    extract_elims h_shape8
    expand_col h 5
    ssimp at h_col5
    extract_stars h_col5
    extract_stars h_col6
    expand_col h 9
    extract_elims h_col9
    expand_row h 7
    extract_elims h_row7
    expand_row h 9
    extract_elims h_row9
    expand_shape h 9
    extract_stars h_shape9
    expand_shape h 7
    extract_stars h_shape7

    solve_board

-------------------------------------------
--- EXPERT PUZZLE
-------------------------------------------

abbrev expert2Config : Config := { stars := 2, size := 10, hsize := by omega }

def expert2Puzzle : Puzzle hardConfig := fun pos =>
  let grid : Fin 10 → Fin 10 → Fin 10 := ![
    ![0, 0, 0, 0, 0, 1, 1, 1, 1, 1],
    ![0, 0, 0, 0, 0, 1, 1, 1, 1, 1],
    ![2, 0, 0, 0, 3, 3, 3, 1, 1, 1],
    ![2, 2, 2, 2, 2, 4, 3, 1, 1, 4],
    ![2, 2, 2, 2, 2, 4, 4, 4, 4, 4],
    ![2, 5, 5, 2, 4, 4, 4, 6, 7, 4],
    ![8, 5, 5, 5, 6, 6, 6, 6, 7, 4],
    ![8, 8, 5, 5, 6, 6, 6, 7, 7, 7],
    ![8, 8, 5, 5, 6, 7, 7, 7, 7, 7],
    ![8, 8, 8, 5, 9, 9, 9, 9, 7, 7]
  ]
  grid pos.row pos.col


set_option maxHeartbeats 2000000
set_option profiler true in
set_option profiler.threshold 500 in
theorem expert2Proof : ∃! sl : Solution expert2Config,
    PuzzleConstraints expert2Puzzle sl := by
  refine ⟨?_, ?_, ?_⟩
  · exact fun p =>
      let grid : Fin 10 → Fin 10 → Cell := ![
        ![.elim, .elim, .elim, .star, .elim, .elim, .elim, .star, .elim, .elim],
        ![.elim, .star, .elim, .elim, .elim, .elim, .elim, .elim, .elim, .star],
        ![.elim, .elim, .elim, .elim, .star, .elim, .star, .elim, .elim, .elim],
        ![.elim, .elim, .star, .elim, .elim, .elim, .elim, .elim, .elim, .star],
        ![.star, .elim, .elim, .elim, .elim, .star, .elim, .elim, .elim, .elim],
        ![.elim, .elim, .star, .elim, .elim, .elim, .elim, .elim, .star, .elim],
        ![.star, .elim, .elim, .elim, .star, .elim, .elim, .elim, .elim, .elim],
        ![.elim, .elim, .elim, .elim, .elim, .elim, .star, .elim, .star, .elim],
        ![.elim, .star, .elim, .star, .elim, .elim, .elim, .elim, .elim, .elim],
        ![.elim, .elim, .elim, .elim, .elim, .star, .elim, .star, .elim, .elim]
      ]
      grid p.row p.col
  · constructor <;> native_decide
  · intro sl h

    expand_shape h 9
    expand_row h 9
    subsum h_shape9 at h_row9
    extract_elims h_row9
    expand_shape h 0
    expand_shape h 1
    expand_row h 0
    expand_row h 1
    have : starcount sl [⟨1, 2⟩, ⟨2, 2⟩, ⟨3, 2⟩, ⟨7, 2⟩, ⟨8, 2⟩, ⟨9, 2⟩, ⟨7, 3⟩, ⟨8, 3⟩] = 0 := by
      omega_using [h_shape0, h_shape1, h_row0, h_row1]
    extract_elims this
    have h_above_shape9 : starcount sl [⟨4, 8⟩, ⟨5, 8⟩, ⟨6, 8⟩, ⟨7, 8⟩] = 0 := by
      adj_le_one h [⟨4, 8⟩, ⟨5, 8⟩, ⟨4, 9⟩, ⟨5, 9⟩] as h_box4
      adj_le_one h [⟨6, 8⟩, ⟨7, 8⟩, ⟨6, 9⟩, ⟨7, 9⟩] as h_box6
      omega_using [h_shape9, h_box4, h_box6]
    extract_elims h_above_shape9
    expand_shape h 3
    have h_52_elim : sl ⟨5, 2⟩ = .elim := by
      scontra
      ssimp at h_shape3
    have h_42_star : sl ⟨4, 2⟩ = .star := by
      scontra
      adj_le_one h [⟨6, 2⟩, ⟨6, 3⟩] as hb
      ssimp at h_shape3
      omega_using [h_shape3, hb]

    expand_shape h 8
    have h_07_elim : sl ⟨0, 7⟩ = .elim := by
      scontra
      ssimp at h_shape8
    have h_17_elim : sl ⟨1, 7⟩ = .elim := by
      scontra
      ssimp at h_shape8
    have h_06_star : sl ⟨0, 6⟩ = .star := by
      scontra
      adj_le_one h [⟨0, 8⟩, ⟨1, 8⟩] as hb
      ssimp at h_shape8
      omega_using [h_shape8, hb]
    ssimp at h_shape8

    expand_shape h 2
    expand_shape h 4
    expand_row h 2
    expand_row h 3
    expand_row h 4
    ssimp at h_shape2
    ssimp at h_shape3
    ssimp at h_shape4
    ssimp at h_row2
    ssimp at h_row3
    have : starcount sl [⟨3, 5⟩, ⟨4, 5⟩, ⟨5, 5⟩, ⟨6, 5⟩, ⟨9, 5⟩, ⟨9, 6⟩] = 0 := by
      omega_using [h_shape2, h_shape3, h_shape4, h_row2, h_row3, h_row4]
    extract_elims this
    have h_63_elim : sl ⟨6, 3⟩ = .elim := by
      scontra
      ssimp at h_shape4
      adj_le_one h [⟨8, 4⟩, ⟨9, 3⟩, ⟨9, 4⟩] as hb
      omega_using [h_shape4, hb]
    extract_stars h_shape3
    extract_elims h_row2

    expand_row h 5
    ssimp at h_row5
    have : starcount sl [⟨2, 5⟩] = 1 := by
      adj_le_one h [⟨7, 5⟩, ⟨8, 5⟩] as hb
      omega_using [h_row5, hb, (sl ⟨2, 5⟩).ite_star_le_one]
    extract_stars this
    ssimp at h_row5
    have : starcount sl [⟨7, 4⟩, ⟨8, 4⟩] = 0 := by
      adj_le_one h [⟨7, 4⟩, ⟨8, 4⟩, ⟨7, 5⟩, ⟨8, 5⟩] as hb
      omega_using [h_row5, hb]
    extract_elims this
    have : starcount sl [⟨7, 6⟩, ⟨8, 6⟩] = 0 := by
      adj_le_one h [⟨7, 6⟩, ⟨8, 6⟩, ⟨7, 5⟩, ⟨8, 5⟩] as hb
      omega_using [h_row5, hb]
    extract_elims this
    expand_shape h 7
    expand_col h 8
    have h_85_star : sl ⟨8, 5⟩ = .star := by
      scontra h_85_elim
      have h_87_elim : sl ⟨8, 7⟩ = .elim := by
        scontra
        ssimp at h_shape7
      have h_88_elim : sl ⟨8, 8⟩ = .elim := by
        scontra
        ssimp at h_shape7
      ssimp at h_col8
      adj_le_one h [⟨8, 0⟩, ⟨8, 1⟩] as hb
      omega_using [h_col8, hb]
    ssimp at h_shape4
    have : starcount sl [⟨9, 3⟩] = 1 := by
      adj_le_one h [⟨5, 4⟩, ⟨6, 4⟩] as hb
      omega_using [h_shape4, hb, (sl ⟨9, 3⟩).ite_star_le_one]
    extract_stars this

    expand_shape h 6
    ssimp at h_shape6
    have ⟨h_shape6_col4, h_shape6_col5, h_shape6_col6⟩ : starcount sl [⟨4, 6⟩, ⟨4, 7⟩] = 1 ∧ starcount sl [⟨5, 6⟩, ⟨5, 7⟩] = 0 ∧ starcount sl [⟨6, 6⟩, ⟨6, 7⟩] = 1 := by
      adj_le_one h [⟨4, 6⟩, ⟨4, 7⟩, ⟨5, 6⟩, ⟨5, 7⟩] as hb4
      adj_le_one h [⟨6, 6⟩, ⟨6, 7⟩, ⟨5, 6⟩, ⟨5, 7⟩] as hb6
      omega_using [h_shape6, hb4, hb6]
    extract_elims h_shape6_col5
    clear h_shape6
    expand_col h 4
    ssimp at h_col4
    have : starcount sl [⟨4, 0⟩, ⟨4, 4⟩, ⟨4, 9⟩] = 0 := by
      omega_using [h_shape6_col4, h_col4]
    extract_elims this
    expand_col h 6
    ssimp at h_col6
    have : starcount sl [⟨6, 0⟩, ⟨6, 4⟩, ⟨6, 9⟩] = 0 := by
      omega_using [h_shape6_col6, h_col6]
    extract_elims this
    extract_stars h_shape4
    extract_stars h_shape9
    extract_stars h_row4
    extract_stars h_shape2
    expand_col h 0
    extract_elims h_col0
    extract_stars h_shape8
    expand_shape h 5
    ssimp at h_shape5
    have : starcount sl [⟨3, 7⟩, ⟨4, 7⟩] = 0 := by
      adj_le_one h [⟨3, 7⟩, ⟨4, 7⟩, ⟨3, 8⟩] as hb38
      adj_le_one h [⟨3, 7⟩, ⟨4, 7⟩, ⟨4, 6⟩] as hb46
      omega_using [h_shape5, h_shape6_col4, hb38, hb46]
    extract_elims this
    extract_stars h_shape5
    extract_stars h_shape6_col4
    expand_row h 6
    extract_elims h_row6
    extract_stars h_shape6_col6
    expand_col h 5
    extract_elims h_col5
    expand_col h 7
    extract_stars h_col7
    extract_stars h_col8
    expand_col h 3
    extract_stars h_col3
    extract_elims h_row0
    extract_stars h_row1

    solve_board
