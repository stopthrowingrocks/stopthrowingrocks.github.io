import type { Block, BlockResult, BoolExpr, CmpOp, HypExpr, NumExpr, Puzzle } from './types';
import { cellLabelToIndex, posLabel } from './puzzles';

/**
 * A lispy text format for the proof `Block[]` AST — the same tree the
 * Blockly workspace produces, just as s-expressions instead of blocks. Round
 * trips exactly: `parseProof(printProof(blocks, puzzle), puzzle)` reproduces
 * the same proof (with fresh block ids; see `newTextId`).
 *
 * Grammar (informal):
 *   proof      := stmt*
 *   stmt       := (stars <hyp>) | (elims <hyp>)
 *               | (clear <fact>) | (rename <fact> <string>)
 *               | (subsum <fact:from> <fact:sub>) | (addsum <fact:to> <fact:add>)
 *               | (define <name> <hyp>) | (replace <fact> <hyp>)
 *               | (argument <stmt>*)
 *               | (claim <bool> <stmt>*)
 *               | (by-contradiction (body <stmt>*) (via <hyp>))
 *               | (constructor (left <stmt>*) (right <stmt>*))
 *               | (by-cases left|right (positive <stmt>*) (negative <stmt>*))
 *   hyp        := <fact> | (+ <hyp> <hyp>) | (- <hyp> <hyp>) | (combine <hyp> <hyp>)
 *               | (clique <cell>*) | (bound <=|>= <int> <cell>*)
 *   bool       := (<cmpop> <num> <num>) | (and <bool> <bool>) | (or <bool> <bool>)
 *               | (not <bool>) | (is-star <cell>) | (is-elim <cell>)
 *   num        := <int> | (count <cell>*) | (+ <num> <num>) | (- <num> <num>)
 *   fact, name := <symbol> | <string>     ; an unbound name is used verbatim as a fact id
 *   cell       := <symbol>                ; board label, e.g. A1
 *
 * `_` stands for an empty/unset slot anywhere a <hyp>, <bool>, <fact>, or
 * <name> is expected (mirrors an unfilled Blockly socket), so an in-progress
 * proof still round-trips instead of crashing the printer or parser.
 * `;` starts a line comment.
 */

/** The grammar above, as a string — for an agent's system prompt or a CLI `grammar` command. */
export const PROOF_GRAMMAR = `Star Battle proof language — lispy s-expressions over a proof state.

Every row, column, and region starts with a known count fact (row0, col0,
region0, ...): "exactly K stars among these cells" (K = puzzle.stars). Cell
labels are board coordinates like A1 (column letter, 1-based row).

Statements (a proof is zero or more of these, one after another):
  (stars <hyp>)                    place forced stars: <hyp> must be a fact
                                    whose free-cell count equals its target
  (elims <hyp>)                    cross out the rest of a fact whose target is 0
  (clear <fact>)                   discard a fact you no longer need
  (rename <fact> "<text>")         give a fact a nicer display name
  (subsum <fact:from> <fact:sub>)  from -= sub  (sub's cells must lie inside from's)
  (addsum <fact:to> <fact:add>)    to += add  (to's and add's cells must be disjoint)
  (define <name> <hyp>)            bind a new name to a hypothesis expression
  (replace <fact> <hyp>)           overwrite a fact with a recomputed hypothesis
  (argument <stmt>*)               a no-op grouping of statements
  (claim <bool> <stmt>*)           prove a predicate; body proves it directly,
                                    or via nested by-contradiction/constructor/by-cases
  (by-contradiction (body <stmt>*) (via <hyp>))
                                    assume the active goal's negation, derive a
                                    contradiction; <via> must name/derive it
  (constructor (left <stmt>*) (right <stmt>*))
                                    prove an AND goal by proving both sides
  (by-cases left|right (positive <stmt>*) (negative <stmt>*))
                                    prove an OR goal: assuming the chosen side
                                    is false, the negative branch must prove the other

Hypothesis expressions <hyp> (fact-valued):
  <fact>                           a fact by name (row3, col0, region2, or a
                                    name you introduced with define)
  (+ <hyp> <hyp>)  (- <hyp> <hyp>) add/subtract two facts' counts
  (combine <hyp> <hyp>)            merge a <=k and >=k (or a bound and a !=k) fact
  (clique <cell>*)                 pairwise king-move-adjacent cells: at most 1 star
  (bound <=|>= <int> <cell>*)      assert a star-count bound directly

Boolean expressions <bool> (used only in claim's predicate):
  (<op> <num> <num>)    op is one of = != < > <= >=
  (and <bool> <bool>)  (or <bool> <bool>)  (not <bool>)
  (is-star <cell>)  (is-elim <cell>)

Number expressions <num>:
  <int>  |  (count <cell>*)  |  (+ <num> <num>)  |  (- <num> <num>)

\`_\` fills any empty slot. \`;\` starts a line comment — comments are ignored
by the parser, so annotated feedback (each statement followed by "; ok: ..."
or "; ERROR: ...") is itself valid input again.`;

