import type { Block, PState, Puzzle } from './types';
import { evaluate, isSolved, opSymbol } from './engine';
import { parseProof, printProof } from './proofText';
import { colLetter, factName, lineIndices, posLabel, regionIds } from './puzzles';

/**
 * The headless (no DOM, no Blockly) tool surface for driving the proof engine
 * from outside the browser app — e.g. an AI agent that generates proof text,
 * gets back structured feedback, and iterates until the puzzle is solved.
 * `describePuzzle` is what an agent needs to *write* a proof; `runProof` is
 * what it calls to check one.
 */

function renderBoard(state: PState, puzzle: Puzzle): string {
  const N = puzzle.size;
  const header = '   ' + Array.from({ length: N }, (_, c) => colLetter(c)).join(' ');
  const rows = Array.from({ length: N }, (_, r) => {
    const cells = Array.from({ length: N }, (_, c) => {
      const k = state.cells[r * N + c];
      return k === 'star' ? '★' : k === 'elim' ? '·' : '?';
    });
    return `${String(r + 1).padStart(2)} ${cells.join(' ')}`;
  });
  return [header, ...rows].join('\n');
}

function renderFacts(state: PState, puzzle: Puzzle): string {
  if (state.facts.length === 0) return '(none)';
  return state.facts
    .map(f => {
      const cells = f.cells.map(c => posLabel(c, puzzle.size)).join(' ');
      const flag = f.impossible ? '  [impossible]' : '';
      return `${factName(f)}: ★{${cells}} ${opSymbol(f.op)} ${f.target}${flag}`;
    })
    .join('\n');
}

/** Everything an agent needs to know to write proof text for this puzzle. */
export function describePuzzle(puzzle: Puzzle): string {
  const N = puzzle.size;
  const header = '   ' + Array.from({ length: N }, (_, c) => colLetter(c)).join(' ');
  const rows = Array.from({ length: N }, (_, r) => {
    const cells = Array.from({ length: N }, (_, c) => puzzle.regions[r * N + c].toString(36).toUpperCase());
    return `${String(r + 1).padStart(2)} ${cells.join(' ')}`;
  });
  const rowIds = lineIndices(puzzle, 'row').map(i => `row${i}`).join(' ');
  const colIds = lineIndices(puzzle, 'col').map(i => `col${i}`).join(' ');
  const regionIdList = regionIds(puzzle).map(i => `region${i}`).join(' ');
  const plural = puzzle.stars === 1 ? '' : 's';
  return [
    `${puzzle.name} #${puzzle.categoryIndex} — ${N}x${N} board, ${puzzle.stars} star${plural} per row/column/region.`,
    'Goal: place stars so every row, column, and region has exactly that many, no two stars touching (even diagonally).',
    '',
    'Region grid (a letter per cell; cells sharing a letter share a region):',
    header,
    ...rows,
    '',
    `Starting facts (each already states "exactly ${puzzle.stars} star${plural} among these cells"):`,
    `  ${rowIds}`,
    `  ${colIds}`,
    `  ${regionIdList}`,
  ].join('\n');
}

export interface RunResult {
  /** False only when the proof text itself failed to parse (nothing was evaluated). */
  ok: boolean;
  parseError?: string;
  /** The proof text with a trailing ok/ERROR/skipped comment on every statement — valid input again. */
  annotated?: string;
  board?: string;
  facts?: string;
  solved: boolean;
  contradiction: boolean;
  cellsProven: number;
  totalCells: number;
  errorCount: number;
}

/** Parse and evaluate `proofText` against `puzzle`; never throws. */
export function runProof(puzzle: Puzzle, proofText: string): RunResult {
  const totalCells = puzzle.size * puzzle.size;
  let blocks: Block[];
  try {
    blocks = parseProof(proofText, puzzle);
  } catch (error) {
    return {
      ok: false,
      parseError: error instanceof Error ? error.message : String(error),
      solved: false, contradiction: false, cellsProven: 0, totalCells, errorCount: 0,
    };
  }
  const { results, final } = evaluate(puzzle, blocks);
  let errorCount = 0;
  for (const r of results.values()) if (r.status === 'error') errorCount++;
  return {
    ok: true,
    annotated: printProof(blocks, puzzle, results),
    board: renderBoard(final, puzzle),
    facts: renderFacts(final, puzzle),
    solved: isSolved(final),
    contradiction: final.contradiction,
    cellsProven: final.cells.filter(c => c !== null).length,
    totalCells,
    errorCount,
  };
}

/** `runProof`'s result, formatted as one block of text ready to hand back to an agent. */
export function formatReport(r: RunResult): string {
  if (!r.ok) return `PARSE ERROR: ${r.parseError}\n(nothing was evaluated — fix the syntax and resubmit the whole proof)`;
  const status = r.contradiction
    ? 'STATE IS CONTRADICTORY.'
    : r.solved
      ? 'SOLVED — every cell is proven.'
      : `${r.cellsProven}/${r.totalCells} cells proven.`;
  const lines = [
    r.annotated || '(empty proof)',
    '',
    '--- board ---',
    r.board ?? '',
    '',
    '--- known facts ---',
    r.facts ?? '',
    '',
    status,
  ];
  if (r.errorCount > 0) lines.push(`${r.errorCount} step${r.errorCount === 1 ? '' : 's'} failed — see the "; ERROR" comments above.`);
  return lines.join('\n');
}
