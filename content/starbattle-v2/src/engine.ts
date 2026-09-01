import type { Block, BlockResult, BoolExpr, CmpExpr, CmpOp, Fact, FactOp, HypExpr, NumExpr, PState, Puzzle } from './types';
import { factName, lineIndices, lineMembers, neighbors, posLabel } from './puzzles';

/** Fresh state with every row/column/region count fact pre-expanded. */
export function initState(puzzle: Puzzle): PState {
  const facts: Fact[] = [];
  for (const kind of ['row', 'col', 'region'] as const) {
    for (const i of lineIndices(puzzle, kind)) {
      facts.push({
        id: kind + i,
        kind,
        index: i,
        op: '=',
        cells: lineMembers(puzzle, kind, i),
        target: puzzle.stars,
        impossible: false,
      });
    }
  }
  return {
    cells: new Array<null>(puzzle.size * puzzle.size).fill(null),
    facts,
    propositions: [],
    contradiction: false,
  };
}

function cloneState(s: PState): PState {
  return {
    cells: [...s.cells],
    facts: s.facts.map(f => ({ ...f, cells: [...f.cells] })),
    propositions: [...s.propositions],
    contradiction: s.contradiction,
  };
}

/** Place a star; adjacency (the `adj` constraint) eliminates every neighbour. */
function setStar(s: PState, idx: number, N: number): void {
  const cur = s.cells[idx];
  if (cur === 'star') return;
  if (cur === 'elim') { s.contradiction = true; return; }
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
    if (s.cells[c] === 'elim') s.contradiction = true;
    s.cells[c] = 'star';
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
  if (s.cells[idx] === 'star') { s.contradiction = true; return; }
  s.cells[idx] = 'elim';
}