// ── Reader: text -> s-expressions ────────────────────────────────────────────

type Sx =
  | { t: 'atom'; v: string; line: number }
  | { t: 'str'; v: string; line: number }
  | { t: 'list'; v: Sx[]; line: number; note?: string };

class ReadError extends Error {}

function tokenize(text: string): { s: string; line: number }[] {
  const tokens: { s: string; line: number }[] = [];
  let line = 1;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === ';') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '(' || c === ')') { tokens.push({ s: c, line }); i++; continue; }
    if (c === '"') {
      let j = i + 1, out = '';
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\' && j + 1 < text.length) { out += text[j + 1]; j += 2; }
        else { if (text[j] === '\n') line++; out += text[j]; j++; }
      }
      if (j >= text.length) throw new ReadError(`unterminated string starting on line ${line}`);
      tokens.push({ s: `"${out}`, line }); // leading '"' marks this token as a string literal
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < text.length && !/[\s()]/.test(text[j]) && text[j] !== ';') j++;
    tokens.push({ s: text.slice(i, j), line });
    i = j;
  }
  return tokens;
}

function readAll(text: string): Sx[] {
  const tokens = tokenize(text);
  let pos = 0;
  function readOne(): Sx {
    if (pos >= tokens.length) throw new ReadError('unexpected end of input');
    const tok = tokens[pos++];
    if (tok.s === '(') {
      const items: Sx[] = [];
      while (pos < tokens.length && tokens[pos].s !== ')') items.push(readOne());
      if (pos >= tokens.length) throw new ReadError(`unclosed "(" opened on line ${tok.line}`);
      pos++; // consume ')'
      return { t: 'list', v: items, line: tok.line };
    }
    if (tok.s === ')') throw new ReadError(`unexpected ")" on line ${tok.line}`);
    if (tok.s.startsWith('"')) return { t: 'str', v: tok.s.slice(1), line: tok.line };
    return { t: 'atom', v: tok.s, line: tok.line };
  }
  const forms: Sx[] = [];
  while (pos < tokens.length) forms.push(readOne());
  return forms;
}

// ── Printer: s-expressions -> text ───────────────────────────────────────────

