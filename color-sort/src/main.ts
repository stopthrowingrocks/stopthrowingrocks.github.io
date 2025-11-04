import {Item, Level, levels, RawVial} from "./levels.js";

const DEBUG = false;

type ItemGroup = {
  item: Item,
  count: number,
};
// Add/remove from the start
type Vial = {
  itemGroups: ItemGroup[],
  height: number,
};
type GameState = {
  vials: Vial[]
  static: {
    vial_height: number
    num_colors: number
    empty_vials: number
  }
};

function copyVial(vial: Vial): Vial {
  return {
    itemGroups: vial.itemGroups.map(itemGroup => ({item: itemGroup.item, count: itemGroup.count})),
    height: vial.height,
  };
}

function copyStateWithNewVials(state: GameState, newVials: {idx: number, vial: Vial}[]): GameState {
  return {
    vials: state.vials.map((vial, idx) => {
      const newVial_idx = newVials.findIndex(obj => obj.idx === idx);
      if (newVial_idx === -1) return vial;
      else return newVials[newVial_idx].vial;
    }),
    static: state.static,
  };
}

function stateToRawVials(state: GameState): RawVial[] {
  return state.vials.map(vial => vial.itemGroups.flatMap(itemGroup =>
    Array.from({length: itemGroup.count}, () => itemGroup.item))
  );
}
function getStateId(state: GameState): string {
  const rawvials = stateToRawVials(state);
  rawvials.sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  });
  return rawvials.map(rawvial => rawvial.join(",")).join(";");
}
function getWinningStateId(stat: GameState["static"]) {
  const vials: Vial[] = [
    ...Array.from({length: stat.num_colors}, (_, i) => ({
      itemGroups: [{
        item: i,
        count: stat.vial_height
      }],
      height: stat.vial_height,
    })),
    ...Array.from({length: stat.empty_vials}, () => ({itemGroups: [], height: 0})),
  ];
  return getStateId({vials, static: stat});
}

function stateEq(state1: GameState, state2: GameState): boolean {
  return getStateId(state1) === getStateId(state2);
}

type Move = {
  vialIdx_src: number,
  vialIdx_dst: number,
};
function getValidMoves(state: GameState): Move[] {
  // Plan of attack: First sort all vials by color of top, including empty
  const emptyVialIdxs: number[] = [];
  const vialIdxss: number[][] = Array.from({length: state.static.num_colors}, () => []);
  for (let i = 0; i < state.vials.length; i ++) {
    const vial = state.vials[i];
    if (vial.height === 0) {
      emptyVialIdxs.push(i);
    } else {
      vialIdxss[vial.itemGroups[0].item].push(i);
    }
  }

  const validMoves: Move[] = [];
  for (let color = 0; color < state.static.num_colors; color ++) {
    const vialIdxs = vialIdxss[color];
    for (let src_i = 0; src_i < vialIdxs.length; src_i ++) {
      for (let dst_i = 0; dst_i < vialIdxs.length; dst_i ++) {
        const vialIdx_src = vialIdxs[src_i];
        const vialIdx_dst = vialIdxs[dst_i];
        if (vialIdx_src === vialIdx_dst) continue;

        // For each vial, if it is already at the maximum height it cannot be a valid destination target
        if (state.vials[vialIdx_dst].height === state.static.vial_height) continue;

        validMoves.push({vialIdx_src, vialIdx_dst});
      }
    }
  }

  // If there is at least one empty vial, pick the first one and generate all moves into it from unsorted vials
  if (emptyVialIdxs.length > 0) {
    for (let color = 0; color < state.static.num_colors; color ++) {
      const vialIdxs = vialIdxss[color];
      for (let src_i = 0; src_i < vialIdxs.length; src_i ++) {
        const vialIdx_src = vialIdxs[src_i];

        // If the vial is already sorted, there's no value in moving it
        if (state.vials[vialIdx_src].itemGroups.length === 1) continue;

        validMoves.push({vialIdx_src, vialIdx_dst: emptyVialIdxs[0]});
      }
    }
  }

  return validMoves;
}

