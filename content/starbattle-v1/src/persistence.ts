import type { Puzzle, SavedState } from './types';
import { state } from './state';

export type LevelStatus = 'solved' | 'started' | 'empty';

export function stateKey(p: Puzzle): string {
  return `sb:${p.name.replace(/\s+/g, '_')}:${p.categoryIndex}`;
}

export function saveState(): void {
  if (!state.puzzle) return;
  const { boardsById, currentBoardId, boardIdCtr, groupIdCtr } = state;
  localStorage.setItem(
    stateKey(state.puzzle),
    JSON.stringify({ boardsById, currentBoardId, boardIdCtr, groupIdCtr } satisfies SavedState),
  );
}

export function loadSaved(p: Puzzle): SavedState | null {
  try {
    const raw = localStorage.getItem(stateKey(p));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSaved(p: Puzzle | null): void {
  if (p) localStorage.removeItem(stateKey(p));
}

export function levelStatus(p: Puzzle): LevelStatus {
  const raw = localStorage.getItem(stateKey(p));
  if (!raw) return 'empty';
  try {
    const s: SavedState = JSON.parse(raw);
    const regionCount = new Set(p.regions).size;
    const isSolved = (cells: number[]) => cells.filter(v => v === 1).length === regionCount * p.stars;
    const hasProgress = (cells: number[]) => cells.some(v => v > 0);

    // Any branch being solved counts as solved
    if (Object.values(s.boardsById).some(b => isSolved(b.state))) return 'solved';
    // Otherwise use the active board for started/empty
    const active = s.boardsById[s.currentBoardId];
    if (active && hasProgress(active.state)) return 'started';
  } catch { /* corrupted */ }
  return 'empty';
}
