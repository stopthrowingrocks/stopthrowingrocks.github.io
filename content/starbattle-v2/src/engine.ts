import type { Block, BlockResult, BlockStatus, BoolExpr, CellK, CmpExpr, CmpOp, Fact, FactOp, HypExpr, NumExpr, PState, Puzzle, Supposition } from './types';
import { factName, lineId, lineIndices, lineMembers, neighbors, posLabel } from './puzzles';

/** Fresh state with every row/column/region count fact pre-expanded. */
export function initState(puzzle: Puzzle): PState {
  const facts: Fact[] = [];
  for (const kind of ['row', 'col', 'region'] as const) {
    for (const i of lineIndices(puzzle, kind)) {
      facts.push({
        id: lineId(kind, i),
        kind,
        index: i,
        op: '=',
        cells: lineMembers(puzzle, kind, i),
        target: puzzle.stars,
        impossible: false,
      });
    }
  }
  const s: PState = {
    cells: new Array<null>(puzzle.size * puzzle.size).fill(null),
    facts,
    propositions: [],
    suppositions: [],
    contradiction: false,
    admitted: false,
  };
  /*
   * Clues go on the starting board, beside the counts rather than after them. A given star is
   * as much part of the puzzle as "three to a row", so nothing in the proof should have to
   * justify it — and placing it here means its adjacency fans out and the counts fold by the
   * time the first statement runs, exactly as they would for a star the proof had derived.
   */
  for (const given of puzzle.givens ?? []) {
    if (given.kind === 'star') setStar(s, given.cell, puzzle.size);
    else setElim(s, given.cell);
  }
  if (puzzle.givens?.length) normalize(s);
  return s;
}

/** Deep enough that nothing a supposition records is shared with the state it came from. */
function cloneSupposition(sup: Supposition): Supposition {
  return {
    ...sup,
    cells: [...sup.cells],
    facts: sup.facts.map(f => ({ ...f, cells: [...f.cells] })),
    suppositions: sup.suppositions.map(cloneSupposition),
  };
}

function cloneState(s: PState): PState {
  return {
    cells: [...s.cells],
    facts: s.facts.map(f => ({ ...f, cells: [...f.cells] })),
    propositions: [...s.propositions],
    suppositions: s.suppositions.map(cloneSupposition),
    contradiction: s.contradiction,
    admitted: s.admitted,
  };
}

/** Place a star; adjacency (the `adj` constraint) eliminates every neighbour. */
function setStar(s: PState, idx: number, N: number): void {
  const cur = s.cells[idx];
  if (cur === 'star' || cur === 'contradiction') return;
  // Required to be both: the cell itself records that, rather than one mark quietly winning.
  if (cur === 'elim') { s.cells[idx] = 'contradiction'; s.contradiction = true; return; }
  s.cells[idx] = 'star';
  for (const n of neighbors(idx, N)) {
    if (s.cells[n] === 'star') s.contradiction = true;
    else if (s.cells[n] === null) s.cells[n] = 'elim';
  }
}

/**
 * Place stars in every cell of `cells` at once, order-independent. Placing
 * them one at a time via `setStar` is order-dependent: the first star's
 * adjacency fallout can mark a *second* forced cell 'elim' before its own
 * turn comes up, so it silently never becomes a star even though the fact
 * said it must. That under-reports which cells were forced and can hide the
 * real contradiction (two forced cells that touch, which is itself a genuine
 * impossibility — e.g. reached inside a claim/by_contradiction body).
 *
 * Instead: mark every forced cell a star first (regardless of what any other
 * forced cell's adjacency would have done to it), flagging a contradiction if
 * any two of them touch or if one was already known 'elim'; only then fan
 * eliminations out to their *other* neighbours.
 */
function setStars(s: PState, cells: number[], N: number): void {
  const set = new Set(cells);
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      if (neighbors(cells[i], N).includes(cells[j])) s.contradiction = true;
    }
  }
  for (const c of cells) {
    if (s.cells[c] === 'elim') { s.cells[c] = 'contradiction'; s.contradiction = true; }
    else if (s.cells[c] !== 'contradiction') s.cells[c] = 'star';
  }
  for (const c of cells) {
    for (const n of neighbors(c, N)) {
      if (set.has(n)) continue;
      if (s.cells[n] === 'star') s.contradiction = true;
      else if (s.cells[n] === null) s.cells[n] = 'elim';
    }
  }
}

function setElim(s: PState, idx: number): void {
  if (s.cells[idx] === 'contradiction') return;
  if (s.cells[idx] === 'star') { s.cells[idx] = 'contradiction'; s.contradiction = true; return; }
  s.cells[idx] = 'elim';
}

/** Cell lists in a canonical order, so `sameCells` compares content and not sequence. */
const sorted = (cells: number[]): number[] => [...cells].sort((a, b) => a - b);