type MovedState = {
  move: Move
  state: GameState
  id: string
};
function getValidMovedStates(state: GameState): MovedState[] {
  const validMoves = getValidMoves(state);
  return validMoves.map((move: Move): MovedState => {
    const moveResult = calcMove(state, move);
    if (moveResult.type === "error") throw new Error(moveResult.message);
    const {newState} = moveResult;
    const newStateId = getStateId(newState);
    return {
      move,
      state: newState,
      id: newStateId,
    };
  });
}

type MoveResult = {
  type: "success",
  newState: GameState,
} | {
  type: "error",
  message: string,
};
export function calcMove(state: GameState, move: Move): MoveResult {
  const vial_src = state.vials[move.vialIdx_src];
  const vial_dst = state.vials[move.vialIdx_dst];
  if (vial_src.height === 0) {
    return {
      type: "error",
      message: "Nothing to move!",
    };
  }
  const move_itemGroup = vial_src.itemGroups[0];
  const dst_empty = vial_dst.height === 0;
  if (!dst_empty && vial_dst.itemGroups[0].item !== move_itemGroup.item) {
    return {
      type: "error",
      message: "Wrong color on top of the new vial!",
    };
  }
  const items_to_move = Math.min(state.static.vial_height - vial_dst.height, move_itemGroup.count);
  if (items_to_move === 0) {
    return {
      type: "error",
      message: "No space in vial!",
    };
  }

  const new_vial_src = copyVial(vial_src);
  new_vial_src.height -= items_to_move;
  new_vial_src.itemGroups[0].count -= items_to_move;
  if (new_vial_src.itemGroups[0].count === 0) {
    new_vial_src.itemGroups.shift();
  }

  const new_vial_dst = copyVial(vial_dst);
  new_vial_dst.height += items_to_move;
  if (dst_empty) {
    new_vial_dst.itemGroups = [{
      item: move_itemGroup.item,
      count: items_to_move,
    }];
  } else {
    new_vial_dst.itemGroups[0] = {
      item: move_itemGroup.item,
      count: new_vial_dst.itemGroups[0].count + items_to_move,
    }
  }

  const newState = copyStateWithNewVials(state, [
    {
      idx: move.vialIdx_src,
      vial: new_vial_src,
    },
    {
      idx: move.vialIdx_dst,
      vial: new_vial_dst,
    },
  ]);
  return {
    type: "success",
    newState,
  };
}
function doMove(Game: Game, move: Move): void {
  const moveResult = calcMove(Game.state, move);
  if (moveResult.type === "success") {
    Game.history.push(Game.state);
    Game.state = moveResult.newState;
    if (winCondition(Game.state)) {
      Game.other.won = true;
      Game.other.message = {
        content: "You won!",
        color: "#008800",
      };
    }
  } else {
    Game.other.message = {
      content: moveResult.message,
      color: "#cc0000",
    };
  }
}

// type CrawlNode = {
//   state: GameState
//   stateId: string
//   depth: number
// };
// type CrawlWeb = Map<string, {id: string, move: Move}[]>;
// type Crawler = {
//   parents: CrawlWeb
//   frontier: CrawlNode[]
// };
// /**
//  * @returns If the crawler is finished.
//  */
// function crawl(crw: Crawler, num_steps: number, terminate_if_won: boolean = false): void {
//   while (num_steps > 0) {
//     const node = crw.frontier.shift();
//     if (node === undefined) {
//       return;
//     }
//     const newNodes: CrawlNode[] = getValidMovedStates(node.state).flatMap((movedState: MovedState): CrawlNode[] => {
//       const parents = crw.parents.get(movedState.id);
//       if (parents !== undefined) {
//         parents.push({
//           id: node.stateId,
//           move: movedState.move,
//         });
//         return [];
//       }
//       crw.parents.set(movedState.id, [{
//         id: node.stateId,
//         move: movedState.move,
//       }]);

