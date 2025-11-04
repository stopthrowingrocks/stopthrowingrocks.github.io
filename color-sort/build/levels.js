"use strict";
export const $item = Symbol("item");
export var Item = /* @__PURE__ */ ((Item2) => {
  Item2[Item2["RED"] = 0] = "RED";
  Item2[Item2["ORANGE"] = 1] = "ORANGE";
  Item2[Item2["YELLOW"] = 2] = "YELLOW";
  Item2[Item2["LIME"] = 3] = "LIME";
  Item2[Item2["GREEN"] = 4] = "GREEN";
  Item2[Item2["CYAN"] = 5] = "CYAN";
  Item2[Item2["BLUE"] = 6] = "BLUE";
  Item2[Item2["PURPLE"] = 7] = "PURPLE";
  Item2[Item2["PINK"] = 8] = "PINK";
  return Item2;
})(Item || {});
;
export const levels = [
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
      [7, 8, 1, 1]
    ],
    vial_height: 4,
    empty_vials: 2,
    num_colors: 9
  }
];