const sameCells = (a: number[], b: number[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * The automatic `ssimp`: fold every known cell out of every fact, flag facts
 * that have become impossible, and drop facts that are fully resolved or
 * vacuous. A `≠` fact is impossible when its count is pinned to the forbidden
 * value — either all cells resolved, or an `=` fact over the same cells states
 * exactly the forbidden count (the `exact hn h` pattern).
 */
/**
 * Fold what a supposition records against what the board has since learned.
 *
 * A record is a snapshot: "if `pred`, then these cells and these counts". The board outside
 * keeps moving, and knowledge there is unconditional, so narrowing a conditional conclusion by
 * it is sound and leaves the record saying only what is still news. Three things follow.
 *
 * A recorded cell the board now agrees with is dropped — `use` already skips those, so this
 * only stops the record from claiming credit for them. A recorded count is folded exactly as
 * `normalize` folds a live fact, since cells it was stated over have since settled. And a
 * recorded cell the board now *disagrees* with settles the supposition: `pred` implies that
 * cell, the board denies it, so `pred` is false — the same conclusion the body reaching a
 * contradiction would have given, by modus tollens rather than by derivation.
 *
 * Nested records are folded too: they are conditional on this one, which does not exempt them
 * from what the board knows.
 */
function foldSupposition(sup: Supposition, cells: CellK[]): Supposition {
  let contradiction = sup.contradiction;
  const recorded = sup.cells.map((want, i) => {
    if (want === null) return null;
    const known = cells[i];
    if (known === null) return want;
    if (known === want) return null;      // the board has caught up; nothing left to import
    contradiction = true;                 // the board denies it, so `pred` cannot hold
    return want;
  });

  const facts: Fact[] = [];
  for (const f of sup.facts) {
    let target = f.target;
    const open: number[] = [];
    for (const c of f.cells) {
      const known = cells[c];
      if (known === 'star') target--;
      else if (known === null) open.push(c);
    }
    /*
     * Impossibility is settled here too, the same way `normalize` settles it for a live fact,
     * because a recorded count the board has ruled out refutes the supposition exactly as a
     * recorded cell does: `pred` implies the count, the board has settled every cell it
     * covered, and `★{} = 1` cannot hold. Leaving the flag unset recorded a supposition that
     * is already refuted as if it were still open, which is the thing worth seeing.
     */
    let keep = true;
    let impossible = false;
    switch (f.op) {
      case '=':
        impossible = target < 0 || target > open.length;
        keep = impossible || open.length > 0;
        break;
      case '<=':
        impossible = target < 0;
        keep = impossible || (open.length > 0 && target < open.length);
        break;
      case '>=':
        impossible = target > open.length;
        keep = impossible || target > 0;
        break;
      case '!=':
        if (target < 0 || target > open.length) keep = false;   // unreachable, so satisfied
        else if (open.length === 0) impossible = true;          // landed on the forbidden value
        break;
    }
    if (!keep) continue;
    if (impossible) contradiction = true;
    facts.push({ ...f, cells: open, target, impossible });
  }

  return {
    ...sup,
    cells: recorded,
    facts,
    contradiction,
    suppositions: sup.suppositions.map(inner => foldSupposition(inner, cells)),
  };
}

function normalize(s: PState): void {
  const kept: Fact[] = [];
  for (const f of s.facts) {
    let target = f.target;
    const cells: number[] = [];
    for (const c of f.cells) {
      const k = s.cells[c];
      if (k === 'star') target--;
      else if (k === null) cells.push(c);
      // `elim` contributes nothing, and `contradiction` drops out the same way: it is settled,
      // so it is not open, and the state carrying it is already flagged — what it would count
      // for cannot matter, since nothing derived from a contradictory state is used.
    }
    let impossible = false;
    let keep = true;
    switch (f.op) {
      case '=':
        impossible = target < 0 || target > cells.length;
        keep = impossible || cells.length > 0;
        break;
      case '<=':
        impossible = target < 0;
        keep = impossible || (cells.length > 0 && target < cells.length);
        break;
      case '>=':
        impossible = target > cells.length;
        keep = impossible || target > 0;
        break;
      case '!=':
        if (target < 0 || target > cells.length) keep = false; // value unreachable — satisfied
        else if (cells.length === 0) impossible = true;        // count landed on the forbidden value
        break;
    }
    if (!keep) continue;
    if (impossible) s.contradiction = true;
    kept.push({ ...f, cells, target, impossible });
  }
  // Cross-fact: an `=` fact asserting exactly what a `≠` fact forbids.
  for (const ne of kept) {
    if (ne.op !== '!=' || ne.impossible) continue;
    const clash = kept.find(eq =>
      eq.op === '=' && !eq.impossible && eq.target === ne.target && sameCells(eq.cells, ne.cells));
    if (clash) {
      ne.impossible = true;
      s.contradiction = true;
    }
  }
  s.facts = kept;
  // The records in scope are folded against the same board, so what they offer stays current.
  if (s.suppositions.length) {
    s.suppositions = s.suppositions.map(sup => foldSupposition(sup, s.cells));
  }
}

/**
 * What this hypothesis settles on its own, if anything: 'stars' when every cell it covers has
 * to hold one, 'elims' when none of them can. The one place that decides it, so what the
 * hypothesis list paints as one step from progress is exactly what that step will accept.
 *
 * A ≠ fact only ever settles its cell when it covers one: forbidding 0 there forces a star and
 * forbidding 1 forces an elimination. An impossible fact settles nothing — the branch holding
 * it is already closed.
 */
export function forcedAction(f: Fact): 'stars' | 'elims' | null {
  if (f.impossible) return null;
  if (f.op === '!=') {
    if (f.cells.length !== 1) return null;
    return f.target === 0 ? 'stars' : f.target === 1 ? 'elims' : null;
  }
  if (f.op !== '<=' && f.target > 0 && f.cells.length === f.target) return 'stars';
  if (f.op !== '>=' && f.target === 0 && f.cells.length > 0) return 'elims';
  return null;
}

/** Why `stars` turned this hypothesis down. Explains `forcedAction`'s verdict, never decides it. */
function starsError(f: Fact): string {
  if (f.op === '<=') return 'an upper bound cannot force stars';
  if (f.op === '!=') return 'a ≠ fact only forces a star when it covers one cell and forbids 0';
  if (f.target === 0) return 'no stars remain in this line — use "cross out" instead';
  return `not forced: ${f.target} star${f.target === 1 ? '' : 's'} among ${f.cells.length} cells`;
}

/** Why `cross out` turned this hypothesis down. */
function elimsError(f: Fact): string {
  if (f.op === '>=') return 'a lower bound cannot force eliminations';
  if (f.op === '!=') return 'a ≠ fact only forces an elimination when it covers one cell and forbids 1';
  if (f.cells.length === 0) return 'nothing left to cross out';
  return `not forced: ${f.target} star${f.target === 1 ? '' : 's'} still needed among these cells`;
}

function applyStars(s: PState, puzzle: Puzzle, factId: string | null): { error?: string; note?: string } {
  if (!factId) return { error: 'choose a fact' };
  const f = s.facts.find(x => x.id === factId);
  if (!f) return { error: 'that fact is not available here' };
  if (forcedAction(f) !== 'stars') return { error: starsError(f) };
  const placed = [...f.cells];
  s.facts = s.facts.filter(x => x.id !== factId);
  setStars(s, placed, puzzle.size);
  normalize(s);
  return { note: `★ ${placed.map(c => posLabel(c, puzzle.size)).join(' ')}` };
}

function applyElims(s: PState, puzzle: Puzzle, factId: string | null): { error?: string; note?: string } {
  if (!factId) return { error: 'choose a fact' };
  const f = s.facts.find(x => x.id === factId);
  if (!f) return { error: 'that fact is not available here' };
  if (forcedAction(f) !== 'elims') return { error: elimsError(f) };
  const crossed = [...f.cells];
  s.facts = s.facts.filter(x => x.id !== factId);
  for (const c of crossed) setElim(s, c);
  normalize(s);
  return { note: `✕ ${crossed.map(c => posLabel(c, puzzle.size)).join(' ')}` };
}

function applyClear(s: PState, factId: string | null): { error?: string; note?: string } {
  if (!factId) return { error: 'choose a hypothesis' };
  const fact = s.facts.find(item => item.id === factId);
  if (!fact) return { error: 'that hypothesis is not available here' };
  s.facts = s.facts.filter(item => item.id !== factId);
  return { note: `deleted ${factName(fact)}` };
}

function applyRename(s: PState, factId: string | null, rawName: string): { error?: string; note?: string } {
  if (!factId) return { error: 'choose a hypothesis' };
  const fact = s.facts.find(item => item.id === factId);
  if (!fact) return { error: 'that hypothesis is not available here' };
  const name = rawName.trim();
  if (!name) return { error: 'enter a hypothesis name' };
  fact.label = name;
  return { note: `renamed hypothesis to ${name}` };
}

const hasUpper = (op: Fact['op']): boolean => op === '=' || op === '<=';
const hasLower = (op: Fact['op']): boolean => op === '=' || op === '>=';
export const opSymbol = (op: Fact['op']): string =>
  op === '=' ? '=' : op === '<=' ? '≤' : op === '>=' ? '≥' : '≠';

/**
 * `subsum sub at from`: when every cell of `sub` lies inside `from`, the counts
 * subtract over the difference cells. Subtraction flips the direction of `sub`'s
 * bound: the result has an upper bound iff `from` bounds above and `sub` bounds
 * below, and vice versa — two same-direction inequalities combine into nothing.
 * The original `from` fact is replaced (as in Lean's `replace h`); `sub` stays.
 */
function applySubsum(
  s: PState,
  puzzle: Puzzle,
  subFactId: string | null,
  fromFactId: string | null,
  replaceFactId: string | null,
  resultId?: string,
  resultLabel?: string,
): { error?: string; note?: string } {
  if (!subFactId || !fromFactId) return { error: 'choose both facts' };
  if (subFactId === fromFactId) return { error: 'choose two different facts' };
  const sub = s.facts.find(x => x.id === subFactId);
  const from = s.facts.find(x => x.id === fromFactId);
  if (!sub || !from) return { error: 'that fact is not available here' };
  const fromSet = new Set(from.cells);
  const outside = sub.cells.filter(c => !fromSet.has(c));
  if (outside.length > 0) {
    return {
      error: `not contained: ${outside.map(c => posLabel(c, puzzle.size)).join(' ')} ` +
        `${outside.length === 1 ? 'is' : 'are'} not in ${factName(from)}`,
    };
  }
  const upper = hasUpper(from.op) && hasLower(sub.op);
  const lower = hasLower(from.op) && hasUpper(sub.op);
  if (!upper && !lower) {
    return { error: 'these bounds point in incompatible directions — subtracting gives no information' };
  }
  const op: Fact['op'] = upper && lower ? '=' : upper ? '<=' : '>=';
  const id = resultId ?? fromFactId;
  if (s.facts.some(f => f.id === id && f.id !== replaceFactId)) return { error: 'that hypothesis is already defined' };
  const subSet = new Set(sub.cells);
  const cells = from.cells.filter(c => !subSet.has(c));
  const target = from.target - sub.target;
  const label = resultLabel ?? factName(from);
  if (replaceFactId) s.facts = s.facts.filter(x => x.id !== replaceFactId);
  s.facts.push({
    id,
    kind: 'derived', index: 0, label,
    op, cells, target, impossible: false,
  });
  normalize(s);
  return {
    note: `${label}: ★{${cells.map(c => posLabel(c, puzzle.size)).join(' ')}} ${opSymbol(op)} ${target}`,
  };
}

/**
 * `b += a` (the congrArg₂ (+) pattern): two counts over disjoint cell sets
 * sum to a count over their union. Bounds combine only when they point the same
 * way. The left fact is replaced; the right fact stays available.
 */
function applyAddsum(
  s: PState,
  puzzle: Puzzle,
  addFactId: string | null,
  toFactId: string | null,
  replaceFactId: string | null,
  resultId?: string,
  resultLabel?: string,
): { error?: string; note?: string } {
  if (!addFactId || !toFactId) return { error: 'choose both facts' };
  if (addFactId === toFactId) return { error: 'choose two different facts' };
  const a = s.facts.find(x => x.id === addFactId);
  const b = s.facts.find(x => x.id === toFactId);
  if (!a || !b) return { error: 'that fact is not available here' };
  const bSet = new Set(b.cells);
  const overlap = a.cells.filter(c => bSet.has(c));
  if (overlap.length > 0) {
    return {
      error: `not disjoint: ${overlap.map(c => posLabel(c, puzzle.size)).join(' ')} ` +
        `${overlap.length === 1 ? 'is' : 'are'} in both facts`,
    };
  }
  const upper = hasUpper(a.op) && hasUpper(b.op);
  const lower = hasLower(a.op) && hasLower(b.op);
  if (!upper && !lower) {
    return { error: 'these bounds point in incompatible directions — adding gives no information' };
  }
  const op: Fact['op'] = upper && lower ? '=' : upper ? '<=' : '>=';
  const id = resultId ?? toFactId;
  if (s.facts.some(fact => fact.id === id && fact.id !== replaceFactId)) return { error: 'that hypothesis is already defined' };
  const cells = [...a.cells, ...b.cells].sort((x, y) => x - y);
  const target = a.target + b.target;
  const label = resultLabel ?? factName(b);
  if (replaceFactId) s.facts = s.facts.filter(fact => fact.id !== replaceFactId);
  s.facts.push({ id, kind: 'derived', index: 0, label, op, cells, target, impossible: false });
  normalize(s);
  return {
    note: `${label}: ★{${cells.map(c => posLabel(c, puzzle.size)).join(' ')}} ${opSymbol(op)} ${target}`,
  };
}

/**
 * Combine two hypotheses about the same cells:
 *  - `A ≤ k` and `A ≥ k` combine into `A = k`;
 *  - `A ≤ k` and `A ≠ k` tighten into `A ≤ k−1` (symmetrically, `A ≥ k` and
 *    `A ≠ k` tighten into `A ≥ k+1`) — the excluded value shaves one off the
 *    open end of the bound;
 *  - incompatible equalities/bounds are exposed as a contradiction instead.
 */
function applyCombine(
  s: PState,
  puzzle: Puzzle,
  leftFactId: string | null,
  rightFactId: string | null,
  resultId: string,
  resultLabel: string,
  replaceFactId: string | null = null,
): { error?: string; note?: string } {
  if (!leftFactId || !rightFactId) return { error: 'choose both hypotheses' };
  if (leftFactId === rightFactId) return { error: 'choose two different hypotheses' };
  const left = s.facts.find(fact => fact.id === leftFactId);
  const right = s.facts.find(fact => fact.id === rightFactId);
  if (!left || !right) return { error: 'that hypothesis is not available here' };
  const contradiction = (note: string) => {
    s.facts = s.facts.filter(fact => fact.id !== leftFactId && fact.id !== rightFactId && fact.id !== replaceFactId);
    s.contradiction = true;
    return { note: `contradiction: ${note}` };
  };
  const impossibleEquality = [left, right].find(fact =>
    fact.op === '=' && (fact.impossible || fact.target < 0 || fact.target > fact.cells.length));
  if (impossibleEquality) {
    return contradiction(`the equality ${factName(impossibleEquality)} is outside the possible range 0 to ${impossibleEquality.cells.length}`);
  }
  if (!sameCells(left.cells, right.cells)) return { error: 'the hypotheses must count the same cells' };
  const equality = left.op === '=' ? left : right.op === '=' ? right : null;
  const other = equality === left ? right : left;
  if (equality) {
    const incompatible =
      (other.op === '=' && equality.target !== other.target) ||
      (other.op === '!=' && equality.target === other.target) ||
      (other.op === '<=' && equality.target > other.target) ||
      (other.op === '>=' && equality.target < other.target);
    if (incompatible) {
      return contradiction(`${factName(equality)} cannot also satisfy ${factName(other)}`);
    }
  }
  if (!equality) {
    const neFact = left.op === '!=' ? left : right.op === '!=' ? right : null;
    const boundFact = neFact === left ? right : left;
    if (neFact && (boundFact.op === '<=' || boundFact.op === '>=') && neFact.target === boundFact.target) {
      const tightOp = boundFact.op;
      const tightTarget = tightOp === '<=' ? boundFact.target - 1 : boundFact.target + 1;
      if (tightTarget < 0 || tightTarget > left.cells.length) {
        return contradiction(`${factName(boundFact)} cannot also satisfy ${factName(neFact)}`);
      }
      if (s.facts.some(fact => fact.op === tightOp && fact.target === tightTarget && sameCells(fact.cells, left.cells))) {
        return { error: 'that bound is already known' };
      }
      s.facts = s.facts.filter(fact => fact.id !== leftFactId && fact.id !== rightFactId && fact.id !== replaceFactId);
      s.facts.push({
        id: resultId,
        kind: 'derived', index: 0, label: resultLabel,
        op: tightOp, cells: [...left.cells], target: tightTarget, impossible: false,
      });
      normalize(s);
      return {
        note: `${resultLabel}: ★{${left.cells.map(cell => posLabel(cell, puzzle.size)).join(' ')}} ${opSymbol(tightOp)} ${tightTarget}`,
      };
    }
  }
  if (!((left.op === '<=' && right.op === '>=') || (left.op === '>=' && right.op === '<='))) {
    return { error: 'combine requires opposing bounds unless its inputs are contradictory' };
  }
  const upper = left.op === '<=' ? left : right;
  const lower = left.op === '>=' ? left : right;
  if (lower.target > upper.target) {
    return contradiction(`the count is at least ${lower.target} and at most ${upper.target}`);
  }
  if (lower.target < upper.target) {
    return { error: `these bounds leave the range ${lower.target} to ${upper.target}` };
  }
  if (s.facts.some(fact => fact.op === '=' && fact.target === left.target && sameCells(fact.cells, left.cells))) {
    return { error: 'that equality is already known' };
  }
  s.facts = s.facts.filter(fact => fact.id !== leftFactId && fact.id !== rightFactId && fact.id !== replaceFactId);
  s.facts.push({
    id: resultId,
    kind: 'derived', index: 0, label: resultLabel,
    op: '=', cells: [...left.cells], target: left.target, impossible: false,
  });
  normalize(s);
  return { note: `${resultLabel}: ★{${left.cells.map(cell => posLabel(cell, puzzle.size)).join(' ')}} = ${left.target}` };
}

/**
 * `adj_le_one`: a king-move clique — every pair of the picked cells touches —
 * can hold at most one star, since two stars in it would be adjacent.
 */
function applyClique(
  s: PState,
  puzzle: Puzzle,
  cells: number[],
  resultId: string,
  resultLabel: string,
  replaceFactId: string | null = null,
): { error?: string; note?: string } {
  const N = puzzle.size;
  if (cells.length < 1) return { error: 'pick at least one cell on the board' };
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      if (!neighbors(cells[i], N).includes(cells[j])) {
        return { error: `${posLabel(cells[i], N)} and ${posLabel(cells[j], N)} do not touch` };
      }
    }
  }
  const sorted = [...cells].sort((a, b) => a - b);
  if (s.facts.some(f => f.id === resultId && f.id !== replaceFactId)) return { error: 'that hypothesis is already defined' };
  const labels = sorted.map(c => posLabel(c, N)).join(' ');
  if (replaceFactId) s.facts = s.facts.filter(fact => fact.id !== replaceFactId);
  // Fold the resolved cells out of this one fact rather than running the
  // pool-wide `normalize`: over a single cell `≤ 1` says nothing the rules do
  // not already, and the pool-wide pass discards it before a `split` can use it
  // as a part. A later pass retires it once it has served its purpose.
  let target = 1;
  const remaining: number[] = [];
  for (const cell of sorted) {
    const known = s.cells[cell];
    if (known === 'star') target--;
    else if (known === null) remaining.push(cell);
  }
  const impossible = target < 0;
  if (impossible) s.contradiction = true;
  s.facts.push({
    id: resultId, kind: 'derived', index: 0, label: resultLabel,
    op: '<=', cells: remaining, target, impossible,
  });
  return { note: `at most one ★ among ${labels}` };
}

