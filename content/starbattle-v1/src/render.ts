import { REGION_COLORS, THIN, THICK } from './constants';
import { state, curBoard, curState } from './state';
import { computeAutoElim, computeConflicts, computeProblematic, checkWin } from './constraints';
import { saveState } from './persistence';
import type { SplitEntry } from './types';

export function getCellSize(): number {
  const pad = window.innerWidth < 450 ? 12 : 40;
  return Math.max(20, Math.floor(Math.min(window.innerWidth - pad, 520) / state.puzzle!.size));
}

// Blue while all boards are live. Red on the direct-parent board when it is impossible.
// Grey for all other impossible-adjacent and inherited split markers.
function getSplitColor(split: SplitEntry): string {
  const anyImpossible = [split.origId, split.starId, split.elimId]
    .some(id => state.boardsById[id]?.impossible);
  if (!anyImpossible) return "#4fc3f7";

  // The direct parent is the last split entry where this board is the star or elim
  const splits = curBoard().activeSplits;
  let directParentGroupId: number | null = null;
  for (let i = splits.length - 1; i >= 0; i--) {
    if (splits[i].role === 'star' || splits[i].role === 'elim') {
      directParentGroupId = splits[i].groupId;
      break;
    }
  }

  if (split.groupId === directParentGroupId && curBoard().impossible) return "#e94560";
  return "#888";
}

export function buildTable(): void {
  const cells     = curState();
  const cur       = curBoard();
  const { size: N, regions: reg } = state.puzzle!;
  const sz        = getCellSize();
  const conflicts = computeConflicts();
  const autoElim  = computeAutoElim();
  const { badRows, badCols, badRegs } = computeProblematic(autoElim);
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

      if (cells[idx] === 1) {
        td.textContent = "★";
        td.style.color = conflicts.has(idx) ? "#e94560" : "#111";
      } else if (cells[idx] === 2 || autoElim.has(idx)) {
        const dot = document.createElement("span");
        const dotSz = Math.round(sz * 0.18);
        dot.style.cssText = `display:block;width:${dotSz}px;height:${dotSz}px;border-radius:50%;` +
          `background:rgba(0,0,0,${cells[idx] !== 2 ? 0.18 : 0.35});margin:auto;`;
        td.appendChild(dot);
      }

      tr.appendChild(td);
    }
    tbl.appendChild(tr);
  }

  wrap.innerHTML = "";
  wrap.appendChild(tbl);
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
    if (r === 0     || reg[i] !== reg[(r - 1) * N + c]) hBar(t,     l,  ri - l);
    if (r === N - 1 || reg[i] !== reg[(r + 1) * N + c]) hBar(b - B, l,  ri - l);
    if (c === 0     || reg[i] !== reg[r * N + (c - 1)]) vBar(l,      t,  b - t);
    if (c === N - 1 || reg[i] !== reg[r * N + (c + 1)]) vBar(ri - B, t,  b - t);
  }
}

export function updateStatus(): void {
  const el = document.getElementById("sb-status")!;
  if (checkWin()) {
    el.textContent = "Puzzle solved! ★";
    el.className = "win";
    saveState();
  } else {
    const { stars: K, regions } = state.puzzle!;
    const numRegions = new Set(regions).size;
    const starCount  = curState().filter(v => v === 1).length;
    el.textContent = `Stars placed: ${starCount} / ${numRegions * K}`;
    el.className   = "";
  }
}

export function updateBoardNav(): void {
  const cur    = curBoard();
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

export function refresh(): void {
  buildTable(); updateStatus(); updateBoardNav();
}
