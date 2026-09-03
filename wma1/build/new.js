"use strict";
import { errorLevel, levels } from "./levels.js";
const DEBUG = false;
function eqPos(p1, p2) {
  return p1.x === p2.x && p1.y === p2.y;
}
function posToString(p) {
  return `(${p.x}, ${p.y})`;
}
const floorTag = "=";
const staticEntityTags = [" ", "#", "O", "X", "|", "^", "<", "v", ">", "~", "Q"];
function isStaticEntityTag(s) {
  return staticEntityTags.includes(s);
}
const playerEntityTag = "@";
const dynamicEntityTags = [playerEntityTag, "0"];
function isDynamicEntityTag(s) {
  return dynamicEntityTags.includes(s);
}
function makeEmptyMap(height, width) {
  return Array(height).fill(void 0).map(() => Array(width).fill(null));
}
function writeStaticEntityMap(state, ent) {
  state.staticEntityMap[ent.pos.y][ent.pos.x] = ent.tag;
}
function writeDynamicEntityMap(state, ent) {
  const oldTag = state.dynamicEntityMap[ent.pos.y][ent.pos.x];
  if (oldTag === "@") {
    const plyEntIndex = state.playerEntities.findIndex(
      (plyEnt) => plyEnt.pos.x === ent.pos.x && plyEnt.pos.y === ent.pos.y
    );
    state.playerEntities.splice(plyEntIndex, 1);
  }
  state.dynamicEntityMap[ent.pos.y][ent.pos.x] = ent.tag;
  if (ent.tag === "@") {
    state.playerEntities.push({
      tag: "@",
      pos: ent.pos
    });
  }
}
function copyState(state) {
  return {
    width: state.width,
    height: state.height,
    staticEntityMap: state.staticEntityMap.map((a) => a.map((v) => v)),
    dynamicEntityMap: state.dynamicEntityMap.map((a) => a.map((v) => v)),
    playerEntities: state.playerEntities.map((ent) => ent)
  };
}
function isValidPosition(pos, state) {
  return 0 <= pos.x && pos.x < state.width && 0 <= pos.y && pos.y < state.height;
}
function moveEntity(state, move, ctxt) {
  const { dir, ent: { tag, pos } } = move;
  if (DEBUG) console.log(`Moving ${move.ent.tag} at ${posToString(move.ent.pos)} by ${dirToString(move.dir)}`);
  const movedPos = {
    x: pos.x + dir.dx,
    y: pos.y + dir.dy
  };
  if (!isValidPosition(movedPos, state)) return {
    type: "failure",
    flashPositions: [movedPos]
  };
  if (!ctxt.premoved) writeDynamicEntityMap(state, { tag: null, pos: move.ent.pos });
  if (!ctxt.beenTo) ctxt.beenTo = [];
  if (ctxt.beenTo.some((pos2) => eqPos(movedPos, pos2))) {
    return {
      type: "failure",
      flashPositions: ctxt.beenTo.slice(0)
      // Copy all the positions
    };
  }
  ctxt.beenTo.push(movedPos);
  const moveFirst = ctxt.remainingMoves.findIndex((move2) => eqPos(move2.ent.pos, movedPos));
  if (moveFirst !== -1) {
    return {
      type: "reorder",
      moveIndex: moveFirst
    };
  }
  const pushedTag = state.dynamicEntityMap[movedPos.y][movedPos.x];
  const movedEnt = { tag, pos: movedPos };
  writeDynamicEntityMap(state, movedEnt);
  switch (pushedTag) {
    case "@": {
      return {
        type: "failure",
        flashPositions: [movedPos]
      };
    }
    case "0": {
      return moveEntity(state, {
        dir,
        ent: {
          tag: pushedTag,
          pos: movedPos
        }
      }, { ...ctxt, premoved: true });
    }
    case null: {
      const staticTag = state.staticEntityMap[movedPos.y][movedPos.x];
      switch (staticTag) {
        case " ":
        case "#": {
          return {
            type: "failure",
            flashPositions: [movedPos]
          };
        }
        case "O": {
          writeStaticEntityMap(state, { tag: null, pos: movedPos });
          writeDynamicEntityMap(state, { tag: null, pos: movedPos });
          return {
            type: "success"
          };
        }
        case "X": {
          writeStaticEntityMap(state, { tag: "#", pos: movedPos });
          writeDynamicEntityMap(state, { tag: null, pos: movedPos });
          return {
            type: "success"
          };
        }
        case "|": {
          writeStaticEntityMap(state, { tag: "#", pos: movedPos });
          return {
            type: "success"
          };
        }
        case "^": {
          return {
            type: "success",
            delayedMoves: [{
              dir: DIRS.UP,
              ent: movedEnt
            }]
          };
        }
        case "<": {
          return {
            type: "success",
            delayedMoves: [{
              dir: DIRS.LEFT,
              ent: movedEnt
            }]
          };
        }
        case "v": {
          return {
            type: "success",
            delayedMoves: [{
              dir: DIRS.DOWN,
              ent: movedEnt
            }]
          };
        }
        case ">": {
          return {
            type: "success",
            delayedMoves: [{
              dir: DIRS.RIGHT,
              ent: movedEnt
            }]
          };
        }
        case "~": {
          if (tag === "0") {
            writeStaticEntityMap(state, { tag: "Q", pos: movedPos });
            writeDynamicEntityMap(state, { tag: null, pos: movedPos });
            return {
              type: "success",
              sounds: ["sploosh"]
            };
          }
          return {
            type: "success",
            delayedMoves: [{
              dir,
              ent: {
                tag,
                pos: movedPos
              }
            }]
          };
        }
        case "Q": {
          return {
            type: "success"
          };
        }
        case null: {
          return {
            type: "success"
          };
        }
      }
    }
  }
}
function playerUpdate(state, dir) {
  let newState = copyState(state);
  const delayedMoves = [];
  const sounds = [];
  const moves = state.playerEntities.map((ent) => ({ ent, dir }));
  if (DEBUG) console.log("player update");
  for (let i = 0; i < moves.length; i++) {
    const prevState = copyState(newState);
    const move = moves[i];
    const moveResult = moveEntity(newState, move, {
      remainingMoves: moves.slice(i + 1),
      premoved: false
    });
    if (moveResult.type === "failure") {
      if (DEBUG) console.log("player move failed");
      return null;
    }
    if (moveResult.type === "reorder") {
      const moveIndex = i + 1 + moveResult.moveIndex;
      if (DEBUG) console.log(`need to reorder player move ${moveIndex}`);
      moves.splice(i, 1);
      moves.splice(moveIndex + 1, 0, move);
      newState = prevState;
      i--;
      continue;
    }
    if (moveResult.delayedMoves) delayedMoves.push(...moveResult.delayedMoves);
    if (moveResult.sounds) sounds.push(...moveResult.sounds);
  }
  return { newState, delayedMoves, sounds };
}
function delayedUpdate(state, moves) {
  let newState = state;
  const delayedMoves = [];
  const sounds = [];
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const testState = copyState(newState);
    const moveResult = moveEntity(testState, move, {
      remainingMoves: moves,
      premoved: false
    });
    if (moveResult.type === "failure") break;
    if (moveResult.type === "reorder") {
      console.error("Reordering is not supported right now.");
      break;
    }
    newState = testState;
    if (moveResult.delayedMoves) delayedMoves.push(...moveResult.delayedMoves);
    if (moveResult.sounds) sounds.push(...moveResult.sounds);
  }
  return { newState, delayedMoves, sounds };
}
function getVisibleEntityAt(state, pos) {
  return state.dynamicEntityMap[pos.y][pos.x] || state.staticEntityMap[pos.y][pos.x] || floorTag;
}
const entityColors = {
  "=": "#402411ff",
  "@": "#fae441ff",
  "0": "#9d60edff",
  " ": "#dfdfdfff",
  "#": "#dfdfdfff",
  "O": "#63b9ffff",
  "X": "#2083d3ff",
  "|": "#9966ccff",
  "^": "#969687ff",
  "<": "#969687ff",
  "v": "#969687ff",
  ">": "#969687ff",
  "~": "#0044ddff",
  "Q": "#123c1fff"
};
const tileWidth = 19;
const tileHeight = 27;
function posToCoords(pos, state) {
  return {
    x: (pos.x - state.width / 2) * tileWidth + canvasWidth / 2,
    y: (pos.y - state.height / 2) * tileHeight + canvasHeight / 2
  };
}
const canvasWidth = 500;
const canvasHeight = 300;
function drawState(DOM, state) {
  DOM.ctx.fillStyle = "black";
  DOM.ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  DOM.ctx.fillStyle = "#111111";
  let dx = tileWidth * state.width + 32;
  let dy = tileHeight * state.height + 32;
  DOM.ctx.fillRect(canvasWidth / 2 - dx / 2, canvasHeight / 2 - dy / 2, dx, dy);
  DOM.ctx.fillStyle = "black";
  dx -= 8;
  dy -= 8;
  DOM.ctx.fillRect(canvasWidth / 2 - dx / 2, canvasHeight / 2 - dy / 2, dx, dy);
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const pos = { x, y };
      const cpos = posToCoords(pos, state);
      const entityTag = getVisibleEntityAt(state, pos);
      DOM.ctx.fillStyle = entityColors[entityTag];
      DOM.ctx.fillText(entityTag, cpos.x, cpos.y);
    }
  }
}
function draw(DOM, Game) {
  DOM.levelTitle.innerText = Game.level.title;
  drawState(DOM, Game.state);
}
function levelToState(level) {
  const height = level.map.length;
  const width = level.map[0].length;
  const state = {
    height,
    width,
    staticEntityMap: makeEmptyMap(height, width),
    dynamicEntityMap: makeEmptyMap(height, width),
    playerEntities: []
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const entityTag = level.map[y][x];
      const pos = { x, y };
      if (isStaticEntityTag(entityTag)) {
        writeStaticEntityMap(state, { tag: entityTag, pos });
      }
      if (isDynamicEntityTag(entityTag)) {
        writeDynamicEntityMap(state, { tag: entityTag, pos });
      }
    }
  }
  return state;
}
function stateToLevelMap(state) {
  const map = Array(state.height).fill("");
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      map[y] += getVisibleEntityAt(state, { x, y });
    }
  }
  return map;
}
const KEYS = [
  // There is no consistency check that KEYS has a value for every player action
  {
    name: "UP",
    keys: ["w", "ArrowUp"]
  },
  {
    name: "LEFT",
    keys: ["a", "ArrowLeft"]
  },
  {
    name: "DOWN",
    keys: ["s", "ArrowDown"]
  },
  {
    name: "RIGHT",
    keys: ["d", "ArrowRight"]
  },
  {
    name: "UNDO",
    keys: ["z"]
  },
  {
    name: "RESTART",
    keys: ["r"]
  },
  {
    name: "LEVELUP",
    keys: ["."]
  },
  {
    name: "LEVELDOWN",
    keys: [","]
  }
];
const DIRS = {
  UP: { dx: 0, dy: -1 },
  LEFT: { dx: -1, dy: 0 },
  DOWN: { dx: 0, dy: 1 },
  RIGHT: { dx: 1, dy: 0 }
};
function dirToString(dir) {
  return `(${dir.dx}, ${dir.dy})`;
}
function fetchLevel(levelNumber) {
  if (1 <= levelNumber && levelNumber <= levels.length) {
    return levels[levelNumber - 1];
  } else {
    return errorLevel;
  }
}
function loadFirstLevel(timestamp) {
  const levelNumber = 1;
  const level = fetchLevel(levelNumber);
  const state = levelToState(level);
  return {
    levelNumber,
    level,
    state,
    history: [],
    delayedMoves: [],
    lastUpdateTimestamp: timestamp
  };
}
function loadLevel(Game, levelNumber, timestamp) {
  Game.levelNumber = levelNumber;
  Game.level = fetchLevel(Game.levelNumber);
  Game.state = levelToState(Game.level);
  Game.history = [];
  Game.delayedMoves = [];
  Game.lastUpdateTimestamp = timestamp;
}
const UPDATE_TIMEOUT_MS = 70;
window.addEventListener("load", async function() {
  document.body.style.background = "linear-gradient(#000, #000414)";
  document.getElementById("load").hidden = true;
  document.getElementById("gm-container").hidden = false;
  const canvas = document.getElementsByTagName("canvas")[0];
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const DOM = {
    canvas,
    ctx: canvas.getContext("2d", { alpha: false }),
    levelTitle: document.getElementById("gm-level-title")
  };
  DOM.ctx.textBaseline = "top";
  await document.fonts.load("25px Share Tech Mono");
  DOM.ctx.font = "25px Share Tech Mono";
  const Game = loadFirstLevel(Date.now());
  draw(DOM, Game);
  const keyQueue = [];
  document.addEventListener("keydown", function(e) {
    const keyObj = KEYS.find((keyObj2) => keyObj2.keys.includes(e.key));
    if (!keyObj) return;
    keyQueue.push(keyObj.name);
  });
  function step(timestamp) {
    const firstKey = keyQueue.shift();
    if (firstKey === "RESTART") {
      loadLevel(Game, Game.levelNumber, timestamp);
      draw(DOM, Game);
      return;
    }
    if (firstKey === "LEVELUP") {
      loadLevel(Game, Game.levelNumber + 1, timestamp);
      draw(DOM, Game);
      return;
    }
    if (firstKey === "LEVELDOWN") {
      loadLevel(Game, Game.levelNumber - 1, timestamp);
      draw(DOM, Game);
      return;
    }
    if (firstKey === "UNDO") {
      if (Game.history.length > 0) {
        Game.delayedMoves = [];
        Game.state = Game.history.pop();
        Game.lastUpdateTimestamp = timestamp;
        draw(DOM, Game);
      }
      return;
    }
    if (Game.delayedMoves.length > 0) {
      if (timestamp >= Game.lastUpdateTimestamp + UPDATE_TIMEOUT_MS) {
        const updateResult = delayedUpdate(Game.state, Game.delayedMoves);
        Game.lastUpdateTimestamp = timestamp;
        Game.state = updateResult.newState;
        if (Game.state.playerEntities.length === 0) {
          loadLevel(Game, Game.levelNumber + 1, timestamp);
          return draw(DOM, Game);
        }
        Game.delayedMoves = updateResult.delayedMoves;
        return draw(DOM, Game);
      } else {
        return;
      }
    }
    if (firstKey === void 0) return;
    const playerDir = DIRS[firstKey];
    const state = Game.state;
    const playerMoveResult = playerUpdate(state, playerDir);
    Game.lastUpdateTimestamp = timestamp;
    if (!playerMoveResult) return;
    Game.history.push(state);
    Game.state = playerMoveResult.newState;
    if (Game.state.playerEntities.length === 0) {
      loadLevel(Game, Game.levelNumber + 1, timestamp);
      return draw(DOM, Game);
    }
    Game.delayedMoves = playerMoveResult.delayedMoves;
    return draw(DOM, Game);
  }
  function RAF_step(timestamp) {
    step(timestamp);
    window.requestAnimationFrame(RAF_step);
  }
  window.requestAnimationFrame(RAF_step);
});
