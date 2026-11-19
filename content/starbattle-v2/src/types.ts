export interface RawLevel {
  name?: string;
  difficulty: string;
  stars: number;
  size: number;
  shapes: string[];
}

export interface Puzzle {
  name: string;
  categoryIndex: number; // 1-based index within its category
  stars: number;
  size: number;
  regions: number[];
}

/** What the proof currently knows about a cell. */
export type CellK = 'star' | 'elim' | null;

export type LineKind = 'row' | 'col' | 'region';

/** Comparison operators a fact (or claim predicate) can carry. */
export type FactOp = '=' | '<=' | '>=' | '!=';
export type CmpOp = FactOp | '<' | '>';

/**
 * Composable expression pieces, Scratch-style. Ovals (`NumExpr`) are
 * number-valued: a star count over picked cells, a literal, or arithmetic over
 * two ovals. Hexagons (`CmpExpr`) are predicates comparing two ovals. `null`
 * in a slot means the slot is empty. Every node carries a unique `eid` so the
 * UI can address it (e.g. for board cell-picking on a specific count piece).
 */
export interface CountExpr { eid: string; kind: 'count'; cells: number[] }
export interface LitExpr   { eid: string; kind: 'lit'; value: number }
export interface ArithExpr { eid: string; kind: 'add' | 'sub'; a: NumExpr | null; b: NumExpr | null }
export type NumExpr = CountExpr | LitExpr | ArithExpr;
export interface CmpExpr   { eid: string; kind: 'cmp'; op: CmpOp; a: NumExpr | null; b: NumExpr | null }
export interface AndOrExpr { eid: string; kind: 'and' | 'or'; a: BoolExpr | null; b: BoolExpr | null }
export interface NotExpr   { eid: string; kind: 'not'; a: BoolExpr | null }
export interface CellExpr  { eid: string; kind: 'is_star' | 'is_elim'; cell: number }
export type BoolExpr = CmpExpr | AndOrExpr | NotExpr | CellExpr;

export type HypExpr =
  | { eid: string; kind: 'ref'; factId: string | null }
  | { eid: string; kind: 'add' | 'sub' | 'combine'; left: HypExpr | null; right: HypExpr | null }
  | { eid: string; kind: 'clique'; cells: number[] }
  | { eid: string; kind: 'bound'; op: '<=' | '>='; cells: number[]; target: number };

/**
 * A counting fact: the number of stars among `cells` relates to `target`.
 * Kept normalized — `cells` only contains cells still unknown, and `target`
 * has already been reduced by any stars discovered among the original line.
 * This normalization is the app's automatic equivalent of the Lean `ssimp`.
 */
export interface Fact {
  id: string; // e.g. "row3", "col0", "region2" — stable name for references
  kind: LineKind | 'derived';
  index: number;
  /** Display name for derived facts (e.g. "row 1 − region 2"). */
  label?: string;
  op: FactOp;
  cells: number[];
  target: number;
  impossible: boolean;
}

/**
 * A stored conditional derivation: "if `pred` held, this is what would follow."
 *
 * Nothing in it is asserted. It is a snapshot of the body's end state, which `use` splices
 * into the current state as a difference once `pred` is established — modus ponens, deferred
 * until you find out which way the supposition goes.
 */
export interface Supposition {
  /** Its name, which is how `use` refers to it. */
  name: string;
  pred: BoolExpr;
  /** The body's final board. */
  cells: CellK[];
  /** The body's final hypothesis pool. */
  facts: Fact[];
  /** The body derived a contradiction, so `pred` is in fact false. */
  contradiction: boolean;
  /**
   * Suppositions made inside the body.
   *
   * Each is conditional on this one's `pred`, so discharging this supposition makes them
   * available too. Without them, nesting a supposition inside another put it out of reach:
   * the inner record died with the body that held it, even once its condition was met.
   */
  suppositions: Supposition[];
}

export interface PState {
  cells: CellK[];
  facts: Fact[];
  /** Proven Boolean propositions that do not normalize to linear count facts. */
  propositions: BoolExpr[];
  /** Conditional derivations in scope here, by the order they were made. */
  suppositions: Supposition[];
  contradiction: boolean;
  /**
   * A `sorry` was used here: whatever this body was meant to establish is taken as given
   * rather than proved. It closes the enclosing claim the way a real proof would, so the
   * work can carry on — the incompleteness is reported rather than silently tolerated.
   */
  admitted: boolean;
}