/**
 * `split h as n into p₁ … pₙ`: the parts must be disjoint, cover h's cells exactly, and
 * their upper bounds must total h's count. Then no part can fall short of its bound —
 * the total would not reach h's count — so every part holds exactly its bound. Results
 * are added as `<prefix>-1`, `<prefix>-2`, …; nothing that went in is consumed.
 */
function applySplit(
  s: PState,
  puzzle: Puzzle,
  blockId: string,
  rawName: string,
  expr: HypExpr | null,
  parts: HypExpr[],
): { error?: string; note?: string } {
  if (!expr) return { error: 'choose a hypothesis to split' };
  const temporary = `split:${blockId}:`;
  const dropTemporaries = () => { s.facts = s.facts.filter(fact => !fact.id.startsWith(temporary)); };
  const fail = (error: string) => { dropTemporaries(); return { error }; };

  const source = applyHypExpression(s, puzzle, expr, `${temporary}source`, 'split source');
  if (source.error) return fail(source.error);
  const name = rawName.trim();
  if (!name && expr.kind !== 'ref') return fail('give this split a name with "as"');
  if (parts.length < 2) return fail('add at least two parts');

  // Copy each fact as it is evaluated. Later parts normalize the pool, which retires
  // any part that was trivially true, and a `combine` part consumes what it merges.
  const copy = (id: string | undefined): Fact | undefined => {
    const found = id ? s.facts.find(fact => fact.id === id) : undefined;
    return found && { ...found, cells: [...found.cells] };
  };
  const whole = copy(source.factId);
  if (!whole) return fail('that hypothesis is not available here');
  const pieces: Fact[] = [];
  for (const [index, part] of parts.entries()) {
    const result = applyHypExpression(s, puzzle, part, `${temporary}${index}`, `part ${index + 1}`);
    if (result.error) return fail(result.error);
    const piece = copy(result.factId);
    if (!piece) return fail('that hypothesis is not available here');
    pieces.push(piece);
  }

  if (whole.op !== '=' && whole.op !== '>=') return fail('split needs an exact count or a lower bound');
  if (pieces.some(piece => piece.op !== '=' && piece.op !== '<=')) {
    return fail('each part needs an exact count or an upper bound');
  }

  const covered = new Set<number>();
  for (const piece of pieces) {
    for (const cell of piece.cells) {
      if (covered.has(cell)) return fail(`${posLabel(cell, puzzle.size)} is in more than one part`);
      covered.add(cell);
    }
  }
  const sourceName = factName(whole);
  const listed = (cells: number[]) => cells.map(cell => posLabel(cell, puzzle.size)).join(' ');
  const missing = whole.cells.filter(cell => !covered.has(cell));
  if (missing.length > 0) {
    return fail(`the parts do not cover ${sourceName}: ${listed(missing)} ${missing.length === 1 ? 'is' : 'are'} missing`);
  }
  const wholeCells = new Set(whole.cells);
  const outside = [...covered].filter(cell => !wholeCells.has(cell)).sort((a, b) => a - b);
  if (outside.length > 0) {
    return fail(`the parts do not cover ${sourceName}: ${listed(outside)} ${outside.length === 1 ? 'is' : 'are'} not in it`);
  }
  const total = pieces.reduce((sum, piece) => sum + piece.target, 0);
  if (total !== whole.target) return fail(`the parts total ${total} but ${sourceName} needs ${whole.target}`);

  const prefix = name || whole.id;
  const labelPrefix = name || sourceName;
  const results = pieces.map((piece, index) => ({
    id: `${prefix}-${index + 1}`,
    label: `${labelPrefix}-${index + 1}`,
    cells: [...piece.cells],
    target: piece.target,
  }));
  for (const result of results) {
    if (s.facts.some(fact => fact.id === result.id)) return fail(`${result.id} is already defined`);
  }
  dropTemporaries();
  /*
   * A part that says exactly what a hypothesis already says gets no second name.
   *
   * The split's conclusion is that each part is exactly tight. Where a part was written as a
   * `<=` bound that is news, and the result is pushed. Where it was a bare reference to a
   * fact that is already `=` over the same cells with the same target, the conclusion is
   * something the state holds already, and pushing it puts one assertion in the pool twice
   * under two names.
   *
   * This was tried once before and reverted, because it silently broke proofs that split on a
   * known hypothesis and then referred to the part by position. The breakage is accepted now
   * and such proofs are rewritten to name the hypothesis they already had -- but note what the
   * cost actually is: the position name never comes into being, so `(elims sp-1)` has to become
   * `(elims region5)`. Keeping both would mean an alias from the position name to the existing
   * fact, resolved wherever a reference is looked up.
   */
  const already = (result: { cells: number[]; target: number }) => s.facts.find(fact =>
    fact.op === '=' && !fact.impossible && fact.target === result.target
    && sameCells(sorted(fact.cells), sorted(result.cells)));

  const notes: string[] = [];
  for (const result of results) {
    const held = already(result);
    if (held) {
      notes.push(`${result.label} is ${factName(held)}, already known`);
      continue;
    }
    s.facts.push({
      id: result.id, kind: 'derived', index: 0, label: result.label,
      op: '=', cells: result.cells, target: result.target, impossible: false,
    });
    notes.push(`${result.label}: ★{${listed(result.cells)}} = ${result.target}`);
  }
  normalize(s);
  return { note: notes.join('; ') };
}

