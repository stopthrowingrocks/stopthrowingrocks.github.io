import type { Board, BoardsById, CellState, Puzzle } from './types';

interface GameState {
  puzzles: Puzzle[];
  puzzle: Puzzle | null;
  boardsById: BoardsById;
  currentBoardId: number;
  boardIdCtr: number;
  groupIdCtr: number;
  splitMode: boolean;
  undoStack: string[];
  redoStack: string[];
  isDragging: boolean;
  dragMoved: boolean;
  mousedownIdx: number;
  mousedownPrev: CellState;
  currentCat: string | null;
  currentCatPuzzles: Puzzle[] | null;
}

export const state: GameState = {
  puzzles: [],
  puzzle: null,
  boardsById: {},
  currentBoardId: 0,
  boardIdCtr: 0,
  groupIdCtr: 0,
  splitMode: false,
  undoStack: [],
  redoStack: [],
  isDragging: false,
  dragMoved: false,
  mousedownIdx: -1,
  mousedownPrev: 0,
  currentCat: null,
  currentCatPuzzles: null,
};

export const curBoard = (): Board => state.boardsById[state.currentBoardId];
export const curState = (): CellState[] => state.boardsById[state.currentBoardId].state;