//       return [{
//         state: movedState.state,
//         stateId: movedState.id,
//         depth: node.depth + 1,
//       }];
//     });
//     crw.frontier.push(...newNodes);
//     if (terminate_if_won) {
//       if (newNodes.some(node => winCondition(node.state))) return;
//     }
//     num_steps --;
//   }
// }
// function backcrawl(crw: Crawler, ids: string[]): CrawlWeb {
//   const backweb = new Map();
//   const ids_ = ids.map(id => id);
//   const seen_ids: Set<string> = new Set();

//   let id: string | undefined;
//   while ((id = ids_.shift())) {
//     if (seen_ids.has(id)) continue;
//     seen_ids.add(id);
//     if (id === getStateId(originalState)) break;
//     const succs = crw.parents.get(id);
//     if (succs === undefined) {
//       console.error(`Didn't get successors for ${id}`)
//       continue;
//     }
//     backweb.set(id, succs);
//     ids_.push(...succs.map(succ => succ.id));
//   }

//   return backweb;
// }

type TaggedNode = {
  state: GameState
  distanceFromStart: number
  distanceFromWin: number | undefined // If unwinnable, this is null
  parents: {id: string, move: Move}[]
  children: {id: string, move: Move}[]
};
type TaggedMap = Map<string, TaggedNode>;
let taggedMap: TaggedMap | undefined;
function createTaggedMap(originalState: GameState): TaggedMap {
  const originalStateId = getStateId(originalState);
  const tempArr: {
    id: string
    state: GameState
    distanceFromStart: number
    children: {id: string, move: Move}[]
  }[] = [];
  const parentsMap: Map<string, {id: string, move: Move}[]> = new Map();
  const temp_parents_nodes = [{
    id: originalStateId,
    state: originalState,
    distanceFromStart: 0,
  }];
  type temp_parents_node = typeof temp_parents_nodes[number];

  // Compute the parents map
  let maybe_node: typeof temp_parents_nodes[number] | undefined;
  while ((maybe_node = temp_parents_nodes.shift())) {
    const node = maybe_node;
    const validMovedStates = getValidMovedStates(node.state);

    // This will come in handy later
    tempArr.push({
      id: node.id,
      state: node.state,
      distanceFromStart: node.distanceFromStart,
      children: validMovedStates.map(movedState => ({
        id: movedState.id,
        move: movedState.move,
      }))
    });

    temp_parents_nodes.push(...validMovedStates.flatMap((movedState: MovedState): temp_parents_node[] => {
      const parents = parentsMap.get(movedState.id);
      if (parents !== undefined) {
        parents.push({
          id: node.id,
          move: movedState.move,
        });
        return [];
      }
      parentsMap.set(movedState.id, [{
        id: node.id,
        move: movedState.move,
      }]);

      return [{
        state: movedState.state,
        id: movedState.id,
        distanceFromStart: node.distanceFromStart + 1,
      }];
    }));
  }

  // The frontier has now been exhausted
  // It is now time to compute which states are winnable

  const temp_bwnodes = [{
    id: getWinningStateId(originalState.static),
    distanceFromWin: 0,
  }];
  type temp_bwnode = typeof temp_bwnodes[number];
  const distanceFromWinMap: Map<string, number> = new Map();

  let maybe_bwnode: temp_bwnode | undefined;
  while ((maybe_bwnode = temp_bwnodes.shift())) {
    const bwnode = maybe_bwnode;
    if (distanceFromWinMap.has(bwnode.id)) continue;
    distanceFromWinMap.set(bwnode.id, bwnode.distanceFromWin);
    const parents = parentsMap.get(bwnode.id);
    if (parents !== undefined) {
      temp_bwnodes.push(...parents.map(parent => ({
        id: parent.id,
        distanceFromWin: bwnode.distanceFromWin + 1,
      })));
    }
  }

  // Sort tempArr from highest distanceFromStart to lowest
  // Maybe eventually a difficulty calculation would go here
  tempArr.sort((a, b) => b.distanceFromStart - a.distanceFromStart);
  const taggedMap: TaggedMap = new Map();
  for (let i = 0; i < tempArr.length; i++) {
    const {id, state, distanceFromStart, children} = tempArr[i];
    const distanceFromWin = distanceFromWinMap.get(id);
    taggedMap.set(id, {
      state,
      distanceFromStart,
      children,
      parents: parentsMap.get(id) || [],
      distanceFromWin,
    })
  }
  return taggedMap;
}