function applyHypExpression(
  s: PState,
  puzzle: Puzzle,
  expr: HypExpr | null,
  resultId: string,
  resultLabel: string,
  replaceFactId: string | null = null,
  materializeReference = false,
): { factId?: string; error?: string; note?: string } {
  if (!expr) return { error: 'choose a hypothesis expression' };
  const temporaryIds = new Set<string>();

  function evaluateNode(node: HypExpr | null, id: string, label: string, replaceId: string | null): { factId?: string; error?: string; note?: string } {
    if (!node) return { error: 'the hypothesis expression has an empty input' };
    if (node.kind === 'ref') {
      if (!node.factId) return { error: 'choose a hypothesis' };
      const source = s.facts.find(fact => fact.id === node.factId);
      if (!source) return { error: 'that hypothesis is not available here' };
      if (!materializeReference || id !== resultId) return { factId: node.factId };
      if (s.facts.some(fact => fact.id === resultId && fact.id !== replaceId)) {
        return { error: 'that hypothesis is already defined' };
      }
      if (replaceId) s.facts = s.facts.filter(fact => fact.id !== replaceId);
      s.facts.push({
        ...source,
        id,
        kind: 'derived',
        index: 0,
        label,
        cells: [...source.cells],
      });
      return {
        factId: id,
        note: `${label}: ★{${source.cells.map(cell => posLabel(cell, puzzle.size)).join(' ')}} ${opSymbol(source.op)} ${source.target}`,
      };
    }
    if (id !== resultId) temporaryIds.add(id);
    if (node.kind === 'clique') {
      const result = applyClique(s, puzzle, node.cells, id, label, replaceId);
      return result.error ? result : { ...result, factId: id };
    }
    if (node.kind === 'bound') {
      if (node.cells.length === 0) return { error: 'pick at least one cell on the board' };
      if (node.op === '<=' && node.target < node.cells.length) {
        return { error: `at most ${node.target} is not automatic for ${node.cells.length} cells` };
      }
      if (replaceId) s.facts = s.facts.filter(fact => fact.id !== replaceId);
      s.facts.push({
        id, kind: 'derived', index: 0, label,
        op: node.op, cells: [...node.cells], target: node.target, impossible: false,
      });
      return { factId: id, note: `${label}: ★{${node.cells.map(cell => posLabel(cell, puzzle.size)).join(' ')}} ${opSymbol(node.op)} ${node.target}` };
    }

    const left = evaluateNode(node.left, `expr:${node.eid}:left`, 'temporary hypothesis', null);
    if (left.error) return left;
    const right = evaluateNode(node.right, `expr:${node.eid}:right`, 'temporary hypothesis', null);
    if (right.error) return right;
    let result: { error?: string; note?: string };
    if (node.kind === 'sub') result = applySubsum(s, puzzle, right.factId ?? null, left.factId ?? null, replaceId, id, label);
    else if (node.kind === 'add') result = applyAddsum(s, puzzle, right.factId ?? null, left.factId ?? null, replaceId, id, label);
    else result = applyCombine(s, puzzle, left.factId ?? null, right.factId ?? null, id, label, replaceId);
    return result.error ? result : { ...result, factId: id };
  }

  const result = evaluateNode(expr, resultId, resultLabel, replaceFactId);
  if (result.error) return result;
  s.facts = s.facts.filter(fact => !temporaryIds.has(fact.id));
  return { factId: result.factId, note: result.note };
}

export function hypothesisForm(
  state: PState,
  puzzle: Puzzle,
  expr: HypExpr,
): { fact: Fact } | { error: string } {
  const scratch = cloneState(state);
  const result = applyHypExpression(scratch, puzzle, expr, 'selected-expression', 'selected hypothesis');
  if (result.error) return { error: result.error };
  if (scratch.contradiction) return { error: 'these hypotheses produce a contradiction' };
  const fact = result.factId ? scratch.facts.find(item => item.id === result.factId) : undefined;
  return fact ? { fact } : { error: 'this hypothesis is already resolved' };
}

/**
 * The nested containers of a block, as [containerId, blockList] pairs.
 * Container ids are the block id (single body) or `${id}:<arm>` (multi-arm),
 * matching what the workspace uses for gaps and insertion.
 */
export function childContainers(b: Block): [string, Block[]][] {
  if (b.type === 'argument') return [[b.id, b.body]];
  if (b.type === 'claim' || b.type === 'by_contradiction' || b.type === 'suppose') return [[b.id, b.body]];
  if (b.type === 'constructor') return [[`${b.id}:left`, b.left], [`${b.id}:right`, b.right]];
  if (b.type === 'by_cases') return [[`${b.id}:positive`, b.positive], [`${b.id}:negative`, b.negative]];
  if (b.type === 'or_elim') return [[`${b.id}:left`, b.left], [`${b.id}:right`, b.right]];
  return [];
}

/** Accumulate a NumExpr into per-cell coefficients plus a constant. */
function lowerNum(
  e: NumExpr | null,
  sign: 1 | -1,
  acc: { coefs: Map<number, number>; c: number },
): string | null {
  if (!e) return 'the claim has an empty slot';
  switch (e.kind) {
    case 'count':
      for (const cell of e.cells) acc.coefs.set(cell, (acc.coefs.get(cell) ?? 0) + sign);
      return null;
    case 'lit':
      acc.c += sign * e.value;
      return null;
    case 'add':
      return lowerNum(e.a, sign, acc) ?? lowerNum(e.b, sign, acc);
    case 'sub':
      return lowerNum(e.a, sign, acc) ?? lowerNum(e.b, sign === 1 ? -1 : 1, acc);
  }
}

/**
 * Lower a hexagon to linear `★{cells} op k` form (everything moved to the left
 * side). Valid iff, after cancellation, every involved cell has coefficient
 * exactly +1 — i.e. all star counts effectively sit on one side, disjointly.
 */
export function lowerPred(p: CmpExpr): { cells: number[]; op: FactOp; k: number } | { error: string } {
  const acc = { coefs: new Map<number, number>(), c: 0 };
  const err = lowerNum(p.a, 1, acc) ?? lowerNum(p.b, -1, acc);
  if (err) return { error: err };
  const nonzero = [...acc.coefs].filter(([, coef]) => coef !== 0);
  const reverse = nonzero.length > 0 && nonzero.every(([, coef]) => coef === -1);
  if (reverse) {
    acc.c = -acc.c;
    for (const [cell, coef] of nonzero) acc.coefs.set(cell, -coef);
  }
  const cells: number[] = [];
  for (const [cell, coef] of acc.coefs) {
    if (coef === 0) continue;
    if (coef === 1) cells.push(cell);
    else if (coef > 1) return { error: 'a cell is counted more than once' };
    else return { error: 'move all ★ counts to one side of the comparison' };
  }
  if (cells.length === 0) return { error: 'the claim involves no cells' };
  cells.sort((a, b) => a - b);
  let op: CmpOp = reverse
    ? p.op === '<=' ? '>=' : p.op === '>=' ? '<=' : p.op === '<' ? '>' : p.op === '>' ? '<' : p.op
    : p.op;
  let k = -acc.c;
  if (op === '<') { op = '<='; k--; }
  else if (op === '>') { op = '>='; k++; }
  return { cells, op, k };
}

/** A comparison lowered to `★{cells} op k`. */
export interface LoweredCmp { cells: number[]; op: FactOp; k: number }

/** The literal a negation leaves behind: comparisons close under it. */
const negateOp = (op: CmpOp): CmpOp =>
  op === '=' ? '!=' : op === '!=' ? '=' : op === '<=' ? '>' : op === '>=' ? '<' : op === '<' ? '>=' : '<=';

const cmpSymbol = (op: CmpOp): string => (op === '<' || op === '>' ? op : opSymbol(op));

const MARK = { star: '★', elim: '✕' } as const;

/**
 * The mark a comparison pins a lone cell to, or null if it leaves it open.
 *
 * One cell holds nought or one star, so most comparisons against 0 or 1 decide it outright —
 * which is what lets `★{A4} ≥ 1` be written as the `A4=★` it means. `lowerPred` has already
 * turned `<` and `>` into `≤` and `≥` by this point.
 */
function pinnedMark(cells: number[], op: FactOp, k: number): 'star' | 'elim' | null {
  if (cells.length !== 1) return null;
  if (op === '=') return k === 0 ? 'elim' : k === 1 ? 'star' : null;
  if (op === '!=') return k === 0 ? 'star' : k === 1 ? 'elim' : null;
  if (op === '<=') return k === 0 ? 'elim' : null;
  return k === 1 ? 'star' : null;
}

/** Whether this prints as an infix connective, so it needs brackets inside another. */
function isConnective(e: BoolExpr | null): boolean {
  if (!e) return false;
  if (e.kind === 'not') return isConnective(e.a);
  return e.kind === 'and' || e.kind === 'or';
}

const numText = (e: NumExpr | null, puzzle: Puzzle): string => {
  if (!e) return '_';
  if (e.kind === 'lit') return String(e.value);
  if (e.kind === 'count') return `★{${e.cells.map(c => posLabel(c, puzzle.size)).join(' ')}}`;
  return `(${numText(e.a, puzzle)} ${e.kind === 'add' ? '+' : '−'} ${numText(e.b, puzzle)})`;
};

