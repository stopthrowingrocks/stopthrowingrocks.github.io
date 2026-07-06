import type { CellState } from './types';
import { state, curBoard, curState } from './state';
import { saveUndo } from './undo';
import { buildTable, updateStatus, getCellSize } from './render';
import { saveState } from './persistence';
import { splitCell, clickSplitCell, propagateChange } from './split';

function paintCell(idx: number, value: CellState): void {
  curState()[idx] = value;
  propagateChange(state.currentBoardId, idx, value);
  buildTable(); updateStatus();
}

export function finishInteraction(): void {
  const { isDragging, dragMoved, mousedownIdx } = state;
  const board = state.boardsById[state.currentBoardId];

  if (board && isDragging && !dragMoved && mousedownIdx !== -1) {
    const spl = board.activeSplits.find(s => s.idx === mousedownIdx);
    if (!spl) {
      // Complete the click cycle: elim→star or star→empty (empty→elim was handled in mousedown)
      if (state.mousedownPrev === 2) paintCell(mousedownIdx, 1);
      else if (state.mousedownPrev === 1) paintCell(mousedownIdx, 0);
    }
  }

  state.isDragging = false;
  state.dragMoved  = false;
  state.mousedownIdx = -1;
  document.getElementById("sb-table-wrap")?.classList.remove("sb-dragging");
  saveState();
}

export function setupInteraction(): void {
  const wrap = document.getElementById("sb-table-wrap")!;

  // ── Mouse ─────────────────────────────────────────────────────────────────

  wrap.addEventListener("mousedown", e => {
    if ((e as MouseEvent).button !== 0) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-idx]");
    if (!el) return;
    e.preventDefault();
    const idx = Number(el.dataset.idx);

    if (state.splitMode) { splitCell(idx); return; }

    const spl = curBoard().activeSplits.find(s => s.idx === idx);
    if (spl) { clickSplitCell(spl.groupId); return; }

    saveUndo();
    state.isDragging   = true;
    state.dragMoved    = false;
    state.mousedownIdx = idx;
    state.mousedownPrev = curState()[idx] as CellState;

    if (curState()[idx] === 0) paintCell(idx, 2);
  });

  wrap.addEventListener("mouseover", e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-idx]");
    if (!el || !state.isDragging) return;
    const idx = Number(el.dataset.idx);
    const spl = curBoard().activeSplits.find(s => s.idx === idx);
    if (idx !== state.mousedownIdx && curState()[idx] === 0 && !spl) {
      state.dragMoved = true;
      wrap.classList.add("sb-dragging");
      paintCell(idx, 2);
    }
  });

  wrap.addEventListener("contextmenu", e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-idx]");
    if (!el) return;
    e.preventDefault();
    splitCell(Number(el.dataset.idx));
  });

  window.addEventListener("mouseup", finishInteraction);

  // ── Touch ─────────────────────────────────────────────────────────────────

  document.addEventListener("touchstart", e => {
    if (!e.touches[0]) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-idx]");
    if (!el) return;
    e.preventDefault();
    const i = Number(el.dataset.idx);

    if (state.splitMode) { splitCell(i); return; }
    const spl = curBoard().activeSplits.find(s => s.idx === i);
    if (spl) { clickSplitCell(spl.groupId); return; }

    saveUndo();
    state.isDragging    = true;
    state.dragMoved     = false;
    state.mousedownIdx  = i;
    state.mousedownPrev = curState()[i] as CellState;
    if (curState()[i] === 0) paintCell(i, 2);
  }, { passive: false });

  document.addEventListener("touchmove", e => {
    if (!state.isDragging || !state.puzzle) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect  = wrap.getBoundingClientRect();
    const sz    = getCellSize();
    const N     = state.puzzle.size;
    const col   = Math.floor((touch.clientX - rect.left) / sz);
    const row   = Math.floor((touch.clientY - rect.top)  / sz);
    if (col < 0 || col >= N || row < 0 || row >= N) return;
    const i   = row * N + col;
    const spl = curBoard().activeSplits.find(s => s.idx === i);
    if (i !== state.mousedownIdx && curState()[i] === 0 && !spl) {
      state.dragMoved = true;
      wrap.classList.add("sb-dragging");
      paintCell(i, 2);
    }
  }, { passive: false });

  document.addEventListener("touchend", finishInteraction);
}
