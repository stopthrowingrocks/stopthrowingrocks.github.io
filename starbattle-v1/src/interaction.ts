import { CellState } from './types';
import { state, getCurBoard, getCurState } from './state';
import { saveUndo } from './undo';
import { updateCellContents, renderStatus } from './render';
import { saveState } from './persistence';
import { splitCell, clickSplitCell, propagateChange } from './split';

function markCellAndRender(idx: number, value: CellState): void {
  getCurState()[idx] = value;
  propagateChange(state.currentBoardId, idx, value);
  updateCellContents(); renderStatus();
}

function getSplitAt(idx: number) {
  return getCurBoard().activeSplits.find(s => s.idx === idx);
}

function beginPress(idx: number, isTouch = false): void {
  if (state.splitMode) { splitCell(idx); return; }
  const spl = getSplitAt(idx);
  if (spl) { clickSplitCell(spl.groupId); return; }

  saveUndo();
  state.interaction.isDragging         = true;
  state.interaction.dragMoved          = false;
  state.interaction.mousedownIdx       = idx;
  state.interaction.mousedownPrevState = getCurState()[idx] as CellState;
  state.interaction.isTouch            = isTouch;
  // Mouse paints immediately; touch defers to avoid destroying the touchstart target element,
  // which would cancel the iOS Safari touch sequence before touchmove fires.
  if (!isTouch && getCurState()[idx] === CellState.EMPTY) markCellAndRender(idx, CellState.ELIM);
}

function continuePress(idx: number, wrap: HTMLElement): void {
  if (idx !== state.interaction.mousedownIdx && getCurState()[idx] === CellState.EMPTY && !getSplitAt(idx)) {
    // On first drag move, also paint the origin cell if it's still empty (touch deferred it).
    if (!state.interaction.dragMoved) {
      const orig = state.interaction.mousedownIdx;
      if (getCurState()[orig] === CellState.EMPTY && !getSplitAt(orig)) {
        getCurState()[orig] = CellState.ELIM;
        propagateChange(state.currentBoardId, orig, CellState.ELIM);
      }
    }
    state.interaction.dragMoved = true;
    wrap.classList.add("sb-dragging");
    markCellAndRender(idx, CellState.ELIM);
  }
}

function endPress(): void {
  const { isDragging, dragMoved, mousedownIdx, mousedownPrevState, isTouch } = state.interaction;
  const board = state.boardsById[state.currentBoardId];

  if (board && isDragging && !dragMoved && mousedownIdx !== -1) {
    if (!getSplitAt(mousedownIdx)) {
      // Complete the click cycle. Touch defers the empty→elim step to here;
      // mouse already painted elim on mousedown so it starts the cycle from elim.
      if (mousedownPrevState === CellState.EMPTY && isTouch) markCellAndRender(mousedownIdx, CellState.ELIM);
      else if (mousedownPrevState === CellState.ELIM) markCellAndRender(mousedownIdx, CellState.STAR);
      else if (mousedownPrevState === CellState.STAR) markCellAndRender(mousedownIdx, CellState.EMPTY);
    }
  } else if (dragMoved) {
    updateCellContents(); renderStatus();
  }

  state.interaction.isDragging   = false;
  state.interaction.dragMoved    = false;
  state.interaction.mousedownIdx = -1;
  document.getElementById("sb-table-wrap")?.classList.remove("sb-dragging");
  saveState();
}

export function addInteractionEventListeners(): void {
  const wrap = document.getElementById("sb-table-wrap")!;

  // ── Mouse ─────────────────────────────────────────────────────────────────

  wrap.addEventListener("mousedown", e => {
    if ((e as MouseEvent).button !== 0) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-idx]");
    if (!el) return;
    e.preventDefault();
    beginPress(Number(el.dataset.idx));
  });

  wrap.addEventListener("mouseover", e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-idx]");
    if (!el || !state.interaction.isDragging) return;
    continuePress(Number(el.dataset.idx), wrap);
  });

  wrap.addEventListener("contextmenu", e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-idx]");
    if (!el) return;
    e.preventDefault();
    splitCell(Number(el.dataset.idx));
  });

  window.addEventListener("mouseup", e => {
    void e;
    endPress();
  });

  // ── Touch ─────────────────────────────────────────────────────────────────

  wrap.addEventListener("touchstart", e => {
    if (!e.touches[0]) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-idx]");
    if (!el) return;
    e.preventDefault();
    beginPress(Number(el.dataset.idx), true);
  }, { passive: false });

  wrap.addEventListener("touchmove", e => {
    if (!state.interaction.isDragging || !state.puzzle) return;
    e.preventDefault();
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const el = target?.closest<HTMLElement>("[data-idx]");
    if (!el) return;
    continuePress(Number(el.dataset.idx), wrap);
   }, { passive: false });

  wrap.addEventListener("touchend", e => {
    void e;
    endPress();
  });
}