/**
 * A goal or assumption in the same notation as the hypotheses above it: `★{A1 B1} ≤ 1`,
 * or `A4=★` where it is about one cell.
 *
 * Negation is pushed to the leaves rather than printed, because `¬(¬(★{A1 B1} ≠ 2))` tells a
 * reader nothing that `★{A1 B1} = 2` does not. Comparisons close under negation, a cell's two
 * marks are each other's negation, and `∧`/`∨` swap under De Morgan — so nothing survives
 * that needs a `¬` at all. `neg` carries the pending negation down the tree.
 */
export function predicateText(pred: BoolExpr | null, puzzle: Puzzle, neg = false): string {
  if (!pred) return '_';
  switch (pred.kind) {
    case 'not':
      return predicateText(pred.a, puzzle, !neg);
    case 'is_star':
    case 'is_elim':
      return `${posLabel(pred.cell, puzzle.size)}=${
        (pred.kind === 'is_star') !== neg ? MARK.star : MARK.elim}`;
    case 'and':
    case 'or': {
      const join = (pred.kind === 'and') !== neg ? ' /\\ ' : ' \\/ ';
      return [pred.a, pred.b]
        .map(side => (isConnective(side)
          ? `(${predicateText(side, puzzle, neg)})`
          : predicateText(side, puzzle, neg)))
        .join(join);
    }
    case 'cmp': {
      const op = neg ? negateOp(pred.op) : pred.op;
      const lowered = lowerPred({ ...pred, op });
      // Unlowerable only when the counts do not cancel to one side; say what it compares
      // rather than reporting why, since the panel is not where that gets fixed.
      if ('error' in lowered) {
        return `${numText(pred.a, puzzle)} ${cmpSymbol(op)} ${numText(pred.b, puzzle)}`;
      }
      const mark = pinnedMark(lowered.cells, lowered.op, lowered.k);
      return mark
        ? `${posLabel(lowered.cells[0], puzzle.size)}=${MARK[mark]}`
        : `★{${lowered.cells.map(c => posLabel(c, puzzle.size)).join(' ')}} ${opSymbol(lowered.op)} ${lowered.k}`;
    }
  }
}

/**
 * Disjunctive normal form of a boolean predicate (or of its negation, when
 * `neg`): a list of terms, each term a conjunction of lowered comparisons.
 * Negation pushes to the leaves — comparison literals close under negation
 * (= ↔ ≠, ≤k ↔ ≥k+1) — except ¬(= k), which expands to the two-bound
 * disjunction ≤ k−1 ∨ ≥ k+1 so its arms carry usable inequalities.
 */
function dnf(e: BoolExpr | null, neg: boolean): LoweredCmp[][] | { error: string } {
  if (!e) return { error: 'the claim has an empty hexagon slot' };
  switch (e.kind) {
    case 'is_star':
    case 'is_elim': {
      const positive = e.kind === 'is_star' ? 1 : 0;
      return [[{ cells: [e.cell], op: neg ? '!=' : '=', k: positive }]];
    }
    case 'cmp': {
      const low = lowerPred(e);
      if ('error' in low) return low;
      if (!neg) return [[low]];
      switch (low.op) {
        case '=':  return [[{ ...low, op: '<=', k: low.k - 1 }], [{ ...low, op: '>=', k: low.k + 1 }]];
        case '!=': return [[{ ...low, op: '=' }]];
        case '<=': return [[{ ...low, op: '>=', k: low.k + 1 }]];
        case '>=': return [[{ ...low, op: '<=', k: low.k - 1 }]];
      }
    }
    case 'and':
    case 'or': {
      const A = dnf(e.a, neg);
      if ('error' in A) return A;
      const B = dnf(e.b, neg);
      if ('error' in B) return B;
      const isAnd = (e.kind === 'and') !== neg;
      if (!isAnd) return [...A, ...B];
      const out: LoweredCmp[][] = [];
      for (const ta of A) for (const tb of B) out.push([...ta, ...tb]);
      return out;
    }
    case 'not':
      return dnf(e.a, !neg);
  }
}

/**
 * What a proven claim contributes to the fact pool: its literals, valid only
 * when the predicate is (equivalent to) a single conjunction — a disjunctive
 * conclusion has no fact representation yet.
 */
export function claimConclusion(pred: BoolExpr | null): { lits: LoweredCmp[] } | { error: string } {
  const d = dnf(pred, false);
  if ('error' in d) return d;
  if (d.length === 2 && d.every(term => term.length === 1)) {
    const [a, b] = [d[0][0], d[1][0]];
    if (sameCells(a.cells, b.cells) && ((a.op === '<=' && b.op === '>=' && a.k + 2 === b.k) || (b.op === '<=' && a.op === '>=' && b.k + 2 === a.k))) {
      return { lits: [{ ...a, op: '!=', k: Math.min(a.k, b.k) + 1 }] };
    }
  }
  if (d.length !== 1) {
    return { error: 'the claim is an OR — split it into separate claims (disjunctive facts are not supported yet)' };
  }
  const lits = [...d[0]];
  for (let i = 0; i < lits.length; i++) for (let j = i + 1; j < lits.length; j++) {
    const a = lits[i], b = lits[j];
    if (sameCells(a.cells, b.cells) && a.k === b.k && ((a.op === '<=' && b.op === '>=') || (a.op === '>=' && b.op === '<='))) {
      lits.splice(j, 1); lits[i] = { ...a, op: '=' }; j--;
    }
  }
  return { lits };
}

/**
 * Id of a fact introduced from a lowered comparison (a claim's conclusion, an
 * assumption, a proved goal). Derived from the literal itself, never from the
 * introducing block's id: blocks get fresh ids whenever they are pasted,
 * duplicated or loaded from text, and references must survive that.
 */
const litFactId = (prefix: string, l: LoweredCmp): string => prefix + l.cells.join('_') + l.op + l.k;

/** Canonical key for comparing arbitrary valid Boolean propositions. */
function propositionKey(pred: BoolExpr | null): string | null {
  const terms = dnf(pred, false);
  if ('error' in terms) return null;
  const keys = terms.map(term => term
    .map(lit => `${lit.cells.join(',')}:${lit.op}:${lit.k}`)
    .sort()
    .join('&'));
  return keys.sort().join('|');
}

function addGoalFacts(s: PState, puzzle: Puzzle, pred: BoolExpr | null, prefix: 'asm' | 'prv'): string | null {
  const starCell = pred?.kind === 'is_star'
    ? pred.cell
    : pred?.kind === 'not' && pred.a?.kind === 'is_elim' ? pred.a.cell : undefined;
  if (starCell !== undefined) {
    setStar(s, starCell, puzzle.size);
    normalize(s);
    return null;
  }
  const elimCell = pred?.kind === 'is_elim'
    ? pred.cell
    : pred?.kind === 'not' && pred.a?.kind === 'is_star' ? pred.a.cell : undefined;
  if (elimCell !== undefined) {
    setElim(s, elimCell);
    normalize(s);
    return null;
  }
  const c = claimConclusion(pred);
  if ('error' in c) {
    const key = propositionKey(pred);
    if (key === null) return c.error;
    if (!s.propositions.some(prop => propositionKey(prop) === key) && pred) s.propositions.push(pred);
    return null;
  }
  for (const l of c.lits) {
    const id = litFactId(prefix, l);
    // Re-assuming a literal that is already in scope restates the same fact.
    s.facts = s.facts.filter(fact => fact.id !== id);
    s.facts.push({ id, kind: 'derived', index: 0, label: 'assumption', op: l.op, cells: [...l.cells], target: l.k, impossible: false });
  }
  normalize(s);
  return null;
}

function goalSatisfied(s: PState, pred: BoolExpr | null): boolean {
  return goalSatisfiedFrom(s, pred, s.facts);
}

/**
 * As `goalSatisfied`, but the count part may only draw on `facts`.
 *
 * `use` passes the single hypothesis the proof named, so discharging a count-form
 * supposition is justified by that hypothesis rather than by whatever the pool happened
 * to contain.
 */
function goalSatisfiedFrom(s: PState, pred: BoolExpr | null, facts: Fact[]): boolean {
  if (s.contradiction || s.admitted) return true;
  if (pred?.kind === 'is_star') return s.cells[pred.cell] === 'star';
  if (pred?.kind === 'is_elim') return s.cells[pred.cell] === 'elim';
  if (pred?.kind === 'not' && pred.a?.kind === 'is_star') return s.cells[pred.a.cell] === 'elim';
  if (pred?.kind === 'not' && pred.a?.kind === 'is_elim') return s.cells[pred.a.cell] === 'star';
  /*
   * A star count over cells that are all settled is simply known, so read it off the board.
   *
   * Matching a fact is not enough on its own. `normalize` deletes a cell from every fact as
   * soon as it settles, so a count whose cells have been resolved has no fact left naming it,
   * even though its value is now certain. That made a conclusion unstatable in exactly the arm
   * that proved it hardest: `count{K14,L14} = 1` holds once K14 is a star and L14 is out, but
   * no fact spans both cells any more, so the arm could not meet a goal the board had settled.
   * Two arms of a case split must state their shared conclusion the same way, and without this
   * the form of a fact depends on which arm's history produced it.
   */
  /*
   * ...and the open remainder is matched against the hypotheses by containment, not equality.
   * A lower bound over part of a set is a lower bound over the whole of it, and an upper bound
   * over a set bounds any part of it. Demanding the very same cells made a conclusion
   * unprovable as soon as the board moved underneath it: holding `★{A1 C1} >= 1` with B1 and
   * L1 crossed out and M1 starred does not look like `★{A1 B1 C1 L1 M1 N1} >= 2` to a
   * cell-for-cell comparison, though it entails it.
   */
  const givesLower = (op: FactOp) => op === '>=' || op === '=';
  const givesUpper = (op: FactOp) => op === '<=' || op === '=';
  const within = (inner: number[], outer: number[]) => inner.every(cell => outer.includes(cell));
  const sorted = (cells: number[]) => [...cells].sort((a, b) => a - b);
  /** `★{open} >= need`, from a lower bound over any subset of `open`. */
  const lowerHolds = (open: number[], need: number): boolean =>
    need <= 0 || facts.some(f =>
      !f.impossible && givesLower(f.op) && f.target >= need && within(f.cells, open));
  /** `★{open} <= need`, from an upper bound over any superset of `open`. */
  const upperHolds = (open: number[], need: number): boolean =>
    need >= open.length || facts.some(f =>
      !f.impossible && givesUpper(f.op) && f.target <= need && within(open, f.cells));

  const forced = (cells: number[], op: FactOp, k: number): boolean => {
    let need = k;
    const open: number[] = [];
    for (const cell of cells) {
      if (s.cells[cell] === 'star') need--;          // a star pays one off the target
      else if (s.cells[cell] === null) open.push(cell);
      // an eliminated cell contributes nothing and drops out
    }
    if (op === '>=') return lowerHolds(open, need);
    if (op === '<=') return upperHolds(open, need);
    if (op === '=') return lowerHolds(open, need) && upperHolds(open, need);
    // `≠` holds once a bound rules the forbidden value out, or a `≠` hypothesis says so.
    return lowerHolds(open, need + 1) || upperHolds(open, need - 1)
      || facts.some(f => f.op === '!=' && !f.impossible && f.target === need
        && sameCells(sorted(f.cells), sorted(open)));
  };
  const key = propositionKey(pred);
  if (key !== null && s.propositions.some(prop => propositionKey(prop) === key)) return true;
  const c = claimConclusion(pred);
  return !('error' in c) && c.lits.every(l => forced(l.cells, l.op, l.k));
}

