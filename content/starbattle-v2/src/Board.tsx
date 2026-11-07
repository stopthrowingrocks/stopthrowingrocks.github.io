import type { CellK, Puzzle } from './types';
import { REGION_COLORS, colLetter } from './puzzles';

const THIN = '1px solid rgba(0,0,0,0.25)';
const THICK = '3px solid #111';

function ElimX() {
  return (
    <svg viewBox="0 0 10 10" width="38%" height="38%" style={{ display: 'block', margin: 'auto' }}>
      <path
        d="M2,2 L8,8 M8,2 L2,8"
        stroke="rgb(200,40,40)" strokeWidth={2.2} strokeLinecap="round" fill="none" opacity={0.85}
      />
    </svg>
  );
}

/**
 * While a `split` is being built, the board says how far its parts have got: which cells of
 * the hypothesis are still unaccounted for, which the other parts already cover, and which
 * belong to the part being edited. Cells counted twice, or reaching outside the hypothesis,
 * are called out too — the engine rejects those, and seeing where is faster than reading it.
 */
export interface Coverage {
  /** How many cells the hypothesis covers, so the caption counts against a fixed total. */
  total: number;
  remaining: Set<number>;
  editing: Set<number>;
  covered: Set<number>;
  conflicting: Set<number>;
}

const RING = (colour: string) => `inset 0 0 0 3px ${colour}`;

export function Board({ puzzle, cells, highlight, coverage, picking, onCell }: {
  puzzle: Puzzle;
  cells: CellK[];
  highlight: Set<number> | null;
  coverage?: Coverage | null;
  picking: boolean;
  onCell?: (idx: number) => void;
}) {
  const N = puzzle.size;
  const reg = puzzle.regions;
  const sz = `calc((40svh - 22px) / ${N})`;

  const headerRow = (
    <tr key="hdr">
      <th className="board-label" />
      {Array.from({ length: N }, (_, c) => (
        <th key={c} className="board-label">{colLetter(c)}</th>
      ))}
    </tr>
  );

  const rows = [headerRow];
  for (let r = 0; r < N; r++) {
    const rowCells = [<th key="lbl" className="board-label">{r + 1}</th>];
    for (let c = 0; c < N; c++) {
      const idx = r * N + c;
      const thickTop    = r === 0     || reg[idx] !== reg[idx - N];
      const thickLeft   = c === 0     || reg[idx] !== reg[idx - 1];
      const thickBottom = r === N - 1 || reg[idx] !== reg[idx + N];
      const thickRight  = c === N - 1 || reg[idx] !== reg[idx + 1];
      const hl = highlight ? highlight.has(idx) : null;
      // Coverage, when a split is in hand, replaces the plain highlight.
      const inCoverage = coverage
        ? coverage.conflicting.has(idx) ? RING('#dc2626')
          : coverage.editing.has(idx) ? RING('#f59e0b')
            : coverage.remaining.has(idx) ? RING('#2563eb')
              : coverage.covered.has(idx) ? RING('rgba(37, 99, 235, 0.35)')
                : null
        : null;
      const dimmed = coverage
        ? inCoverage === null
        : hl === false;
      rowCells.push(
        <td
          key={c}
          onClick={onCell ? () => onCell(idx) : undefined}
          onPointerDown={onCell ? event => event.stopPropagation() : undefined}
          style={{
            width: sz, height: sz, minWidth: sz,
            boxSizing: 'border-box',
            textAlign: 'center', verticalAlign: 'middle',
            cursor: picking ? 'crosshair' : 'default',
            backgroundColor: REGION_COLORS[reg[idx]] ?? '#ddd',
            borderTop:    thickTop    ? THICK : THIN,
            borderLeft:   thickLeft   ? THICK : THIN,
            borderBottom: thickBottom ? THICK : THIN,
            borderRight:  thickRight  ? THICK : THIN,
            boxShadow: coverage ? (inCoverage ?? undefined) : (hl === true ? RING('#2563eb') : undefined),
            filter: dimmed ? 'brightness(0.8)' : undefined,
          }}
        >
          {cells[idx] === 'star' && (
            <span style={{ display: 'block', fontSize: `calc(${sz} * 0.55)`, color: '#111', lineHeight: 1 }}>★</span>
          )}
          {cells[idx] === 'elim' && <ElimX />}
        </td>,
      );
    }
    rows.push(<tr key={r}>{rowCells}</tr>);
  }

  return (
    <table className="board" style={{ borderCollapse: 'collapse' }}>
      <tbody>{rows}</tbody>
    </table>
  );
}