type SolveResult = {
  type: "success"
} | {
  type: "failure"
};
function solve(state: GameState, seen_ids: Set<string> = new Set()): SolveResult {
  if (winCondition(state)) {
    return {
      type: "success",
    };
  }
  const id = getStateId(state);
  if (seen_ids.has(id)) {
    // This must be a dead or recurrent node, it would've returned success if it could have
    return {
      type: "failure",
    };
  }
  seen_ids.add(id);
  const validMoves = getValidMoves(state);
  const permutation = generateRandomPermutation(validMoves.length);
  for (let i = 0; i < permutation.length; i++) {
    const moveResult = calcMove(state, validMoves[permutation[i]]);
    if (moveResult.type === "error") throw new Error(moveResult.message);
    const {newState} = moveResult;
    const solveResult = solve(newState, seen_ids);
    if (solveResult.type === "success") {
      return {
        type: "success",
      };
    }
  }
  return {
    type: "failure",
  };
}
function estimateDifficulty(state: GameState, seen_ids: Set<string> = new Set()): {difficulty: number, success: boolean} {
  if (winCondition(state)) {
    return {
      success: true,
      difficulty: 0, // Whatever value we put here will always adjust the estimate by an equal amount
    };
  }
  const id = getStateId(state);
  if (seen_ids.has(id)) {
    // This must be a dead or recurrent node, it would've returned success if it could have
    return {
      success: false, // Make sure to backtrack here
      difficulty: 1, // We should still penalize the lookup
    };
  }
  seen_ids.add(id);
  const validMoves = getValidMoves(state);
  const permutation = generateRandomPermutation(validMoves.length);
  let difficulty = 1;
  for (let i = 0; i < permutation.length; i++) {
    const moveResult = calcMove(state, validMoves[permutation[i]]);
    if (moveResult.type === "error") throw new Error(moveResult.message);
    const {newState} = moveResult;
    const difficultyResult = estimateDifficulty(newState, seen_ids);
    difficulty += difficultyResult.difficulty;
    if (difficultyResult.success) {
      return {
        success: true,
        difficulty,
      };
    }
  }
  return {
    success: false,
    difficulty,
  };
}

type DOM = {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  images: {
    [a in typeof imgNames[number]]: HTMLImageElement
  }
};

const vialColors = [
  "#F44336", // 0
  "#FF8400", // 1
  "#FFDE4D", // 2
  "#9DEB44", // 3
  "#06B56C", // 4
  "#54E0FF", // 5
  "#3870FF", // 6
  "#A563FA", // 7
  "#FFA1C8", // 8
];

const canvasWidth = 800;
const canvasHeight = 300;

