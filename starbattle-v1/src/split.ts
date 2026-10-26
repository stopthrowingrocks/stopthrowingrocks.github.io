import { CellState } from './types';
import { state, getCurBoard } from './state';
import { saveUndo } from './undo';
import { refresh } from './render';
import { saveState } from './persistence';

export function exitSplitMode(): void {
  state.splitMode = false;
  document.getElementById("sb-split-btn")?.classList.remove("active");
}

export function sbToggleSplit(): void {
  state.splitMode = !state.splitMode;
  document.getElementById("sb-split-btn")!.classList.toggle("active", state.splitMode);
  refresh(); // rebuild to update cell cursors and outlines
}

export function splitCell(idx: number): void {
  if (getCurBoard().activeSplits.some(s => s.idx === idx)) return;

  saveUndo();
  const cur     = getCurBoard();
  const groupId = state.groupIdCtr++;
  const starId  = state.boardIdCtr++;
  const elimId  = state.boardIdCtr++;

  // Snapshot existing splits so the new child boards inherit the current split context
  const baseSplits = cur.activeSplits.map(s => ({ ...s }));
  const entry = { groupId, idx, origId: state.currentBoardId, starId, elimId };

  cur.activeSplits.push({ ...entry, role: 'orig' });

  const stateStar = cur.state.slice() as CellState[]; stateStar[idx] = CellState.STAR;
  state.boardsById[starId] = {
    id: starId, state: stateStar, impossible: false,
    activeSplits: [...baseSplits, { ...entry, role: 'star' }],
  };

  const stateElim = cur.state.slice() as CellState[]; stateElim[idx] = CellState.ELIM;
  state.boardsById[elimId] = {
    id: elimId, state: stateElim, impossible: false,
    activeSplits: [...baseSplits, { ...entry, role: 'elim' }],
  };

  state.currentBoardId = starId;
  exitSplitMode();
  refresh(); saveState();
}

// Cycle: orig → elim → star → orig (all live), or star ↔ elim (any impossible).
// If currentBoardId is not directly in the triplet (nested sub-branch), fall back to origId.
export function clickSplitCell(groupId: number): void {
  const split = getCurBoard().activeSplits.find(s => s.groupId === groupId);
  if (!split) return;

  const anyImpossible = [split.origId, split.starId, split.elimId]
    .some(id => state.boardsById[id]?.impossible);

  let destId: number;
  if (anyImpossible) {
    if      (state.currentBoardId === split.starId) destId = split.elimId;
    else if (state.currentBoardId === split.elimId) destId = split.starId;
    else destId = split.origId;
  } else {
    const cycle = [split.origId, split.elimId, split.starId];
    const pos   = cycle.indexOf(state.currentBoardId);
    destId = pos === -1 ? split.origId : cycle[(pos + 1) % cycle.length];
  }

  state.currentBoardId = destId;
  refresh();
}

/** Mirror a cell value change from boardId into all its split descendants.
 * Only propagates through splits where this board is the actual originator
 * (split.origId === boardId) — inherited 'orig' entries must not leak to
 * sibling branches created from a different parent.
 */
export function propagateChange(
  boardId: number,
  cellIdx: number,
  value: CellState,
  visited = new Set<number>(),
): void {
  if (visited.has(boardId)) return;
  visited.add(boardId);
  const board = state.boardsById[boardId];
  if (!board) return;

  for (const split of board.activeSplits) {
    if (split.role !== 'orig') continue;
    if (split.origId !== boardId) continue; // inherited entry — not our descendant tree
    if (cellIdx === split.idx) continue;    // never overwrite the locked split cell

    const star = state.boardsById[split.starId];
    const elim = state.boardsById[split.elimId];
    if (star) { star.state[cellIdx] = value; propagateChange(split.starId, cellIdx, value, visited); }
    if (elim) { elim.state[cellIdx] = value; propagateChange(split.elimId, cellIdx, value, visited); }
  }
}

export function sbMarkImpossible(): void {
  saveUndo();
  let id      = state.currentBoardId;
  let navDest = state.currentBoardId;

  // Cascade: when both children of a split are impossible, the parent is too.
  while (id !== null) {
    state.boardsById[id].impossible = true;

    const board = state.boardsById[id];
    let parentSplit: (typeof board.activeSplits)[number] | null = null;
    for (let i = board.activeSplits.length - 1; i >= 0; i--) {
      const s = board.activeSplits[i];
      if (s.role === 'star' || s.role === 'elim') { parentSplit = s; break; }
    }

    if (!parentSplit) { navDest = id; break; } // reached the root

    const sibId   = parentSplit.role === 'star' ? parentSplit.elimId : parentSplit.starId;
    const sibling = state.boardsById[sibId];

    if (sibling?.impossible) {
      id = parentSplit.origId;
      navDest = parentSplit.origId;
    } else {
      navDest = sibId;
      break;
    }
  }

  state.currentBoardId = navDest;
  refresh(); saveState();
}