const sameCells = (a: number[], b: number[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * The automatic `ssimp`: fold every known cell out of every fact, flag facts
 * that have become impossible, and drop facts that are fully resolved or
 * vacuous. A `≠` fact is impossible when its count is pinned to the forbidden
 * value — either all cells resolved, or an `=` fact over the same cells states
 * exactly the forbidden count (the `exact hn h` pattern).
 */
function normalize(s: PState): void {
  const kept: Fact[] = [];
  for (const f of s.facts) {
    let target = f.target;
    const cells: number[] = [];
    for (const c of f.cells) {
      const k = s.cells[c];
      if (k === 'star') target--;
      else if (k === null) cells.push(c);
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
}

function applyStars(s: PState, puzzle: Puzzle, factId: string | null): { error?: string; note?: string } {
  if (!factId) return { error: 'choose a fact' };
  const f = s.facts.find(x => x.id === factId);
  if (!f) return { error: 'that fact is not available here' };
  if (f.op === '<=') return { error: 'an upper bound cannot force stars' };
  if (f.op === '!=') {
    // A single-cell ≠ 0 fact means that cell must hold a star.
    if (f.cells.length !== 1 || f.target !== 0) {
      return { error: 'a ≠ fact only forces a star when it covers one cell and forbids 0' };
    }
  } else {
    if (f.target === 0) return { error: 'no stars remain in this line — use "cross out" instead' };
    if (f.cells.length !== f.target) {
      return { error: `not forced: ${f.target} star${f.target === 1 ? '' : 's'} among ${f.cells.length} cells` };
    }
  }
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
  if (f.op === '>=') return { error: 'a lower bound cannot force eliminations' };
  if (f.op === '!=') {
    // A single-cell ≠ 1 fact means that cell cannot hold a star.
    if (f.cells.length !== 1 || f.target !== 1) {
      return { error: 'a ≠ fact only forces an elimination when it covers one cell and forbids 1' };
    }
  } else if (f.target !== 0) {
    return { error: `not forced: ${f.target} star${f.target === 1 ? '' : 's'} still needed among these cells` };
  }
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
  if (cells.length < 2) return { error: 'pick at least two cells on the board' };
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
  s.facts.push({
    id: resultId, kind: 'derived', index: 0, label: resultLabel,
    op: '<=', cells: sorted, target: 1, impossible: false,
  });
  normalize(s);
  return { note: `at most one ★ among ${labels}` };
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
  if (b.type === 'claim' || b.type === 'by_contradiction') return [[b.id, b.body]];
  if (b.type === 'constructor') return [[`${b.id}:left`, b.left], [`${b.id}:right`, b.right]];
  if (b.type === 'by_cases') return [[`${b.id}:positive`, b.positive], [`${b.id}:negative`, b.negative]];
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

function addGoalFacts(s: PState, puzzle: Puzzle, pred: BoolExpr | null, id: string): string | null {
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
  c.lits.forEach((l, i) => s.facts.push({ id: `${id}-${i}`, kind: 'derived', index: 0, label: 'assumption', op: l.op, cells: [...l.cells], target: l.k, impossible: false }));
  normalize(s);
  return null;
}

function goalSatisfied(s: PState, pred: BoolExpr | null): boolean {
  if (s.contradiction) return true;
  if (pred?.kind === 'is_star') return s.cells[pred.cell] === 'star';
  if (pred?.kind === 'is_elim') return s.cells[pred.cell] === 'elim';
  if (pred?.kind === 'not' && pred.a?.kind === 'is_star') return s.cells[pred.a.cell] === 'elim';
  if (pred?.kind === 'not' && pred.a?.kind === 'is_elim') return s.cells[pred.a.cell] === 'star';
  const key = propositionKey(pred);
  if (key !== null && s.propositions.some(prop => propositionKey(prop) === key)) return true;
  const c = claimConclusion(pred);
  return !('error' in c) && c.lits.every(l => s.facts.some(f => f.op === l.op && f.target === l.k && sameCells(f.cells, l.cells)));
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

function evalSeq(
  puzzle: Puzzle,
  blocks: Block[],
  start: PState,
  results: Map<string, BlockResult>,
  entries: Map<string, PState>,
  containerId: string,
  goal: BoolExpr | null = null,
): PState {
  entries.set(containerId, start);
  let cur = start;
  let halted = false;
  for (const b of blocks) {
    if (halted || cur.contradiction) {
      const note = cur.contradiction ? 'unreachable — contradiction already reached' : undefined;
      results.set(b.id, { status: 'skipped', prev: cur, state: cur, note });
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
        const name = b.name.trim();
        const r = name
          ? applyHypExpression(next, puzzle, b.expr, `define:${b.id}`, name, null, true)
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
      case 'argument': {
        const end = evalSeq(puzzle, b.body, cloneState(prev), results, entries, b.id, goal);
        if (sequenceErrored(b.body, results)) {
          error = 'the argument contains an invalid step';
        } else {
          next.cells = end.cells;
          next.facts = end.facts;
          next.propositions = end.propositions;
          next.contradiction = end.contradiction;
          note = 'argument complete';
        }
        break;
      }
      case 'claim': {
        const litText = (l: LoweredCmp): string =>
          `★{${l.cells.map(c => posLabel(c, puzzle.size)).join(' ')}} ${opSymbol(l.op)} ${l.k}`;
        const litId = (l: LoweredCmp): string => 'clm' + l.cells.join('_') + l.op + l.k;

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
        const end = evalSeq(puzzle, b.body, cloneState(prev), results, entries, b.id, b.pred);
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
        error = addGoalFacts(inner, puzzle, negatedGoal, `contra-${b.id}`) ?? undefined;
        if (error) { skipChildren(b, results, entries, prev); break; }
        const end = evalSeq(puzzle, b.body, inner, results, entries, b.id);
        scope = end;
        if (sequenceErrored(b.body, results)) error = 'the contradiction proof contains an invalid step';
        else if (!b.contradiction) error = 'connect the contradictory hypothesis at the end';
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
              addGoalFacts(next, puzzle, goal, `proved-${b.id}`);
              note = 'explicit contradiction closes the goal';
            }
          }
        }
        break;
      }
      case 'constructor': {
        if (!goal || goal.kind !== 'and') { error = 'constructor requires an AND goal'; skipChildren(b, results, entries, prev); break; }
        const left = evalSeq(puzzle, b.left, cloneState(prev), results, entries, `${b.id}:left`, goal.a);
        const right = evalSeq(puzzle, b.right, cloneState(prev), results, entries, `${b.id}:right`, goal.b);
        if (sequenceErrored(b.left, results) || sequenceErrored(b.right, results)) error = 'a constructor branch contains an invalid step';
        else if (!goalSatisfied(left, goal.a) || !goalSatisfied(right, goal.b)) error = 'both constructor goals must be proved';
        else { addGoalFacts(next, puzzle, goal, `proved-${b.id}`); note = 'both sides proved'; }
        break;
      }
      case 'by_cases': {
        if (!goal || goal.kind !== 'or') { error = 'by cases requires an OR goal'; skipChildren(b, results, entries, prev); break; }
        const split = b.split === 'left' ? goal.a : goal.b;
        const other = b.split === 'left' ? goal.b : goal.a;
        const pos = cloneState(prev), neg = cloneState(prev);
        const ae = addGoalFacts(pos, puzzle, split, `case-${b.id}-pos`);
        const ne = addGoalFacts(neg, puzzle, { eid: `${b.id}-neg`, kind: 'not', a: split }, `case-${b.id}-neg`);
        if (ae || ne) { error = ae ?? ne ?? undefined; skipChildren(b, results, entries, prev); break; }
        evalSeq(puzzle, b.positive, pos, results, entries, `${b.id}:positive`, split);
        const negative = evalSeq(puzzle, b.negative, neg, results, entries, `${b.id}:negative`, other);
        if (sequenceErrored(b.positive, results) || sequenceErrored(b.negative, results)) error = 'a case branch contains an invalid step';
        else if (!goalSatisfied(negative, other)) error = 'the negative case did not prove the other disjunct';
        else { addGoalFacts(next, puzzle, goal, `proved-${b.id}`); note = 'both cases close the OR goal'; }
        break;
      }
    }

    if (error) {
      results.set(b.id, { status: 'error', error, prev, state: prev, scope });
      halted = true;
    } else {
      results.set(b.id, { status: 'ok', note, prev, state: next, scope });
      cur = next;
    }
  }
  return cur;
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
  return !s.contradiction && s.cells.every(c => c !== null);
}
