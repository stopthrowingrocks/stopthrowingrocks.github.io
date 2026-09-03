import type { SavedState } from './types';
import { state } from './state';
import { refresh } from './render';
import { saveState } from './persistence';

export function snapshot(): string {
  const { boardsById, currentBoardId, boardIdCtr, groupIdCtr } = state;
  return JSON.stringify({ boardsById, currentBoardId, boardIdCtr, groupIdCtr } satisfies SavedState);
}

export function applySnapshot(snap: string): void {
  const s: SavedState = JSON.parse(snap);
  state.boardsById     = s.boardsById;
  state.currentBoardId = s.currentBoardId;
  state.boardIdCtr     = s.boardIdCtr;
  state.groupIdCtr     = s.groupIdCtr;
}

export function saveUndo(): void {
  state.undoStack.push(snapshot());
  state.redoStack = [];
  if (state.undoStack.length > 60) state.undoStack.shift();
  updateUndoButtons();
}

export function updateUndoButtons(): void {
  const u = document.getElementById("sb-undo-btn") as HTMLButtonElement | null;
  const r = document.getElementById("sb-redo-btn") as HTMLButtonElement | null;
  if (u) u.disabled = !state.undoStack.length;
  if (r) r.disabled = !state.redoStack.length;
}

export function sbUndo(): void {
  if (!state.undoStack.length) return;
  state.redoStack.push(snapshot());
  applySnapshot(state.undoStack.pop()!);
  refresh(); updateUndoButtons(); saveState();
}

export function sbRedo(): void {
  if (!state.redoStack.length) return;
  state.undoStack.push(snapshot());
  applySnapshot(state.redoStack.pop()!);
  refresh(); updateUndoButtons(); saveState();
}