type Button = {
  draw: (ctx: CanvasRenderingContext2D) => void
  x: number
  y: number
  w: number
  h: number
  onclick: (DOM: DOM, Game: Game) => void
  description: string
};
const imgNames = ["undo", "restart", "back", "next", "crawl", "web", "smile", "vial", "vial-selected", "dice-six", "question", "hourglass"] as const;
function getButtons(images: DOM["images"], Game: Game): Button[] {
  const buttonSize = 48;
  const buttonMargin = 8;
  return [
    {
      x: (buttonSize + 2 * buttonMargin) * 0 + buttonMargin,
      y: buttonMargin,
      w: buttonSize,
      h: buttonSize,
      draw(ctx: CanvasRenderingContext2D): void {
        ctx.drawImage(images["crawl"], this.x, this.y, this.w, this.h);
      },
      onclick(DOM: DOM, Game: Game): void {
        const originalState = levelToState(Game.level)
        taggedMap = createTaggedMap(originalState);
        if (taggedMap.get(getStateId(originalState))?.distanceFromWin !== undefined) {
          Game.other.message = {
            content: `Finished crawling! Game is winnable.`,
            color: "#000000",
          }
        } else {
          Game.other.message = {
            content: `Finished crawling! There is no solution. Womp womp.`,
            color: "#000000",
          }
        }
      },
      description: "The computer crawls the puzzle, unlocking advanced tools.",
    },
    ...(taggedMap ? (["web", "smile", "vial"] as const).map((imgName, i) => ({
      x: (buttonSize + 2 * buttonMargin) * (i + 1) + buttonMargin,
      y: buttonMargin,
      w: buttonSize,
      h: buttonSize,
      draw(ctx: CanvasRenderingContext2D): void {
        ctx.drawImage(images[
          imgName === "vial"
            ? Game.other.auto ? "vial-selected" : "vial"
          : imgName
        ], this.x, this.y, this.w, this.h);
      },
      onclick(DOM: DOM, Game: Game): void {
        const winningMoves = getValidMovedStates(Game.state)
          .filter(movedState => taggedMap?.get(movedState.id)?.distanceFromWin !== undefined)
          .map(movedState => movedState.move);
        switch(imgName) {
          case "web": {
            if (Game.other.vial_selected === null) {
              Game.other.vials_highlighted = winningMoves.map(move => move.vialIdx_src);
            } else {
              Game.other.vials_highlighted = winningMoves
                .filter(move => move.vialIdx_src === Game.other.vial_selected)
                .map(move => move.vialIdx_dst);
            }
            Game.other.vial_highlight_color = "#aaffaa";
            break;
          }
          case "smile": {
            // if (backweb?.has(getStateId(Game.state))) {
            if (winningMoves.length > 0) {
              Game.other.message = {
                content: "There is still a victory path.",
                color: "#000000",
              };
            } else {
              Game.other.message = {
                content: "There is no victory path anymore!",
                color: "#cc0000",
              };
            }
            break;
          }
          case "vial": {
            Game.other.auto = !Game.other.auto;
            Game.other.message = {
              content: `Auto mode ${Game.other.auto ? "enabled" : "disabled"}.`,
              color: "#000000",
            };
            while (true) {
              const uniqueWinningMoves = getValidMovedStates(Game.state)
                .filter(movedState => taggedMap?.get(movedState.id)?.distanceFromWin !== undefined)
                .filter((movedState, i, arr) => arr.findIndex(movedState2 => movedState2.id === movedState.id) === i)
                .map(movedState => movedState.move);
              if (uniqueWinningMoves.length !== 1) break;
              doMove(Game, uniqueWinningMoves[0]);
            }
          }
        }
      },
      description: {
        "web": "Show winning moves.",
        "smile": "Confirm that the puzzle is still solveable.",
        "vial": "Auto mode. If there is only one winning\nmove, the computer will play it for you.",
      }[imgName],
    })): []),
    ...(["hourglass", "question", "undo", "restart", "dice-six"] as const).map((imgName, i, arr) => {
      const img = images[imgName];

      return {
        x: canvasWidth + (buttonSize + 2 * buttonMargin) * (i - arr.length) + buttonMargin,
        y: buttonMargin,
        w: buttonSize,
        h: buttonSize,
        draw(ctx: CanvasRenderingContext2D): void {
          ctx.drawImage(img, this.x, this.y, this.w, this.h);
        },
        onclick(DOM: DOM, Game: Game): void {
          switch (imgName) {
            case "hourglass": {
              let difficulty_sum = 0;
              let sq_sum = 0;
              const tolerance = 0.02;
              let estimatedDifficulty: number;
              let stdError: number;
              let num_trials = 0;
              while (true) {
                const difficultyResult = estimateDifficulty(Game.state);
                num_trials ++;
                difficulty_sum += difficultyResult.difficulty;
                sq_sum += difficultyResult.difficulty ** 2;
                estimatedDifficulty = difficulty_sum / num_trials;
                stdError = Math.sqrt((sq_sum / num_trials - estimatedDifficulty ** 2) / (num_trials - 1));
                if (tolerance * estimatedDifficulty >= stdError) {
                  break;
                }
              }
              Game.other.message = {
                content: `Estimated difficulty is ${estimatedDifficulty.toPrecision(4)} +/- ${stdError.toPrecision(4)}.`,
                color: "#000000",
              };
              break;
            }
            case "question": {
              const validMoves = getValidMoves(Game.state);
              if (Game.other.vial_selected === null) {
                Game.other.vials_highlighted = validMoves.map(move => move.vialIdx_src);
              } else {
                Game.other.vials_highlighted = validMoves
                  .filter(move => move.vialIdx_src === Game.other.vial_selected)
                  .map(move => move.vialIdx_dst);
              }
              Game.other.vial_highlight_color = "#aaaaaa";
              break;
            }
            case "undo": {
              if (Game.history.length > 0) {
                Game.state = Game.history.pop()!;
              }
              break;
            }
            case "restart": {
              loadLevel(Game, Game.level);
              break;
            }
            case "dice-six": {
              const randomLevel = generateRandomLevel();
              if (randomLevel !== null) {
                taggedMap = undefined;
                loadLevel(Game, randomLevel);
              }
            }
          }
        },
        description: {
          "hourglass": "Estimate the average number of moves to win.",
          "question": "Highlight available moves.",
          "undo": "Undo the previous move.",
          "restart": "Restart the puzzle.",
          "dice-six": "Create a random level. May not be solveable.",
        }[imgName],
      };
    }),
    ...Game.state.vials.map((vial, i) => {
      const vialBorder = 4;
      const itemWidth = 40;
      const itemHeight = 40;
      const vialMargin = 8;

      const x = canvasWidth / 2 + (i - Game.state.vials.length / 2) * (2 * vialMargin + 2 * vialBorder + itemWidth) + vialMargin;
      const y = canvasHeight / 2 - vialBorder - Game.state.static.vial_height * itemHeight / 2;
      const w = vialBorder * 2 + itemWidth;
      const h = 2 * vialBorder + Game.state.static.vial_height * itemHeight;

      return {
        x, y, w, h,
        draw(ctx: CanvasRenderingContext2D): void {
          ctx.fillStyle = "#000000";
          ctx.fillRect(x, y, vialBorder, h);
          ctx.fillRect(x + vialBorder + itemWidth, y, vialBorder, h);
          ctx.fillRect(x, y + h - vialBorder, w, vialBorder);

          if (Game.other.vial_selected === i) {
            ctx.fillStyle = "#aaaaaa";
            ctx.fillRect(x - vialBorder, y - vialBorder, vialBorder, h + 2 * vialBorder);
            ctx.fillRect(x - vialBorder, y - vialBorder, w + 2 * vialBorder, vialBorder);
            ctx.fillRect(x + w, y - vialBorder, vialBorder, h + 2 * vialBorder);
            ctx.fillRect(x - vialBorder, y + h, w + 2 * vialBorder, vialBorder);
          }

          if (Game.other.vials_highlighted.includes(i)) {
            ctx.fillStyle = Game.other.vial_highlight_color;
            ctx.fillRect(x, y + h + vialBorder, w, vialBorder);
          }

          let vialTopItem = y + h - vialBorder - vial.height * itemHeight;
          for (let i = 0; i < vial.itemGroups.length; i++) {
            ctx.fillStyle = vialColors[vial.itemGroups[i].item];
            const itemsHeight = itemHeight * vial.itemGroups[i].count;
            ctx.fillRect(x + vialBorder, vialTopItem, itemWidth, itemsHeight);
            vialTopItem += itemsHeight;
          }
        },
        onclick(DOM: DOM, Game: Game): void {
          if (Game.other.vial_selected === i) {
            Game.other.vial_selected = null;
          } else if (Game.other.vial_selected === null) {
            if (vial.height !== 0) {
              Game.other.vial_selected = i;
            }
          } else {
            doMove(Game, {vialIdx_src: Game.other.vial_selected, vialIdx_dst: i});
            if (Game.other.auto) {
              while (true) {
                const uniqueWinningMoves = getValidMovedStates(Game.state)
                  .filter(movedState => taggedMap?.get(movedState.id)?.distanceFromWin !== undefined)
                  .filter((movedState, i, arr) => arr.findIndex(movedState2 => movedState2.id === movedState.id) === i)
                  .map(movedState => movedState.move);
                console.log(uniqueWinningMoves);
                if (uniqueWinningMoves.length !== 1) break;
                doMove(Game, uniqueWinningMoves[0]);
              }
            }
            Game.other.vial_selected = null;
          }
        },
        description: "",
      }
    }),
  ];
}
function draw(DOM: DOM, Game: Game): void {
  const buttons = getButtons(DOM.images, Game);
  DOM.ctx.fillStyle = "#ffffff";
  DOM.ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  for (let i = 0; i < buttons.length; i++) {
    buttons[i].draw(DOM.ctx);
  }

  DOM.ctx.fillStyle = Game.other.message.color;
  DOM.ctx.textAlign = "center";
  Game.other.message.content.split("\n").map((line, i, arr) => {
    DOM.ctx.fillText(line, canvasWidth / 2, canvasHeight - 25 * (arr.length - i));
  })
}

