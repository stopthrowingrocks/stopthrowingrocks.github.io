export enum Item {
  RED,
  ORANGE,
  YELLOW,
  LIME,
  GREEN,
  CYAN,
  BLUE,
  PURPLE,
  PINK,
  LAVENDER,
  GREY,
  BROWN,
};
export const itemColors: string[] & {[i in Item]: string} = [
  "#F44336", // 0
  "#FF8400", // 1
  "#FFDE4D", // 2
  "#9DEB44", // 3
  "#06B56C", // 4
  "#54E0FF", // 5
  "#3884ff", // 6
  "#7e1ef8", // 7
  "#ff78b1", // 8
  "#b884ff", // 9
  "#c6c9d2", // 10
  "#9c4900", // 11
];
export type RawVial = Item[];
export type Level = {
  // The start equals the top
  rawvials: RawVial[],
  vial_height: number,
  empty_vials: number,
  num_colors: number,
};

export const levels: Level[] = [
  { // Level 232
    rawvials: [
      [8, 5, 0, 5],
      [1, 0, 2, 3],
      [7, 6, 7, 4],
      [2, 0, 6, 5],
      [4, 3, 3, 3],
      [4, 6, 5, 8],
      [0, 2, 7, 4],
      [2, 8, 1, 6],
      [7, 8, 1, 1],
    ],
    vial_height: 4,
    empty_vials: 2,
    num_colors: 9,
  },
  { // Level 233
    rawvials: [
      [8, 3, 2, 1],
      [1, 3, 0, 0],
      [2, 10, 5, 5],
      [6, 11, 11, 9],
      [0, 6, 10, 8],
      [7, 7, 3, 9],
      [10, 0, 9, 9],
      [4, 10, 5, 4],
      [4, 3, 6, 1],
      [6, 11, 2, 5],
      [11, 1, 8, 7],
      [2, 4, 7, 8],
    ],
    vial_height: 4,
    empty_vials: 2,
    num_colors: 12,
  },
  { // Level 231
    rawvials: [
      [6, 5, 9, 10],
      [2, 7, 0, 8],
      [9, 3, 4, 3],
      [1, 8, 3, 11],
      [2, 7, 1, 0],
      [7, 11, 2, 6],
      [10, 11, 1, 3],
      [11, 9, 9, 0],
      [8, 2, 4, 5],
      [4, 7, 0, 10],
      [4, 8, 5, 10],
      [6, 1, 6, 5],
    ],
    vial_height: 4,
    empty_vials: 2,
    num_colors: 12,
  },
  { // Level 230
    rawvials: [
      [5, 1, 5, 6],
      [3, 1, 6, 3],
      [7, 7, 2, 6],
      [0, 4, 8, 2],
      [4, 3, 2, 5],
      [3, 2, 8, 4],
      [8, 8, 7, 6],
      [0, 0, 5, 1],
      [0, 7, 1, 4],
    ],
    vial_height: 4,
    empty_vials: 2,
    num_colors: 9,
  },
  { // Level 229
    rawvials: [
      [4, 11, 1, 10],
      [7, 5, 6, 10],
      [5, 1, 9, 3],
      [4, 0, 7, 11],
      [4, 5, 3, 3],
      [9, 6, 7, 9],
      [0, 11, 2, 10],
      [2, 8, 8, 6],
      [8, 1, 6, 0],
      [1, 7, 2, 11],
      [10, 8, 4, 2],
      [5, 9, 3, 0],
    ],
    vial_height: 4,
    empty_vials: 2,
    num_colors: 12,
  },
  { // Level 228
    rawvials: [
      [6, 7, 1, 0],
      [6, 7, 3, 4],
      [1, 0, 4, 3],
      [2, 8, 2, 7],
      [4, 5, 1, 2],
      [7, 3, 8, 6],
      [2, 5, 8, 5],
      [0, 4, 0, 1],
      [5, 3, 8, 6],
    ],
    vial_height: 4,
    empty_vials: 2,
    num_colors: 9,
  }
];
