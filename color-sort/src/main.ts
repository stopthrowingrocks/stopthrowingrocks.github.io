import { Level, levels, Item, RawVial, itemColors } from "./levels.js";
export { Level, levels, Item, RawVial, itemColors } from "./levels.js";
import { GameState, Vial, ItemGroup, Move, TaggedMap, levelToState, stateIdToState, createTaggedMap, getStateId, getValidMovedStates, estimateDifficulty, getValidMoves, calcMove, winCondition, generateRandomPermutation, get_SCCs, computeSuccessProbabilities, getWinningStateId } from "./state.js";
export { GameState, Vial, ItemGroup, Move, TaggedMap, levelToState, createTaggedMap, stateIdToState, getStateId, getValidMovedStates, estimateDifficulty, getValidMoves, calcMove, winCondition, generateRandomPermutation, get_SCCs, computeSuccessProbabilities, getWinningStateId } from "./state.js";
const DEBUG = false;


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
    originalState: GameState
  }
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

export let taggedMap: TaggedMap | undefined;

function getDefaultGameOther(originalState: GameState, settings?: Partial<Game["other"]>): Game["other"] {
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
    originalState: originalState,
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
    other: getDefaultGameOther(state, {
      message: {
        content: "Right click the buttons to read what they do.",
        color: "#888888",
      },
    }),
  };
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
  Game.other = getDefaultGameOther(Game.state, {auto: Game.other.auto});
}

type DOM = {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  images: {
    [a in typeof imgNames[number]]: HTMLImageElement
  }
};

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
const imgNames = ["undo", "restart", "back", "next", "crawl", "web", "smile", "vial", "vial-selected", "dice-six", "question", "hourglass", "file-question"] as const;
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
    ...(taggedMap ? (["web", "smile", "vial", "dice-six"] as const).map((imgName, i) => ({
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
        if (taggedMap === undefined) throw new Error("taggedMap unexpectedly became undefined!");
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
            break;
          }
          case "dice-six": {
            const originalStateId = getStateId(Game.other.originalState);
            const sccs = get_SCCs(originalStateId, taggedMap);
            const successProbabilityMap = computeSuccessProbabilities(taggedMap, sccs, getWinningStateId(Game.state.static));
            Game.other.message = {
              content: `Success probability at current position is ${successProbabilityMap.get(getStateId(Game.state))?.toPrecision(6)}.`,
              color: "#000000",
            };
            break;
          }
        }
      },
      description: {
        "web": "Show winning moves.",
        "smile": "Confirm that the puzzle is still solveable.",
        "vial": "Auto mode. If there is only one winning\nmove, the computer will play it for you.",
        "dice-six": "Calculate (exactly!) the probability of winning after making random moves.",
      }[imgName],
    })): []),
    ...(["hourglass", "question", "undo", "restart", "file-question"] as const).map((imgName, i, arr) => {
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
            case "file-question": {
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
          "file-question": "Create a random level. May not be solveable.",
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
            ctx.fillStyle = itemColors[vial.itemGroups[i].item];
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

export let Game: Game;
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

  Game = loadFirstLevel();
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