function escapeStr(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** True if `name` can be printed as a bare symbol instead of a quoted string. */
const isBareSymbol = (name: string): boolean => /^[A-Za-z][A-Za-z0-9_-]*$/.test(name);

function printAtomOrString(s: string): string {
  return isBareSymbol(s) ? s : escapeStr(s);
}

function sxToText(sx: Sx): string {
  if (sx.t === 'atom') return sx.v;
  if (sx.t === 'str') return escapeStr(sx.v);
  return `(${sx.v.map(sxToText).join(' ')})`;
}

// ── Name scoping ──────────────────────────────────────────────────────────────
// `define` is the only Block that introduces a referenceable name; every other
// reference to a fact id is either a puzzle-provided id (row3, col0, region2 —
// printed/parsed verbatim) or a `replace`d id that keeps whatever name it had.
// Scopes nest with the block tree: a name defined inside a body is visible to
// the rest of that body and anything nested further, not to what comes after
// the enclosing block closes — matching how the engine threads cloned state
// through constructor/by-cases branches without leaking facts between them.

class Scope {
  private readonly stack: Map<string, string>[] = [new Map()];
  push(): void { this.stack.push(new Map()); }
  pop(): void { this.stack.pop(); }
  define(name: string, factId: string): void { this.stack[this.stack.length - 1].set(name, factId); }
  /** The bare name bound to `factId` in the current scope chain, if any. */
  nameOf(factId: string): string | null {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      for (const [name, id] of this.stack[i]) if (id === factId) return name;
    }
    return null;
  }
  /** The fact id bound to `name`, or `name` itself if it isn't a local binding. */
  resolve(name: string): string {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const id = this.stack[i].get(name);
      if (id !== undefined) return id;
    }
    return name;
  }
}

// ── Printing Block[] -> text ──────────────────────────────────────────────────

let idCounter = 0;
/** Fresh block id for text-parsed blocks — unique per `parseProof` call. */
const newTextId = (): string => `text-${++idCounter}`;

function printFactRef(factId: string | null, scope: Scope): Sx {
  if (factId === null) return { t: 'atom', v: '_', line: 0 };
  const name = scope.nameOf(factId);
  return { t: 'atom', v: printAtomOrString(name ?? factId), line: 0 };
}

function printCell(cell: number, puzzle: Puzzle): Sx {
  return { t: 'atom', v: posLabel(cell, puzzle.size), line: 0 };
}

function printHyp(e: HypExpr | null, puzzle: Puzzle, scope: Scope): Sx {
  if (!e) return { t: 'atom', v: '_', line: 0 };
  if (e.kind === 'ref') return printFactRef(e.factId, scope);
  if (e.kind === 'clique') return { t: 'list', v: [atom('clique'), ...e.cells.map(c => printCell(c, puzzle))], line: 0 };
  if (e.kind === 'bound') {
    return { t: 'list', v: [atom('bound'), atom(e.op), atom(String(e.target)), ...e.cells.map(c => printCell(c, puzzle))], line: 0 };
  }
  const op = e.kind === 'add' ? '+' : e.kind === 'sub' ? '-' : 'combine';
  return { t: 'list', v: [atom(op), printHyp(e.left, puzzle, scope), printHyp(e.right, puzzle, scope)], line: 0 };
}

function printNum(e: NumExpr | null, puzzle: Puzzle): Sx {
  if (!e) return { t: 'atom', v: '_', line: 0 };
  if (e.kind === 'lit') return atom(String(e.value));
  if (e.kind === 'count') return { t: 'list', v: [atom('count'), ...e.cells.map(c => printCell(c, puzzle))], line: 0 };
  return { t: 'list', v: [atom(e.kind === 'add' ? '+' : '-'), printNum(e.a, puzzle), printNum(e.b, puzzle)], line: 0 };
}

function printBool(e: BoolExpr | null, puzzle: Puzzle): Sx {
  if (!e) return { t: 'atom', v: '_', line: 0 };
  switch (e.kind) {
    case 'is_star': return { t: 'list', v: [atom('is-star'), printCell(e.cell, puzzle)], line: 0 };
    case 'is_elim': return { t: 'list', v: [atom('is-elim'), printCell(e.cell, puzzle)], line: 0 };
    case 'cmp': return { t: 'list', v: [atom(e.op), printNum(e.a, puzzle), printNum(e.b, puzzle)], line: 0 };
    case 'not': return { t: 'list', v: [atom('not'), printBool(e.a, puzzle)], line: 0 };
    case 'and': case 'or': return { t: 'list', v: [atom(e.kind), printBool(e.a, puzzle), printBool(e.b, puzzle)], line: 0 };
  }
}

function atom(v: string): Sx { return { t: 'atom', v, line: 0 }; }
function tagged(tag: string, items: Sx[]): Sx { return { t: 'list', v: [atom(tag), ...items], line: 0 }; }

