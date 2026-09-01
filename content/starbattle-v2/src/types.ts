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

export interface PState {
  cells: CellK[];
  facts: Fact[];
  /** Proven Boolean propositions that do not normalize to linear count facts. */
  propositions: BoolExpr[];
  contradiction: boolean;
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
  | { id: string; type: 'argument'; body: Block[] }
  | { id: string; type: 'claim'; pred: BoolExpr | null; body: Block[] }
  | { id: string; type: 'by_contradiction'; body: Block[]; contradiction: HypExpr | null }
  | { id: string; type: 'constructor'; left: Block[]; right: Block[] }
  | { id: string; type: 'by_cases'; split: 'left' | 'right'; positive: Block[]; negative: Block[] };

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
}
