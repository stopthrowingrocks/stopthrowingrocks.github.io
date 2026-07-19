import { REGION_COLORS, THIN, THICK } from './constants';
import { state, getCurBoard, getCurState } from './state';
import { computeAutoElim, computeConflicts, computeProblematic, checkWin } from './constraints';
import { saveState } from './persistence';
import { CellState, type SplitEntry } from './types';

export function getCellSize(): number {
  const pad = window.innerWidth < 450 ? 12 : 40;
  return Math.max(20, Math.floor(Math.min(window.innerWidth - pad, 500) / state.puzzle!.size));
}

// Blue while all boards are live. Red on the direct-parent board when it is impossible.
// Grey for all other impossible-adjacent and inherited split markers.
function getSplitColor(split: SplitEntry): string {
  const anyImpossible = [split.origId, split.starId, split.elimId]
    .some(id => state.boardsById[id]?.impossible);
  if (!anyImpossible) return "#4fc3f7";

  // The direct parent is the last split entry where this board is the star or elim
  const splits = getCurBoard().activeSplits;
  let directParentGroupId: number | null = null;
  for (let i = splits.length - 1; i >= 0; i--) {
    if (splits[i].role === 'star' || splits[i].role === 'elim') {
      directParentGroupId = splits[i].groupId;
      break;
    }
  }

  if (split.groupId === directParentGroupId && getCurBoard().impossible) return "#e94560";
  return "#888";
}

/** Full teardown-and-rebuild of the board DOM; also syncs #sb-title-row width to the board. */
export function renderTableStructure(): void {
  const cur       = getCurBoard();
  const { size: N, regions: reg } = state.puzzle!;
  const sz        = getCellSize();
  const wrap = document.getElementById("sb-table-wrap")!;

  const splitCellMap: Record<number, SplitEntry> = {};
  for (const split of cur.activeSplits) splitCellMap[split.idx] = split;

  const tbl = document.createElement("table");
  tbl.style.cssText = `border-collapse:collapse;display:block;${state.splitMode ? "cursor:crosshair;" : ""}`;

  for (let r = 0; r < N; r++) {
    const tr = document.createElement("tr");
    for (let c = 0; c < N; c++) {
      const idx = r * N + c;
      const td  = document.createElement("td");
      const spl = splitCellMap[idx];

      const isThick = (side: 'top' | 'left' | 'bottom' | 'right'): boolean => ({
        top:    r === 0     || reg[idx] !== reg[(r - 1) * N + c],
        left:   c === 0     || reg[idx] !== reg[r * N + (c - 1)],
        bottom: r === N - 1 || reg[idx] !== reg[(r + 1) * N + c],
        right:  c === N - 1 || reg[idx] !== reg[r * N + (c + 1)],
      }[side]);

      td.dataset.idx = String(idx);
      td.style.cssText = [
        `width:${sz}px`, `height:${sz}px`,
        `font-size:${Math.round(sz * 0.52)}px`,
        "text-align:center", "vertical-align:middle",
        `cursor:${state.splitMode ? "crosshair" : "pointer"}`,
        "user-select:none", "position:relative",
        `background-color:${REGION_COLORS[reg[idx]] ?? "#ddd"}`,
        `border-top:${    isThick("top")    ? THICK : THIN}`,
        `border-left:${   isThick("left")   ? THICK : THIN}`,
        `border-bottom:${ isThick("bottom") ? THICK : THIN}`,
        `border-right:${  isThick("right")  ? THICK : THIN}`,
        spl ? `outline:2px solid ${getSplitColor(spl)};outline-offset:-2px` : "",
      ].join(";");

      tr.appendChild(td);
    }
    tbl.appendChild(tr);
  }

  wrap.innerHTML = "";
  wrap.appendChild(tbl);

  const titleRow = document.getElementById("sb-title-row");
  if (titleRow) titleRow.style.width = `${N * sz}px`;
}

/** Updates cell content and constraint overlays in-place without rebuilding the table DOM. */
export function updateCellContents(): void {
  const cells     = getCurState();
  const { size: N, regions: reg } = state.puzzle!;
  const sz        = getCellSize();
  const conflicts = computeConflicts();
  const autoElim  = computeAutoElim();
  const { badRows, badCols, badRegs } = computeProblematic(autoElim);
  const wrap = document.getElementById("sb-table-wrap")!;
  const tbl  = wrap.querySelector("table");
  if (!tbl) return;

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const idx = r * N + c;
      const td  = tbl.rows[r]?.cells[c];
      if (!td) continue;

      if (cells[idx] === CellState.STAR) {
        td.textContent = "★";
        td.style.color = conflicts.has(idx) ? "#e94560" : "#111";
      } else if (cells[idx] === CellState.ELIM || autoElim.has(idx)) {
        const isAuto = cells[idx] !== CellState.ELIM;
        const xSz = Math.round(sz * 0.32);
        td.innerHTML =
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="${xSz}" height="${xSz}" ` +
          `style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:block;">` +
          `<path d="M2,2 L8,8 M8,2 L2,8" stroke="rgb(210,40,40)" stroke-width="2.2" stroke-linecap="round" ` +
          `fill="none" opacity="${isAuto ? 0.3 : 0.85}"/>` +
          `</svg>`;
        td.style.color = "";
      } else {
        td.innerHTML = "";
        td.style.color = "";
      }
    }
  }

  addProblemOverlays(wrap, tbl, badRows, badCols, badRegs, N, reg);
}