/** One-line status comment for a block's evaluation result (used by the annotated printer). */
function statusNote(r: BlockResult | undefined): string | undefined {
  if (!r) return undefined;
  if (r.status === 'ok') return r.note ? `ok: ${r.note}` : 'ok';
  if (r.status === 'error') return `ERROR: ${r.error}`;
  return r.note ? `skipped: ${r.note}` : 'skipped';
}

type Results = Map<string, BlockResult>;

function printBlockCore(b: Block, puzzle: Puzzle, scope: Scope, results?: Results): Sx {
  switch (b.type) {
    case 'stars': return tagged('stars', [printHyp(b.expr, puzzle, scope)]);
    case 'elims': return tagged('elims', [printHyp(b.expr, puzzle, scope)]);
    case 'clear': return tagged('clear', [printFactRef(b.factId, scope)]);
    case 'rename': return tagged('rename', [printFactRef(b.factId, scope), { t: 'str', v: b.name, line: 0 }]);
    case 'subsum': return tagged('subsum', [printFactRef(b.fromFactId, scope), printFactRef(b.subFactId, scope)]);
    case 'addsum': return tagged('addsum', [printFactRef(b.toFactId, scope), printFactRef(b.addFactId, scope)]);
    case 'define': {
      const sx = tagged('define', [atom(printAtomOrString(b.name)), printHyp(b.expr, puzzle, scope)]);
      scope.define(b.name, `define:${b.id}`);
      return sx;
    }
    case 'replace': return tagged('replace', [printFactRef(b.targetFactId, scope), printHyp(b.expr, puzzle, scope)]);
    case 'argument': {
      scope.push();
      const body = b.body.map(child => printBlock(child, puzzle, scope, results));
      scope.pop();
      return tagged('argument', body);
    }
    case 'claim': {
      scope.push();
      const body = b.body.map(child => printBlock(child, puzzle, scope, results));
      scope.pop();
      return { t: 'list', v: [atom('claim'), printBool(b.pred, puzzle), ...body], line: 0 };
    }
    case 'by_contradiction': {
      scope.push();
      const body = b.body.map(child => printBlock(child, puzzle, scope, results));
      const via = printHyp(b.contradiction, puzzle, scope);
      scope.pop();
      return tagged('by-contradiction', [tagged('body', body), tagged('via', [via])]);
    }
    case 'constructor': {
      scope.push();
      const left = b.left.map(child => printBlock(child, puzzle, scope, results));
      scope.pop();
      scope.push();
      const right = b.right.map(child => printBlock(child, puzzle, scope, results));
      scope.pop();
      return tagged('constructor', [tagged('left', left), tagged('right', right)]);
    }
    case 'by_cases': {
      scope.push();
      const positive = b.positive.map(child => printBlock(child, puzzle, scope, results));
      scope.pop();
      scope.push();
      const negative = b.negative.map(child => printBlock(child, puzzle, scope, results));
      scope.pop();
      return { t: 'list', v: [atom('by-cases'), atom(b.split), tagged('positive', positive), tagged('negative', negative)], line: 0 };
    }
  }
}

/** `printBlockCore` plus, when `results` is supplied, this block's own ok/error/skipped comment. */
function printBlock(b: Block, puzzle: Puzzle, scope: Scope, results?: Results): Sx {
  const sx = printBlockCore(b, puzzle, scope, results);
  if (!results || sx.t !== 'list') return sx;
  const note = statusNote(results.get(b.id));
  return note ? { ...sx, note } : sx;
}