function sequenceErrored(blocks: Block[], results: Map<string, BlockResult>): boolean {
  return blocks.some(block =>
    results.get(block.id)?.status === 'error' ||
    childContainers(block).some(([, children]) => sequenceErrored(children, results)));
}

function markSkipped(
  blocks: Block[],
  results: Map<string, BlockResult>,
  entries: Map<string, PState>,
  st: PState,
  note?: string,
): void {
  for (const b of blocks) {
    results.set(b.id, { status: 'skipped', prev: st, state: st, note });
    for (const [key, list] of childContainers(b)) {
      entries.set(key, st);
      markSkipped(list, results, entries, st, note);
    }
  }
}

/** Mark every nested container of `b` skipped at state `st` (used on error paths). */
function skipChildren(
  b: Block,
  results: Map<string, BlockResult>,
  entries: Map<string, PState>,
  st: PState,
  note?: string,
): void {
  for (const [key, list] of childContainers(b)) {
    entries.set(key, st);
    markSkipped(list, results, entries, st, note);
  }
}

/**
 * What is being proved where a block sits, and under what assumptions -- carried alongside the
 * proof obligation rather than inside it, because the two come apart: a `by-contradiction`
 * body owes a contradiction while the claim around it still owes its goal.
 */
export interface GoalContext { proving: BoolExpr | null; assumed: BoolExpr[] }
const NO_CONTEXT: GoalContext = { proving: null, assumed: [] };
/**
 * `not (is-elim X)` reads better as `is-star X`. A cell is one or the other, so they say the
 * same thing -- but only the context is rewritten; the assumption the engine actually applies
 * is left as the rule built it.
 */
const plainly = (pred: BoolExpr | null): BoolExpr | null => {
  if (pred?.kind === 'not' && pred.a?.kind === 'is_elim') {
    return { eid: pred.eid, kind: 'is_star', cell: pred.a.cell };
  }
  if (pred?.kind === 'not' && pred.a?.kind === 'is_star') {
    return { eid: pred.eid, kind: 'is_elim', cell: pred.a.cell };
  }
  return pred;
};

/** The same context with one more assumption in force. */
const under = (ctx: GoalContext, pred: BoolExpr | null): GoalContext =>
  pred ? { ...ctx, assumed: [...ctx.assumed, plainly(pred)!] } : ctx;