/**
 * Proof blocks, mirroring the Lean tactic vocabulary. Every row/column/region
 * count fact is initialized automatically (the expand_rows/cols/shapes prelude),
 * so there is no explicit "count" block.
 *  - stars    → extract_stars (tight line: every remaining cell is a star)
 *  - elims    → extract_elims (saturated line: every remaining cell is elim)
 *  - subsum   → subsum: subtract a contained count from a larger one, leaving
 *               a fact about the difference cells
 *  - addsum   → congrArg₂ (+): add two disjoint counts into one over the union
 *  - clique   → adj_le_one: a set of pairwise-touching cells holds at most one
 *               star (two would be adjacent)
 *  - split    → pigeonhole: parts that are disjoint, cover a count fact exactly,
 *               and whose upper bounds total its count must each be exactly tight,
 *               since any slack would leave the total short
 *  - claim    → a hexagon predicate proven by contradiction: its negation is
 *               put in disjunctive normal form and each DNF term becomes a
 *               refutation arm (comparison literals close under negation:
 *               = ↔ ≠, ≤k ↔ ≥k+1; `=` expands to the two-bound disjunction so
 *               its arms carry usable inequalities). Comparisons are lowered
 *               to `★{cells} op k` form at evaluation time.
 */
export type Block =
  | { id: string; type: 'stars'; expr: HypExpr | null }
  | { id: string; type: 'elims'; expr: HypExpr | null }
  | { id: string; type: 'clear'; factId: string | null }
  | { id: string; type: 'rename'; factId: string | null; name: string }
  | { id: string; type: 'subsum'; subFactId: string | null; fromFactId: string | null }
  | { id: string; type: 'define'; name: string; expr: HypExpr | null }
  | { id: string; type: 'replace'; targetFactId: string | null; expr: HypExpr | null }
  | { id: string; type: 'addsum'; addFactId: string | null; toFactId: string | null }
  | { id: string; type: 'split'; name: string; expr: HypExpr | null; parts: HypExpr[] }
  | { id: string; type: 'argument'; body: Block[] }
  | { id: string; type: 'sorry' }
  | { id: string; type: 'suppose'; name: string; pred: BoolExpr | null; body: Block[] }
  /**
   * Discharge a supposition. `expr` names the hypothesis that establishes its predicate.
   *
   * A cell-form predicate needs none: `(is-star A1)` is either on the board or it is not.
   * A count-form one is only ever *entailed* — `★{A1 C1} >= 1` establishes
   * `★{A1 B1 C1 L1 M1 N1} >= 2` once B1, L1 and N1 are out and M1 is starred — and leaving
   * the engine to find the entailing hypothesis by scanning keeps the reason out of the proof.
   * So it is optional in the slot and required in that case.
   */
  | { id: string; type: 'use'; name: string; expr?: HypExpr | null }
  | { id: string; type: 'claim'; pred: BoolExpr | null; body: Block[] }
  | { id: string; type: 'by_contradiction'; body: Block[]; contradiction: HypExpr | null }
  | { id: string; type: 'constructor'; left: Block[]; right: Block[] }
  | { id: string; type: 'by_cases'; split: 'left' | 'right'; positive: Block[]; negative: Block[] }
  /**
   * Or-elimination: a disjunction you already hold, discharged by proving the enclosing goal
   * from each disjunct in turn. The counterpart to `by_cases`, which proves a disjunctive
   * goal rather than consuming a disjunctive fact.
   */
  | { id: string; type: 'or_elim'; pred: BoolExpr | null; left: Block[]; right: Block[] };

export type BlockType = Block['type'];

export type BlockStatus = 'ok' | 'error' | 'skipped';

export interface BlockResult {
  status: BlockStatus;
  error?: string;
  note?: string;
  /** Proof state entering this block (used for e.g. fact dropdown options). */
  prev: PState;
  /** Proof state after this block (== prev when the block errored). */
  state: PState;
  /** Contextual state used by value inputs that appear after a nested body. */
  scope?: PState;
  /**
   * What the enclosing claim is trying to prove where this block sits, and every assumption in
   * force over it, outermost first.
   *
   * These are not the same as the proof obligation the engine threads. Inside a
   * `by-contradiction` the obligation is a contradiction, not the claim's goal -- but the goal
   * is still what the reader needs to see, alongside the negation that was assumed to get
   * there. A step three branches deep is unreadable without them.
   */
  goal?: BoolExpr | null;
  assumed?: BoolExpr[];
}