/** Pretty-print an s-expression tree: statement bodies one per line, indented; everything else inline. */
function layout(sx: Sx, indent: number, statementBody: boolean): string {
  const pad = '  '.repeat(indent);
  if (sx.t !== 'list') return pad + sxToText(sx);
  const isSection = sx.v[0]?.t === 'atom' &&
    ['body', 'via', 'left', 'right', 'positive', 'negative'].includes(sx.v[0].v);
  const isStmtForm = sx.v[0]?.t === 'atom' &&
    ['argument', 'claim', 'by-contradiction', 'constructor', 'by-cases'].includes(sx.v[0].v);
  if (statementBody || isSection || isStmtForm) {
    const head = sx.v.filter(item => !(item.t === 'list' && item.v[0]?.t === 'atom' &&
      ['body', 'via', 'left', 'right', 'positive', 'negative'].includes((item.v[0] as { v: string }).v)));
    const sections = sx.v.filter(item => item.t === 'list' && item.v[0]?.t === 'atom' &&
      ['body', 'via', 'left', 'right', 'positive', 'negative'].includes((item.v[0] as { v: string }).v));
    const suffix = sx.note ? `  ; ${sx.note}` : '';
    const headText = `${pad}(${head.map(sxToText).join(' ')}`;
    if (sections.length === 0) return `${headText})${suffix}`;
    const lines = [headText];
    for (const section of sections) {
      if (section.t !== 'list') continue;
      const tag = (section.v[0] as { v: string }).v;
      const rest = section.v.slice(1);
      if (tag === 'via') { lines.push(`${pad}  (via ${rest.map(sxToText).join(' ')})`); continue; }
      lines.push(`${pad}  (${tag}`);
      for (const stmt of rest) lines.push(layout(stmt, indent + 2, true));
      lines.push(`${pad}  )`);
    }
    lines.push(`${pad})${suffix}`);
    return lines.join('\n');
  }
  return pad + sxToText(sx);
}

/**
 * Print a proof as lispy text. With `results` (from `engine.evaluate`), each
 * statement gets a trailing `; ok: ...` / `; ERROR: ...` / `; skipped: ...`
 * comment describing its own outcome — since `;` starts a line comment, this
 * annotated text is still valid input to `parseProof` (comments are ignored),
 * so it doubles as feedback an agent can read, edit, and resubmit directly.
 */
export function printProof(blocks: Block[], puzzle: Puzzle, results?: Results): string {
  const scope = new Scope();
  return blocks.map(b => layout(printBlock(b, puzzle, scope, results), 0, true)).join('\n\n');
}

// ── Parsing text -> Block[] ────────────────────────────────────────────────────

class ParseError extends Error {}

function expectAtom(sx: Sx | undefined, what: string): string {
  if (!sx || sx.t === 'list') throw new ParseError(`expected ${what}${sx ? ` on line ${sx.line}` : ''}`);
  return sx.v;
}

function parseFactRef(sx: Sx | undefined, scope: Scope, what = 'a fact reference'): string | null {
  const raw = expectAtom(sx, what);
  if (raw === '_') return null;
  return scope.resolve(raw);
}

function parseCell(sx: Sx | undefined, puzzle: Puzzle): number {
  const raw = expectAtom(sx, 'a cell label like A1');
  const idx = cellLabelToIndex(raw, puzzle.size);
  if (idx === null) throw new ParseError(`"${raw}" is not a valid cell on this ${puzzle.size}x${puzzle.size} board (line ${sx?.line ?? '?'})`);
  return idx;
}

function asList(sx: Sx, what: string): Sx[] {
  if (sx.t !== 'list') throw new ParseError(`expected ${what} on line ${sx.line}`);
  return sx.v;
}

function head(items: Sx[]): string {
  const first = items[0];
  if (!first || first.t !== 'atom') throw new ParseError(`expected a form name${first ? ` on line ${first.line}` : ''}`);
  return first.v;
}

