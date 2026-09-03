import { CellState, type Board, type BoardsById, type Puzzle } from './types';

interface InteractionState {
  isDragging: boolean;
  dragMoved: boolean;
  mousedownIdx: number;
  mousedownPrevState: CellState;
  isTouch: boolean;
}

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
  interaction: InteractionState;
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
  interaction: {
    isDragging: false,
    dragMoved: false,
    mousedownIdx: -1,
    mousedownPrevState: CellState.EMPTY,
    isTouch: false,
  },
  currentCat: null,
  currentCatPuzzles: null,
};

export const getCurBoard = (): Board => state.boardsById[state.currentBoardId];
export const getCurState = (): CellState[] => state.boardsById[state.currentBoardId].state;