function evalSeq(
  puzzle: Puzzle,
  blocks: Block[],
  start: PState,
  results: Map<string, BlockResult>,
  entries: Map<string, PState>,
  containerId: string,
  goal: BoolExpr | null = null,
  ctx: GoalContext = NO_CONTEXT,
): PState {
  entries.set(containerId, start);
  let cur = start;
  let halted = false;
  for (const b of blocks) {
    if (halted || cur.contradiction) {
      const note = cur.contradiction ? 'unreachable — contradiction already reached' : undefined;
      results.set(b.id, { status: 'skipped', prev: cur, state: cur, note,
        goal: ctx.proving, assumed: ctx.assumed });
      skipChildren(b, results, entries, cur, note);
      continue;
    }
    const prev = cur;
    const next = cloneState(cur);
    let error: string | undefined;
    let note: string | undefined;
    let scope: PState | undefined;

    switch (b.type) {
      case 'stars': {
        const expression = applyHypExpression(next, puzzle, b.expr, `expr:${b.id}`, 'temporary hypothesis');
        const r = expression.error ? expression : applyStars(next, puzzle, expression.factId ?? null);
        error = r.error; note = r.note;
        break;
      }
      case 'elims': {
        const expression = applyHypExpression(next, puzzle, b.expr, `expr:${b.id}`, 'temporary hypothesis');
        const r = expression.error ? expression : applyElims(next, puzzle, expression.factId ?? null);
        error = r.error; note = r.note;
        break;
      }
      case 'clear': {
        const r = applyClear(next, b.factId);
        error = r.error; note = r.note;
        break;
      }
      case 'rename': {
        const r = applyRename(next, b.factId, b.name);
        error = r.error; note = r.note;
        break;
      }
      case 'subsum': {
        const r = applySubsum(next, puzzle, b.subFactId, b.fromFactId, b.fromFactId);
        error = r.error; note = r.note;
        break;
      }
      case 'define': {
        // The name is the fact's id (not the block id, which changes on every
        // paste or text load), so redefining a name shadows the earlier fact.
        const name = b.name.trim();
        const shadowed = next.facts.some(fact => fact.id === name) ? name : null;
        const r = name
          ? applyHypExpression(next, puzzle, b.expr, name, name, shadowed, true)
          : { error: 'enter a hypothesis name' };
        error = r.error; note = r.note;
        break;
      }
      case 'replace': {
        const target = b.targetFactId ? next.facts.find(fact => fact.id === b.targetFactId) : undefined;
        const r = target
          ? applyHypExpression(next, puzzle, b.expr, target.id, factName(target), target.id, true)
          : { error: 'choose a hypothesis to replace' };
        error = r.error; note = r.note;
        break;
      }
      case 'addsum': {
        const r = applyAddsum(next, puzzle, b.addFactId, b.toFactId, b.toFactId);
        error = r.error; note = r.note;
        break;
      }
      case 'split': {
        const r = applySplit(next, puzzle, b.id, b.name, b.expr, b.parts);
        error = r.error; note = r.note;
        break;
      }
      case 'sorry': {
        next.admitted = true;
        note = 'admitted without proof';
        break;
      }
      case 'argument': {
        const end = evalSeq(puzzle, b.body, cloneState(prev), results, entries, b.id, goal, ctx);
        if (sequenceErrored(b.body, results)) {
          error = 'the argument contains an invalid step';
        } else {
          next.cells = end.cells;
          next.facts = end.facts;
          next.propositions = end.propositions;
          // An argument is transparent grouping, so a supposition made inside it is in scope
          // after it — unlike one made in a claim or a case arm, which runs on a clone.
          next.suppositions = end.suppositions;
          next.contradiction = end.contradiction;
          next.admitted = end.admitted;
          note = 'argument complete';
        }
        break;
      }
      /*
       * Suppose: run the body with `pred` assumed and keep the result as a record.
       *
       * Nothing escapes. The outer state gains only the record itself, which is why this
       * proves nothing on its own and why a contradictory body is stored rather than
       * refused — it simply means `use` will never find its supposition established.
       */
      case 'suppose': {
        const name = b.name.trim();
        if (!b.pred) {
          error = 'choose something to suppose';
          skipChildren(b, results, entries, prev);
          break;
        }
        if (!name) {
          error = 'enter a name for this supposition';
          skipChildren(b, results, entries, prev);
          break;
        }
        if (prev.suppositions.some(sup => sup.name === name)) {
          error = `${name} is already supposed`;
          skipChildren(b, results, entries, prev);
          break;
        }
        const opened = cloneState(prev);
        const bad = addGoalFacts(opened, puzzle, b.pred, 'asm');
        if (bad !== null) {
          error = bad;
          skipChildren(b, results, entries, prev);
          break;
        }
        const end = evalSeq(puzzle, b.body, opened, results, entries, b.id, null, under(ctx, b.pred));
        // Selecting the block shows this rather than the outer board, which is the whole
        // point of a supposition: the outer state is deliberately untouched, so without it
        // focusing a `suppose` would show you the one board the block says nothing about.
        scope = end;
        if (sequenceErrored(b.body, results)) {
          error = 'the supposition contains an invalid step';
        } else {
          // Only the ones the body itself made: the body inherits the outer records, and
          // re-recording those under this name would duplicate them on every discharge.
          const outer = new Set(prev.suppositions.map(sup => sup.name));
          next.suppositions = [...prev.suppositions, {
            name,
            pred: b.pred,
            cells: [...end.cells],
            facts: end.facts.map(f => ({ ...f, cells: [...f.cells] })),
            contradiction: end.contradiction,
            suppositions: end.suppositions
              .filter(sup => !outer.has(sup.name))
              .map(cloneSupposition),
          }];
          const settled = end.cells.filter((c, i) => c !== null && prev.cells[i] === null).length;
          note = end.contradiction
            ? `recorded: ${name} is impossible`
            : `recorded: ${name} would settle ${settled} cell${settled === 1 ? '' : 's'}`;
        }
        break;
      }

      /*
       * Use: discharge a record forward, as the difference against what is known now.
       *
       * Sound because knowledge only grows within a scope — a cell once resolved stays
       * resolved, and a fact that has since been consumed was true when the body used it.
       * So the state here entails the state the body ran from, and `pred` plus that state
       * entails everything the body derived.
       */
      case 'use': {
        const name = b.name.trim();
        if (!name) { error = 'choose a supposition'; break; }
        const sup = prev.suppositions.find(s => s.name === name);
        if (!sup) { error = 'that supposition is not available here'; break; }
        /*
         * A count-form predicate is only ever entailed, never visible on the board, so the
         * proof names the hypothesis that entails it. Scanning the pool instead discharges the
         * supposition without recording why, and the reason is the interesting part.
         */
        const countForm = sup.pred?.kind === 'cmp';
        let via: Fact[] = prev.facts;
        if (b.expr) {
          const scratch = cloneState(prev);
          const got = applyHypExpression(scratch, puzzle, b.expr, `use:${b.id}`, 'use');
          if (got.error) { error = got.error; break; }
          const named = got.factId ? scratch.facts.find(f => f.id === got.factId) : undefined;
          if (!named) { error = 'that hypothesis does not come out as a count'; break; }
          via = [named];
        } else if (countForm && !goalSatisfiedFrom(prev, sup.pred, [])) {
          /*
           * Only when the board does not already decide it. Pass no hypotheses and what is
           * left is what the cells alone settle: a count whose cells have all resolved is
           * simply known, and `normalize` has dropped any fact that named it, so demanding a
           * hypothesis there asks for one that cannot exist.
           */
          error = `${name} supposes a count — connect the hypothesis that establishes it`;
          break;
        }
        if (!goalSatisfiedFrom(prev, sup.pred, via)) {
          error = `${name} is not established — prove its supposition first`;
          break;
        }
        const notes: string[] = [];
        // Cells first: a star imported here must still eliminate its neighbours, so this
        // goes through the normal marking path rather than assigning the array.
        for (let cell = 0; cell < sup.cells.length; cell++) {
          const want = sup.cells[cell];
          if (want === null) continue;
          const have = next.cells[cell];
          if (have === want) continue;
          if (have !== null) {
            // `pred` holds and `pred` implies this cell, so this branch cannot stand.
            next.contradiction = true;
            notes.push(`${posLabel(cell, puzzle.size)} contradicts ${name}`);
            continue;
          }
          if (want === 'star') setStar(next, cell, puzzle.size);
          else setElim(next, cell);
        }
        // Narrows the outer facts by whatever was just imported, which is why narrowed
        // copies of outer facts need no importing — this reproduces them.
        normalize(next);
        /*
         * What makes two hypotheses the same one: the same count over the same cells. Order
         * is not part of it. Line facts come out in index order, but a picked list does not
         * — `(clique D2 E2 D3)` and `(bound >= 0 A14 B14 C14)` carry whatever order they
         * were clicked in — so comparing the cells as written imports a fact the state
         * already holds, under a second name.
         */
        const assertionKey = (f: Fact) =>
          `${f.op}${f.target}:${[...f.cells].sort((x, y) => x - y).join(',')}`;
        const hadId = new Set(next.facts.map(f => f.id));
        const known = new Set(next.facts.map(assertionKey));
        let imported = 0;
        for (const fact of sup.facts) {
          /*
           * A record folded down to no cells is imported like any other, not skipped.
           *
           * It still says something: `★{} = 1` is "one star among none", which cannot hold.
           * `pred` implies the count and the board has since settled every cell it covered,
           * so between them they are inconsistent. Handing it to `normalize` is all that is
           * needed -- it marks the fact impossible, sets the contradiction, and keeps it, so
           * the branch closes and a `via` has something to name. One that folded down
           * satisfiably, `★{} = 0`, is dropped there as vacuous, which is the right answer
           * for it too.
           *
           * Skipping these lost exactly the case worth having: a supposition whose consequence
           * the board has ruled out is how a refutation gets made.
           */
          const key = assertionKey(fact);
          if (known.has(key)) continue;
          const id = `${name}-${fact.id}`;
          if (next.facts.some(f => f.id === id)) continue;
          known.add(key);
          imported += 1;
          next.facts.push({
            ...fact,
            id,
            kind: 'derived',
            index: 0,
            label: `${name}: ${fact.label ?? fact.id}`,
            cells: [...fact.cells],
          });
        }
        if (imported) {
          normalize(next);
          /*
           * Narrowing can land an imported fact on cells an outer one already covers, so the
           * check above is not the last word. Keep the first of each assertion — the outer
           * fact, under the name the reader already knows. An impossible one always stays:
           * it is what a `via` points at, and dropping it would hide the contradiction.
           */
          const seen = new Set<string>();
          next.facts = next.facts.filter(fact => {
            if (fact.impossible) return true;
            const key = assertionKey(fact);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
        // What was actually gained, after duplicates were dropped — so a `use` that imports
        // nothing new still reports that there was nothing to import.
        const added = next.facts.filter(fact => !hadId.has(fact.id)).length;
        /*
         * Suppositions the body made are conditional on this one's predicate, and that
         * predicate has just been established -- so they hold here too, and discharging this
         * record hands them over. An inner supposition was otherwise unreachable: it died with
         * the body that held it, even once its condition was met.
         */
        const taken = new Set(next.suppositions.map(sup => sup.name));
        const exposed = sup.suppositions.filter(inner => !taken.has(inner.name));
        if (exposed.length > 0) {
          next.suppositions = [...next.suppositions, ...exposed.map(cloneSupposition)];
        }
        const moved = next.cells.filter((c, i) => c !== null && prev.cells[i] === null).length;
        if (!added && !moved && !notes.length && exposed.length === 0) {
          error = `you already know everything ${name} derived`;
          break;
        }
        notes.push(`${name} gives ${moved} cell${moved === 1 ? '' : 's'}` +
          (added ? ` and ${added} hypothes${added === 1 ? 'is' : 'es'}` : '') +
          (exposed.length ? `, and exposes ${exposed.map(s => s.name).join(', ')}` : ''));
        note = notes.join('; ');
        break;
      }

      case 'claim': {
        const litText = (l: LoweredCmp): string =>
          `★{${l.cells.map(c => posLabel(c, puzzle.size)).join(' ')}} ${opSymbol(l.op)} ${l.k}`;
        const litId = (l: LoweredCmp): string => litFactId('clm', l);

        const conc = claimConclusion(b.pred);
        const propKey = propositionKey(b.pred);
        if (propKey === null) {
          error = 'the claim predicate is incomplete or cannot be lowered';
          skipChildren(b, results, entries, prev);
          break;
        }
        const newLits = 'error' in conc ? [] : conc.lits.filter(l => !prev.facts.some(f => f.id === litId(l)));
        const newProposition = 'error' in conc && !prev.propositions.some(prop => propositionKey(prop) === propKey);
        if (newLits.length === 0 && !newProposition) {
          error = 'that claim already exists';
          skipChildren(b, results, entries, prev);
          break;
        }
        const end = evalSeq(puzzle, b.body, cloneState(prev), results, entries, b.id, b.pred,
          { proving: b.pred, assumed: ctx.assumed });
        if (sequenceErrored(b.body, results)) {
          error = 'the claim proof contains an invalid step';
        } else if (!goalSatisfied(end, b.pred)) {
          error = 'the claim goal was not proved';
        } else {
          if (b.pred?.kind === 'is_star') setStar(next, b.pred.cell, puzzle.size);
          else if (b.pred?.kind === 'is_elim') setElim(next, b.pred.cell);
          for (const lit of newLits) {
            next.facts.push({
              id: litId(lit), kind: 'derived', index: 0,
              label: `claim ${lit.cells.map(c => posLabel(c, puzzle.size)).join(' ')}`,
              op: lit.op, cells: [...lit.cells], target: lit.k, impossible: false,
            });
          }
          if (newProposition && b.pred) next.propositions.push(b.pred);
          normalize(next);
          note = 'error' in conc ? 'proved Boolean proposition' : `proved: ${conc.lits.map(litText).join(' and ')}`;
        }
        break;
      }
      case 'by_contradiction': {
        if (!goal) { error = 'by contradiction requires an active goal'; skipChildren(b, results, entries, prev); break; }
        const inner = cloneState(prev);
        const negatedGoal: BoolExpr | null = goal.kind === 'not'
          ? goal.a
          : { eid: `${b.id}-neg`, kind: 'not', a: goal };
        error = addGoalFacts(inner, puzzle, negatedGoal, 'asm') ?? undefined;
        if (error) { skipChildren(b, results, entries, prev); break; }
        const end = evalSeq(puzzle, b.body, inner, results, entries, b.id, null,
          under(ctx, negatedGoal));
        scope = end;
        if (sequenceErrored(b.body, results)) error = 'the contradiction proof contains an invalid step';
        else if (end.admitted) {
          addGoalFacts(next, puzzle, goal, 'prv');
          note = 'admitted without proof';
        }
        /*
         * With nothing connected, the body's own state can still close the goal: if it is
         * contradictory, falsity is already derived and there is nothing left to name.
         *
         * This is the case `use` creates. Discharging a supposition whose cells disagree with
         * the board marks the state contradictory through the cells, so no single hypothesis
         * is impossible and there is nothing a `via` could point at — which left an otherwise
         * finished argument unclosable. A supplied `via` still goes through the check below,
         * so an argument that names its reason is held to it.
         */
        else if (!b.contradiction) {
          if (end.contradiction) {
            addGoalFacts(next, puzzle, goal, 'prv');
            note = 'the body is contradictory, which closes the goal';
          } else {
            error = 'connect the contradictory hypothesis at the end';
          }
        }
        else {
          const contradictionState = cloneState(end);
          contradictionState.contradiction = false;
          const contradiction = applyHypExpression(
            contradictionState,
            puzzle,
            b.contradiction,
            `contradiction:${b.id}`,
            'contradiction',
          );
          if (contradiction.error) error = contradiction.error;
          else {
            const suppliedFact = contradiction.factId
              ? contradictionState.facts.find(fact => fact.id === contradiction.factId)
              : undefined;
            if (!contradictionState.contradiction && !suppliedFact?.impossible) {
              error = 'the supplied hypothesis is not contradictory';
            } else {
              addGoalFacts(next, puzzle, goal, 'prv');
              note = 'explicit contradiction closes the goal';
            }
          }
        }
        break;
      }
      case 'constructor': {
        if (!goal || goal.kind !== 'and') { error = 'constructor requires an AND goal'; skipChildren(b, results, entries, prev); break; }
        const left = evalSeq(puzzle, b.left, cloneState(prev), results, entries, `${b.id}:left`, goal.a,
          { proving: goal.a, assumed: ctx.assumed });
        const right = evalSeq(puzzle, b.right, cloneState(prev), results, entries, `${b.id}:right`, goal.b,
          { proving: goal.b, assumed: ctx.assumed });
        if (sequenceErrored(b.left, results) || sequenceErrored(b.right, results)) error = 'a constructor branch contains an invalid step';
        else if (!goalSatisfied(left, goal.a) || !goalSatisfied(right, goal.b)) error = 'both constructor goals must be proved';
        else { addGoalFacts(next, puzzle, goal, 'prv'); note = 'both sides proved'; }
        break;
      }
      /*
       * Or-elimination. `by_cases` proves a disjunctive goal; this consumes a disjunctive
       * fact, which until now nothing could do — a held `or` was inert, provable but never
       * usable. Both arms aim at the enclosing goal, each with one disjunct assumed, so what
       * they establish is what follows from the disjunction however it turns out.
       */
      case 'or_elim': {
        if (!goal) { error = 'or elimination needs a goal to prove'; skipChildren(b, results, entries, prev); break; }
        if (b.pred?.kind !== 'or') { error = 'or elimination needs a disjunction to take apart'; skipChildren(b, results, entries, prev); break; }
        if (!goalSatisfied(prev, b.pred)) {
          error = 'that disjunction is not established here';
          skipChildren(b, results, entries, prev);
          break;
        }
        const onLeft = cloneState(prev), onRight = cloneState(prev);
        const le = addGoalFacts(onLeft, puzzle, b.pred.a, 'asm');
        const re = addGoalFacts(onRight, puzzle, b.pred.b, 'asm');
        if (le || re) { error = le ?? re ?? undefined; skipChildren(b, results, entries, prev); break; }
        const left = evalSeq(puzzle, b.left, onLeft, results, entries, `${b.id}:left`, goal,
          under({ proving: goal, assumed: ctx.assumed }, b.pred.a));
        const right = evalSeq(puzzle, b.right, onRight, results, entries, `${b.id}:right`, goal,
          under({ proving: goal, assumed: ctx.assumed }, b.pred.b));
        if (sequenceErrored(b.left, results) || sequenceErrored(b.right, results)) {
          error = 'an arm of the or elimination contains an invalid step';
        } else if (!goalSatisfied(left, goal) || !goalSatisfied(right, goal)) {
          error = 'both arms must prove the goal';
        } else {
          addGoalFacts(next, puzzle, goal, 'prv');
          note = 'the goal follows from either disjunct';
        }
        break;
      }
      case 'by_cases': {
        if (!goal || goal.kind !== 'or') { error = 'by cases requires an OR goal'; skipChildren(b, results, entries, prev); break; }
        const split = b.split === 'left' ? goal.a : goal.b;
        const other = b.split === 'left' ? goal.b : goal.a;
        const pos = cloneState(prev), neg = cloneState(prev);
        const ae = addGoalFacts(pos, puzzle, split, 'asm');
        const ne = addGoalFacts(neg, puzzle, { eid: `${b.id}-neg`, kind: 'not', a: split }, 'asm');
        if (ae || ne) { error = ae ?? ne ?? undefined; skipChildren(b, results, entries, prev); break; }
        evalSeq(puzzle, b.positive, pos, results, entries, `${b.id}:positive`, split,
          under({ proving: split, assumed: ctx.assumed }, split));
        const negated: BoolExpr = { eid: `${b.id}-negctx`, kind: 'not', a: split };
        const negative = evalSeq(puzzle, b.negative, neg, results, entries, `${b.id}:negative`, other,
          under({ proving: other, assumed: ctx.assumed }, negated));
        if (sequenceErrored(b.positive, results) || sequenceErrored(b.negative, results)) error = 'a case branch contains an invalid step';
        else if (!goalSatisfied(negative, other)) error = 'the negative case did not prove the other disjunct';
        else { addGoalFacts(next, puzzle, goal, 'prv'); note = 'both cases close the OR goal'; }
        break;
      }
    }

    if (error) {
      results.set(b.id, { status: 'error', error, prev, state: prev, scope,
        goal: ctx.proving, assumed: ctx.assumed });
      halted = true;
    } else {
      results.set(b.id, { status: 'ok', note, prev, state: next, scope,
        goal: ctx.proving, assumed: ctx.assumed });
      cur = next;
    }
  }
  return cur;
}

/**
 * Maps the fact ids older builds derived from block ids — `define:<id>`,
 * `contra-<id>-<i>`, `case-<id>-pos|neg-<i>`, `proved-<id>-<i>` — to the ids
 * those facts carry now, so proofs saved before the change keep their
 * references. Goals are threaded exactly as `evalSeq` threads them.
 */
export function legacyFactIds(blocks: Block[]): Map<string, string> {
  const ids = new Map<string, string>();
  const record = (legacyPrefix: string, prefix: 'asm' | 'prv', pred: BoolExpr | null) => {
    const c = claimConclusion(pred);
    if (!('error' in c)) c.lits.forEach((l, i) => ids.set(`${legacyPrefix}-${i}`, litFactId(prefix, l)));
  };
  const not = (a: BoolExpr): BoolExpr => ({ eid: '', kind: 'not', a });
  const walk = (seq: Block[], goal: BoolExpr | null): void => {
    for (const b of seq) {
      switch (b.type) {
        case 'define':
          if (b.name.trim()) ids.set(`define:${b.id}`, b.name.trim());
          break;
        case 'argument':
          walk(b.body, goal);
          break;
        case 'claim':
          walk(b.body, b.pred);
          break;
        case 'by_contradiction':
          if (goal) {
            record(`contra-${b.id}`, 'asm', goal.kind === 'not' ? goal.a : not(goal));
            record(`proved-${b.id}`, 'prv', goal);
          }
          walk(b.body, null);
          break;
        case 'constructor':
          if (goal?.kind === 'and') record(`proved-${b.id}`, 'prv', goal);
          walk(b.left, goal?.kind === 'and' ? goal.a : null);
          walk(b.right, goal?.kind === 'and' ? goal.b : null);
          break;
        case 'by_cases': {
          const split = goal?.kind === 'or' ? (b.split === 'left' ? goal.a : goal.b) : null;
          const other = goal?.kind === 'or' ? (b.split === 'left' ? goal.b : goal.a) : null;
          if (goal?.kind === 'or' && split) {
            record(`case-${b.id}-pos`, 'asm', split);
            record(`case-${b.id}-neg`, 'asm', not(split));
            record(`proved-${b.id}`, 'prv', goal);
          }
          walk(b.positive, split);
          walk(b.negative, other);
          break;
        }
      }
    }
  };
  walk(blocks, null);
  return ids;
}

/**
 * The state a `by_contradiction` body starts from: `pred` assumed, the board marked and
 * the facts added exactly as the enclosing block would do it. Exposed for the proof search,
 * which needs to know where an assumption leads before it writes the claim down.
 */
export function assume(puzzle: Puzzle, state: PState, pred: BoolExpr): { state: PState } | { error: string } {
  const next = cloneState(state);
  const error = addGoalFacts(next, puzzle, pred, 'asm');
  return error === null ? { state: next } : { error };
}

/** The outcome of running one statement against a state. */
export interface StepResult {
  status: BlockStatus;
  error?: string;
  note?: string;
  /** The state after the statement, or the state passed in when it errored. */
  state: PState;
}

/**
 * Run a single statement against a state, without replaying a whole proof. `evaluate`
 * always starts from `initState`, which makes it quadratic to walk a proof one step at a
 * time — what a proof search does constantly. Container blocks work too; they simply have
 * no enclosing goal, as at the top level of a proof.
 */
export function applyStep(puzzle: Puzzle, state: PState, block: Block): StepResult {
  const results = new Map<string, BlockResult>();
  const entries = new Map<string, PState>();
  evalSeq(puzzle, [block], cloneState(state), results, entries, 'step');
  const result = results.get(block.id);
  if (!result) return { status: 'skipped', state };
  return {
    status: result.status,
    error: result.error,
    note: result.note,
    state: result.status === 'ok' ? result.state : state,
  };
}

/** Does this proof use `sorry` anywhere, including inside a claim or a case arm? */
export function containsSorry(blocks: Block[]): boolean {
  return blocks.some(block =>
    block.type === 'sorry' || childContainers(block).some(([, children]) => containsSorry(children)));
}

export function evaluate(puzzle: Puzzle, blocks: Block[]): {
  results: Map<string, BlockResult>;
  /** Proof state entering each container ('root' or a nested block/arm id). */
  entries: Map<string, PState>;
  final: PState;
} {
  const results = new Map<string, BlockResult>();
  const entries = new Map<string, PState>();
  const final = evalSeq(puzzle, blocks, initState(puzzle), results, entries, 'root');
  return { results, entries, final };
}

export function isSolved(s: PState): boolean {
  // A `contradiction` cell is settled, so `every(c => c !== null)` would call it proven. The
  // flag always accompanies one, but say it outright rather than lean on that.
  return !s.contradiction
    && s.cells.every(c => c !== null && c !== 'contradiction');
}