function parseHyp(sx: Sx | undefined, puzzle: Puzzle, scope: Scope): HypExpr | null {
  if (!sx) throw new ParseError('expected a hypothesis expression');
  if (sx.t === 'atom' || sx.t === 'str') {
    if (sx.t === 'atom' && sx.v === '_') return null;
    return { eid: newTextId(), kind: 'ref', factId: scope.resolve(sx.v) };
  }
  const items = sx.v;
  const kw = head(items);
  if (kw === 'clique') return { eid: newTextId(), kind: 'clique', cells: items.slice(1).map(c => parseCell(c, puzzle)) };
  if (kw === 'bound') {
    const op = expectAtom(items[1], '<= or >=');
    if (op !== '<=' && op !== '>=') throw new ParseError(`bound expects <= or >= on line ${sx.line}`);
    const target = Number(expectAtom(items[2], 'an integer target'));
    return { eid: newTextId(), kind: 'bound', op, target, cells: items.slice(3).map(c => parseCell(c, puzzle)) };
  }
  if (kw === '+' || kw === '-' || kw === 'combine') {
    if (items.length !== 3) throw new ParseError(`${kw} takes exactly two arguments (line ${sx.line})`);
    return {
      eid: newTextId(),
      kind: kw === '+' ? 'add' : kw === '-' ? 'sub' : 'combine',
      left: parseHyp(items[1], puzzle, scope),
      right: parseHyp(items[2], puzzle, scope),
    };
  }
  throw new ParseError(`unknown hypothesis expression "${kw}" on line ${sx.line}`);
}

function parseNum(sx: Sx | undefined, puzzle: Puzzle): NumExpr | null {
  if (!sx) throw new ParseError('expected a number expression');
  if (sx.t === 'atom' && sx.v === '_') return null;
  if (sx.t === 'atom' && /^-?\d+$/.test(sx.v)) return { eid: newTextId(), kind: 'lit', value: Number(sx.v) };
  if (sx.t !== 'list') throw new ParseError(`expected a number expression on line ${sx.line}`);
  const kw = head(sx.v);
  if (kw === 'count') return { eid: newTextId(), kind: 'count', cells: sx.v.slice(1).map(c => parseCell(c, puzzle)) };
  if (kw === '+' || kw === '-') {
    if (sx.v.length !== 3) throw new ParseError(`${kw} takes exactly two arguments (line ${sx.line})`);
    return { eid: newTextId(), kind: kw === '+' ? 'add' : 'sub', a: parseNum(sx.v[1], puzzle), b: parseNum(sx.v[2], puzzle) };
  }
  throw new ParseError(`unknown number expression "${kw}" on line ${sx.line}`);
}

const CMP_OPS: CmpOp[] = ['=', '!=', '<', '>', '<=', '>='];

function parseBool(sx: Sx | undefined, puzzle: Puzzle): BoolExpr | null {
  if (!sx) throw new ParseError('expected a Boolean expression');
  if (sx.t === 'atom' && sx.v === '_') return null;
  if (sx.t !== 'list') throw new ParseError(`expected a Boolean expression on line ${sx.line}`);
  const kw = head(sx.v);
  if (kw === 'is-star' || kw === 'is-elim') {
    return { eid: newTextId(), kind: kw === 'is-star' ? 'is_star' : 'is_elim', cell: parseCell(sx.v[1], puzzle) };
  }
  if (kw === 'not') return { eid: newTextId(), kind: 'not', a: parseBool(sx.v[1], puzzle) };
  if (kw === 'and' || kw === 'or') {
    if (sx.v.length !== 3) throw new ParseError(`${kw} takes exactly two arguments (line ${sx.line})`);
    return { eid: newTextId(), kind: kw, a: parseBool(sx.v[1], puzzle), b: parseBool(sx.v[2], puzzle) };
  }
  if ((CMP_OPS as string[]).includes(kw)) {
    if (sx.v.length !== 3) throw new ParseError(`${kw} takes exactly two arguments (line ${sx.line})`);
    return { eid: newTextId(), kind: 'cmp', op: kw as CmpOp, a: parseNum(sx.v[1], puzzle), b: parseNum(sx.v[2], puzzle) };
  }
  throw new ParseError(`unknown Boolean expression "${kw}" on line ${sx.line}`);
}

/** Find `(tag ...)` among `items` (a section list); throws if missing. */
function section(items: Sx[], tag: string, formLine: number): Sx[] {
  const found = items.find(item => item.t === 'list' && item.v[0]?.t === 'atom' && item.v[0].v === tag);
  if (!found || found.t !== 'list') throw new ParseError(`expected a (${tag} ...) section (line ${formLine})`);
  return found.v.slice(1);
}

