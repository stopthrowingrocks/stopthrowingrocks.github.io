export enum CellState {
  EMPTY,
  STAR,
  ELIM,
};

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