/**
 * Converts an abstract level description into a playable GameState
 */
function levelToState(level: Level): GameState {
  const vials: Vial[] = [];
  for (let i = 0; i < level.rawvials.length; i ++) {
    let item: Item | null = null;
    let count: number = 0;
    const vial: Vial = {
      itemGroups: [],
      height: level.rawvials[i].length,
    };
    if (level.rawvials[i].length > level.vial_height) {
      console.error(`Vial ${i} height exceeds maximum vial height ${level.vial_height}`);
    }
    for (let j = 0; j < level.rawvials[i].length; j ++) {
      if (item === level.rawvials[i][j]) {
        count ++;
      } else {
        if (item !== null) {
          // Commit itemGroup
          vial.itemGroups.push({item, count});
        }
        item = level.rawvials[i][j];
        count = 1;
      }
    }
    // Commit itemGroup
    if (item !== null) vial.itemGroups.push({item, count});
    vials.push(vial);
  }
  for (let i = 0; i < level.empty_vials; i ++) {
    vials.push({itemGroups: [], height: 0});
  }
  return {vials, static: {
    vial_height: level.vial_height,
    num_colors: level.num_colors,
    empty_vials: level.empty_vials,
  }};
}

function fetchLevel(levelNumber: number): Level {
  return levels[levelNumber - 1];
}