function addProblemOverlays(
  wrap: HTMLElement,
  tbl: HTMLTableElement,
  badRows: Set<number>,
  badCols: Set<number>,
  badRegs: Set<number>,
  N: number,
  reg: number[],
): void {
  wrap.querySelectorAll(".sb-ov").forEach(e => e.remove());
  if (!badRows.size && !badCols.size && !badRegs.size) return;

  const wr = wrap.getBoundingClientRect();
  const B = 4, C = "#e94560";

  function rectDiv(t: number, l: number, w: number, h: number): void {
    const d = document.createElement("div");
    d.className = "sb-ov";
    d.style.cssText = `position:absolute;pointer-events:none;z-index:3;box-sizing:border-box;` +
      `border:${B}px solid ${C};top:${t}px;left:${l}px;width:${w}px;height:${h}px;`;
    wrap.appendChild(d);
  }
  function hBar(t: number, l: number, w: number): void {
    const d = document.createElement("div");
    d.className = "sb-ov";
    d.style.cssText = `position:absolute;pointer-events:none;z-index:3;background:${C};` +
      `top:${t}px;left:${l}px;width:${w}px;height:${B}px;`;
    wrap.appendChild(d);
  }
  function vBar(l: number, t: number, h: number): void {
    const d = document.createElement("div");
    d.className = "sb-ov";
    d.style.cssText = `position:absolute;pointer-events:none;z-index:3;background:${C};` +
      `left:${l}px;top:${t}px;width:${B}px;height:${h}px;`;
    wrap.appendChild(d);
  }

  for (const r of badRows) {
    const row = tbl.rows[r]; if (!row) continue;
    const rc = row.getBoundingClientRect();
    rectDiv(rc.top - wr.top, rc.left - wr.left, rc.width, rc.height);
  }

  for (const c of badCols) {
    const tc = tbl.rows[0]?.cells[c];
    const bc = tbl.rows[N - 1]?.cells[c];
    if (!tc || !bc) continue;
    const tr = tc.getBoundingClientRect();
    const br = bc.getBoundingClientRect();
    rectDiv(tr.top - wr.top, tr.left - wr.left, tr.width, br.bottom - tr.top);
  }

  // Per-cell per-side bars: adjacent bars overlap at corners so each corner pixel is filled.
  for (let i = 0; i < N * N; i++) {
    if (!badRegs.has(reg[i])) continue;
    const r = Math.floor(i / N), c = i % N;
    const cell = tbl.rows[r]?.cells[c]; if (!cell) continue;
    const cc = cell.getBoundingClientRect();
    const t = cc.top  - wr.top,  l = cc.left   - wr.left;
    const b = cc.bottom - wr.top, ri = cc.right - wr.left;
    if (r === 0     || reg[i] !== reg[(r - 1) * N + c]) hBar(t,      l, ri - l);
    if (r === N - 1 || reg[i] !== reg[(r + 1) * N + c]) hBar(b - B,  l, ri - l);
    if (c === 0     || reg[i] !== reg[r * N + (c - 1)]) vBar(l,      t,  b - t);
    if (c === N - 1 || reg[i] !== reg[r * N + (c + 1)]) vBar(ri - B, t,  b - t);
  }
}

export function renderStatus(): void {
  const el = document.getElementById("sb-status")!;
  if (checkWin()) {
    el.textContent = "Puzzle solved! ★";
    el.className = "win";
    saveState();
  } else {
    const { stars: K, regions } = state.puzzle!;
    const numRegions = new Set(regions).size;
    const starCount  = getCurState().filter(v => v === CellState.STAR).length;
    el.textContent = `Stars placed: ${starCount} / ${numRegions * K}`;
    el.className   = "";
  }
}

export function updateBoardNav(): void {
  const cur    = getCurBoard();
  const splits = cur.activeSplits;
  const label  = document.getElementById("sb-branch-label")!;
  const { size: N } = state.puzzle!;

  const cellLabel = (idx: number): string =>
    String.fromCharCode(65 + idx % N) + (Math.floor(idx / N) + 1);

  const imp = cur.impossible ? "  ✗ impossible" : "";

  let parentSplit: (typeof splits)[number] | null = null;
  for (let i = splits.length - 1; i >= 0; i--) {
    if (splits[i].role === 'star' || splits[i].role === 'elim') { parentSplit = splits[i]; break; }
  }

  if (parentSplit) {
    const subCount = splits.filter(s => s.role === 'orig').length;
    const sub  = subCount ? ` +${subCount} sub-split${subCount !== 1 ? 's' : ''}` : '';
    const role = parentSplit.role === 'star' ? '★ Star' : '· Elim';
    label.textContent = `${role} branch — cell ${cellLabel(parentSplit.idx)}${sub}${imp}`;
    label.className   = cur.impossible ? "impossible" : "live";
  } else if (splits.some(s => s.role === 'orig')) {
    const cells = splits.filter(s => s.role === 'orig').map(s => cellLabel(s.idx)).join(', ');
    label.textContent = `◈ Original — split on ${cells}${imp}`;
    label.className   = cur.impossible ? "impossible" : "live";
  } else {
    label.textContent = cur.impossible ? "✗ impossible" : "";
    label.className   = cur.impossible ? "impossible" : "";
  }
}

export function updatePuzzleNav(): void {
  const prevBtn = document.getElementById("sb-prev-btn") as HTMLButtonElement | null;
  const nextBtn = document.getElementById("sb-next-btn") as HTMLButtonElement | null;
  if (!prevBtn || !nextBtn) return;
  const idx = state.puzzle ? state.puzzles.indexOf(state.puzzle) : -1;
  prevBtn.disabled = idx <= 0;
  nextBtn.disabled = idx < 0 || idx >= state.puzzles.length - 1;
}

export function refresh(): void {
  renderTableStructure(); updateCellContents(); renderStatus(); updateBoardNav(); updatePuzzleNav();
}
