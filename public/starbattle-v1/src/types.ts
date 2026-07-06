export type CellState = 0 | 1 | 2; // 0=empty 1=star 2=elim

export type SplitRole = 'orig' | 'star' | 'elim';

export interface SplitEntry {
  groupId: number;
  idx: number;       // which cell was split
  role: SplitRole;
  origId: number;
  starId: number;
  elimId: number;
}

export interface Board {
  id: number;
  state: CellState[];
  activeSplits: SplitEntry[];
  impossible: boolean;
}

export type BoardsById = Record<number, Board>;

export interface Puzzle {
  name: string;
  categoryIndex: number;
  stars: number;
  size: number;
  regions: number[];
}

// Shape saved to / loaded from localStorage
export interface SavedState {
  boardsById: BoardsById;
  currentBoardId: number;
  boardIdCtr: number;
  groupIdCtr: number;
}

// Shape of entries in levels.json
export interface RawLevel {
  name?: string;
  stars: number;
  size: number;
  shapes: string[];
}