function parseStmt(sx: Sx, puzzle: Puzzle, scope: Scope): Block {
  const items = asList(sx, 'a proof statement');
  const kw = head(items);
  const id = newTextId();
  switch (kw) {
    case 'stars': return { id, type: 'stars', expr: parseHyp(items[1], puzzle, scope) };
    case 'elims': return { id, type: 'elims', expr: parseHyp(items[1], puzzle, scope) };
    case 'clear': return { id, type: 'clear', factId: parseFactRef(items[1], scope) };
    case 'rename': return {
      id, type: 'rename',
      factId: parseFactRef(items[1], scope),
      name: items[2]?.t === 'str' || items[2]?.t === 'atom' ? items[2].v : '',
    };
    case 'subsum': return {
      id, type: 'subsum',
      fromFactId: parseFactRef(items[1], scope),
      subFactId: parseFactRef(items[2], scope),
    };
    case 'addsum': return {
      id, type: 'addsum',
      toFactId: parseFactRef(items[1], scope),
      addFactId: parseFactRef(items[2], scope),
    };
    case 'define': {
      const name = expectAtom(items[1], 'a hypothesis name');
      const expr = parseHyp(items[2], puzzle, scope);
      if (name !== '_') scope.define(name, `define:${id}`);
      return { id, type: 'define', name: name === '_' ? '' : name, expr };
    }
    case 'replace': return {
      id, type: 'replace',
      targetFactId: parseFactRef(items[1], scope),
      expr: parseHyp(items[2], puzzle, scope),
    };
    case 'argument': {
      scope.push();
      const body = items.slice(1).map(s => parseStmt(s, puzzle, scope));
      scope.pop();
      return { id, type: 'argument', body };
    }
    case 'claim': {
      const pred = parseBool(items[1], puzzle);
      scope.push();
      const body = items.slice(2).map(s => parseStmt(s, puzzle, scope));
      scope.pop();
      return { id, type: 'claim', pred, body };
    }
    case 'by-contradiction': {
      const bodyItems = section(items.slice(1), 'body', sx.line);
      const viaItems = section(items.slice(1), 'via', sx.line);
      scope.push();
      const body = bodyItems.map(s => parseStmt(s, puzzle, scope));
      const contradiction = parseHyp(viaItems[0], puzzle, scope);
      scope.pop();
      return { id, type: 'by_contradiction', body, contradiction };
    }
    case 'constructor': {
      const leftItems = section(items.slice(1), 'left', sx.line);
      const rightItems = section(items.slice(1), 'right', sx.line);
      scope.push();
      const left = leftItems.map(s => parseStmt(s, puzzle, scope));
      scope.pop();
      scope.push();
      const right = rightItems.map(s => parseStmt(s, puzzle, scope));
      scope.pop();
      return { id, type: 'constructor', left, right };
    }
    case 'by-cases': {
      const split = expectAtom(items[1], '"left" or "right"');
      if (split !== 'left' && split !== 'right') throw new ParseError(`by-cases expects "left" or "right" on line ${sx.line}`);
      const positiveItems = section(items.slice(2), 'positive', sx.line);
      const negativeItems = section(items.slice(2), 'negative', sx.line);
      scope.push();
      const positive = positiveItems.map(s => parseStmt(s, puzzle, scope));
      scope.pop();
      scope.push();
      const negative = negativeItems.map(s => parseStmt(s, puzzle, scope));
      scope.pop();
      return { id, type: 'by_cases', split, positive, negative };
    }
    default:
      throw new ParseError(`unknown proof statement "${kw}" on line ${sx.line}`);
  }
}

export function parseProof(text: string, puzzle: Puzzle): Block[] {
  idCounter = 0;
  const scope = new Scope();
  let forms: Sx[];
  try {
    forms = readAll(text);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
  const blocks: Block[] = [];
  for (const form of forms) {
    try {
      blocks.push(parseStmt(form, puzzle, scope));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }
  return blocks;
}
