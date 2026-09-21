"use strict";
var exports = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/levels.ts
  var levels_exports = {};
  __export(levels_exports, {
    Item: () => Item,
    itemColors: () => itemColors,
    levels: () => levels
  });
  var Item = /* @__PURE__ */ ((Item2) => {
    Item2[Item2["RED"] = 0] = "RED";
    Item2[Item2["ORANGE"] = 1] = "ORANGE";
    Item2[Item2["YELLOW"] = 2] = "YELLOW";
    Item2[Item2["LIME"] = 3] = "LIME";
    Item2[Item2["GREEN"] = 4] = "GREEN";
    Item2[Item2["CYAN"] = 5] = "CYAN";
    Item2[Item2["BLUE"] = 6] = "BLUE";
    Item2[Item2["PURPLE"] = 7] = "PURPLE";
    Item2[Item2["PINK"] = 8] = "PINK";
    Item2[Item2["LAVENDER"] = 9] = "LAVENDER";
    Item2[Item2["GREY"] = 10] = "GREY";
    Item2[Item2["BROWN"] = 11] = "BROWN";
    return Item2;
  })(Item || {});
  var itemColors = [
    "#F44336",
    // 0
    "#FF8400",
    // 1
    "#FFDE4D",
    // 2
    "#9DEB44",
    // 3
    "#06B56C",
    // 4
    "#54E0FF",
    // 5
    "#3884ff",
    // 6
    "#7e1ef8",
    // 7
    "#ff78b1",
    // 8
    "#b884ff",
    // 9
    "#c6c9d2",
    // 10
    "#9c4900"
    // 11
  ];
  var levels = [
    {
      // Level 232
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
    },
    {
      // Level 233
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
        [2, 4, 7, 8]
      ],
      vial_height: 4,
      empty_vials: 2,
      num_colors: 12
    },
    {
      // Level 231
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
        [6, 1, 6, 5]
      ],
      vial_height: 4,
      empty_vials: 2,
      num_colors: 12
    },
    {
      // Level 230
      rawvials: [
        [5, 1, 5, 6],
        [3, 1, 6, 3],
        [7, 7, 2, 6],
        [0, 4, 8, 2],
        [4, 3, 2, 5],
        [3, 2, 8, 4],
        [8, 8, 7, 6],
        [0, 0, 5, 1],
        [0, 7, 1, 4]
      ],
      vial_height: 4,
      empty_vials: 2,
      num_colors: 9
    },
    {
      // Level 229
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
        [5, 9, 3, 0]
      ],
      vial_height: 4,
      empty_vials: 2,
      num_colors: 12
    },
    {
      // Level 228
      rawvials: [
        [6, 7, 1, 0],
        [6, 7, 3, 4],
        [1, 0, 4, 3],
        [2, 8, 2, 7],
        [4, 5, 1, 2],
        [7, 3, 8, 6],
        [2, 5, 8, 5],
        [0, 4, 0, 1],
        [5, 3, 8, 6]
      ],
      vial_height: 4,
      empty_vials: 2,
      num_colors: 9
    }
  ];
  return __toCommonJS(levels_exports);
})();
