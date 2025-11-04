export const $item: unique symbol = Symbol("item");
export enum Item {
  RED,
  ORANGE,
  YELLOW,
  LIME,
  GREEN,
  CYAN,
  BLUE,
  PURPLE,
  PINK
};
export type RawVial = Item[];
export type Level = {
  // The start equals the top
  rawvials: RawVial[],
  vial_height: number,
  empty_vials: number,
  num_colors: number,
};


export const levels: Level[] = [
  {
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
];