type Game = {
  level: Level
  state: GameState
  history: GameState[] // Does not store the current state
  other: {
    vial_selected: number | null
    message: {
      content: string
      color: string
    }
    won: boolean
    vials_highlighted: number[]
    vial_highlight_color: string
    auto: boolean
  }
}
function winCondition(state: GameState): boolean {
  for (let i = 0; i < state.vials.length; i++) {
    if (state.vials[i].itemGroups.length === 1) {
      if (state.vials[i].itemGroups[0].count === state.static.vial_height) {
        continue;
      } else {
        return false;
      }
    } else {
      if (state.vials[i].itemGroups.length === 0) {
        continue;
      } else {
        return false;
      }
    }
  }
  return true;
}
function getDefaultGameOther(settings?: Partial<Game["other"]>): Game["other"] {
  return {
    vial_selected: null,
    message: settings?.message || {
      content: "",
      color: "#000",
    },
    won: false,
    vials_highlighted: [],
    vial_highlight_color: "#000000",
    auto: settings?.auto || false,
  };
}
// I dislike that the functions loadFirstLevel and loadLevel do effectively the same computations but have different
// formats
function loadFirstLevel(): Game {
  const level = fetchLevel(1);
  const state = levelToState(level);
  return {
    level,
    state,
    history: [],
    other: getDefaultGameOther({
      message: {
        content: "Right click the buttons to read what they do.",
        color: "#888888",
      },
    }),
  };
}

/**
 * Fisher-Yates (Knuth) Algorithm
 */
function generateRandomPermutation(n: number) {
  const permutation = Array.from({ length: n }, (_, i) => i);

  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
  }

  return permutation;
}
function generateRandomLevel(): Level | null {
  let input = prompt("How many colors do you want?");
  if (input === null) return null;
  while (~~input > 9 || ~~input < 0) {
    input = prompt("Unfortunately 9 is the max right now. How many colors do you want?");
    if (input === null) return null;
  }
  const num_colors = ~~input;
  const vial_height = 4;
  const empty_vials = 2;
  const permutation = generateRandomPermutation(num_colors * vial_height).map(v => Math.floor(v / vial_height));
  const rawvials = Array.from({length: num_colors}, (_, i) => permutation.slice(i * vial_height, (i + 1) * vial_height));
  return {
    rawvials,
    vial_height,
    empty_vials,
    num_colors,
  };
}
function loadLevel(Game: Game, level: Level): void {
  Game.level = level;
  Game.state = levelToState(Game.level);
  Game.history = [];
  Game.other = getDefaultGameOther({auto: Game.other.auto});
}

window.addEventListener("load", async function () {
  // document.body.style.background = "linear-gradient(#000, #000414)";
  const canvas = document.getElementsByTagName("canvas")[0];
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  await document.fonts.load("25px Share Tech Mono");
  const DOM: DOM = {
    canvas,
    ctx: canvas.getContext("2d", {alpha: false})!,
    images: await new Promise((resolve, reject) => {
      try {
        const imgObjs = imgNames.map(name => {
          const obj = {
            name,
            resolved: false,
            img: new Image(),
          };
          obj.img.onload = () => {
            // console.log(`Loaded image ${name}`);
            obj.resolved = true;
            if (imgObjs.every(obj => obj.resolved)) {
              resolve(Object.fromEntries(imgObjs.map(imgObj => [imgObj.name, imgObj.img])) as never);
            }
          }
          return obj;
        });
        imgObjs.forEach(imgObj => {
          imgObj.img.src = `images/${imgObj.name}.svg`;
        });
      } catch (e) {
        reject(e);
      }
    }),
  };
  document.getElementById("load")!.hidden = true;
  document.getElementById("gm-container")!.hidden = false;
  DOM.ctx.textBaseline = "top";
  DOM.ctx.font = "25px Share Tech Mono";

  const Game: Game = loadFirstLevel();
  // Don't draw or accept key presses until the fonts have loaded
  draw(DOM, Game);

  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    Game.other.message.content = "";
    Game.other.vials_highlighted = [];
    const buttons = getButtons(DOM.images, Game);
    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i];
      if (button.x <= x && x <= button.x + button.w && button.y <= y && y <= button.y + button.h) {
        button.onclick(DOM, Game);
      }
    }

    draw(DOM, Game);
  });
  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const buttons = getButtons(DOM.images, Game);
    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i];
      if (button.x <= x && x <= button.x + button.w && button.y <= y && y <= button.y + button.h) {
        Game.other.message = {
          content: button.description,
          color: "#888888",
        };
      }
    }

    draw(DOM, Game);
  });
});
