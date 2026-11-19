import { errorLevel, Level, levels } from "./levels.js";

type GameState = {
  carrying: boolean
  map: string[][]
}

type Game = {
  levelNumber: number
  level: Level
  state: GameState
  history: GameState[] // Does not store the current state
  lastUpdateTimestamp: number
};

type Entity = "@" | "#" | " " | "O";

function getPos(state: GameState, x: number, y: number): Entity {
  if (y < 0 || x < 0 || y >= state.map.length || x >= state.map[y].length) return " ";
  if (state.map[y][x] === " ") return " ";
  if (state.map[y][x] === "@") return "@";
  if (state.map[y][x] === "O") return "O";
  return "#"; // This is the default
}
function setPos(state: GameState, x: number, y: number, e: Entity): void {
  if (y < 0 || x < 0 || y >= state.map.length || x >= state.map[y].length) return;
  state.map[y][x] = e;
}
function swap(state: GameState, x1: number, y1: number, x2: number, y2: number): void {
  const pos1 = getPos(state, x1, y1);
  const pos2 = getPos(state, x2, y2);
  setPos(state, x1, y1, pos2);
  setPos(state, x2, y2, pos1);
}

function fetchLevel(levelNumber: number): Level {
  if (1 <= levelNumber && levelNumber <= levels.length) {
    return levels[levelNumber - 1];
  } else {
    return errorLevel;
  }
}

function levelToState(level: Level): GameState {
  const state: GameState = {
    carrying: false,
    map: level.map(s => s.split("")),
  };
  return state;
}

function loadFirstLevel(timestamp: number): Game {
  const levelNumber = 1;
  const level = fetchLevel(levelNumber);
  const state = levelToState(level);
  return {
    levelNumber,
    level,
    state,
    history: [],
    lastUpdateTimestamp: timestamp,
  };
}
function loadLevel(Game: Game, levelNumber: number, timestamp: number): void {
  Game.levelNumber = levelNumber;
  Game.level = fetchLevel(Game.levelNumber);
  Game.state = levelToState(Game.level);
  Game.history = [];
  Game.lastUpdateTimestamp = timestamp;
}

function draw(DOM: DOM, Game: Game) {
  DOM.gm_elem.innerHTML = Game.state.map.map(a => a.join("")).join("\n");
}

type DOM = {
  gm_elem: HTMLPreElement,
};

const KEYS = [ // There is no consistency check that KEYS has a value for every player action
  {
    name: "LEFT",
    keys: ["a", "ArrowLeft"],
  },
  {
    name: "DOWN",
    keys: ["s", "ArrowDown"],
  },
  {
    name: "RIGHT",
    keys: ["d", "ArrowRight"],
  },
  {
    name: "UNDO",
    keys: ["z"],
  },
  {
    name: "RESTART",
    keys: ["r"],
  },
  {
    name: "LEVELUP",
    keys: ["."],
  },
  {
    name: "LEVELDOWN",
    keys: [","],
  },
] as const;
type KeyName = typeof KEYS[number]["name"];
const DIRS = {
  LEFT: -1,
  RIGHT: 1,
};

const UPDATE_TIMEOUT_MS = 70;

window.addEventListener("load", async function () {
  document.getElementById("load")!.hidden = true;
  document.getElementById("gm-container")!.hidden = false;
  const DOM: DOM = {
    gm_elem: document.getElementById("gm-elem")! as any,
  };

  await document.fonts.load("25px Share Tech Mono");
//   DOM.gm_elem = "25px Share Tech Mono";

  const Game: Game = loadFirstLevel(Date.now());
  // Don't draw or accept key presses until the fonts have loaded
  draw(DOM, Game);

  const keyQueue: KeyName[] = [];
  document.addEventListener("keydown", function (e) {
    const keyObj = KEYS.find(keyObj => (keyObj.keys as readonly string[]).includes(e.key));
    if (!keyObj) return;
    keyQueue.push(keyObj.name);
  });

  function step(timestamp: number): void {
    const firstKey = keyQueue.shift();

    // Handle interrupt actions before processing delayed moves or player actions
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
        Game.state = Game.history.pop()!;
        Game.lastUpdateTimestamp = timestamp;
        draw(DOM, Game);
      }
      return;
    }

    let p = null;
    for (let i = 0; i < Game.state.map.length; i++) {
      for (let j = 0; j < Game.state.map[i].length; j++) {
        if (getPos(Game.state, j, i) === '@') {
          p = {y:i,x:j};
        }
      }
    }
    if (p === null) {
      return;
    }

    const oldState: GameState = {
      carrying: Game.state.carrying,
      map: Game.state.map.map(a => a.map(c => c)),
    };
    switch (getPos(Game.state, p.x, p.y + 1)) {
      case " ": {
        if (timestamp >= Game.lastUpdateTimestamp + UPDATE_TIMEOUT_MS) {
          Game.lastUpdateTimestamp = timestamp;
          swap(Game.state, p.x, p.y, p.x, p.y + 1);
          if (Game.state.carrying) {
            swap(Game.state, p.x, p.y - 1, p.x, p.y);
          }
          draw(DOM, Game);
        }
        return;
      }
      case "O": {
        if (timestamp >= Game.lastUpdateTimestamp + UPDATE_TIMEOUT_MS) {
          loadLevel(Game, Game.levelNumber + 1, timestamp);
          draw(DOM, Game);
        }
        return;
      }
    }

    let updated = false;
    if (firstKey === "DOWN") {
      // Try to pick it up
      swap(Game.state, p.x, p.y, p.x, p.y + (Game.state.carrying ? -1 : 1));
      Game.state.carrying = !Game.state.carrying;
      updated = true;
    } else if (firstKey !== undefined) {
      const dx = DIRS[firstKey];
      switch (getPos(Game.state, p.x + dx, p.y)) {
        case " ": {
          if (!Game.state.carrying || getPos(Game.state, p.x + dx, p.y - 1) === " ") {
            // We can move directly to the dx
            swap(Game.state, p.x, p.y, p.x + dx, p.y);
            if (Game.state.carrying) {
              swap(Game.state, p.x, p.y - 1, p.x + dx, p.y - 1);
            }
            
            updated = true;
          }
          break;
        }
        case "O": {
          if (!Game.state.carrying || getPos(Game.state, p.x + dx, p.y - 1) === " ") {
            loadLevel(Game, Game.levelNumber + 1, timestamp);
            draw(DOM, Game);
            return;
          }
          break;
        }
        default: {
          // There is an obstacle, try to walk up it
          if (getPos(Game.state, p.x, p.y + (Game.state.carrying ? -2 : -1)) === " ") {
            if (!Game.state.carrying || getPos(Game.state, p.x + dx, p.y - 2) === " ") {
              switch (getPos(Game.state, p.x + dx, p.y - 1)) {
                case " ": {
                  // We can walk up it
                  swap(Game.state, p.x, p.y, p.x + dx, p.y - 1);
                  if (Game.state.carrying) {
                    swap(Game.state, p.x, p.y - 1, p.x + dx, p.y - 2);
                  }
                  updated = true;
                  break;
                }
                case "O": {
                  loadLevel(Game, Game.levelNumber + 1, timestamp);
                  draw(DOM, Game);
                  return;
                }
              }
            }
          }
        }
      }
    }

    if (updated) {
      Game.history.push(oldState);
      Game.lastUpdateTimestamp = timestamp;
      draw(DOM, Game);
    }
  }

  function RAF_step(timestamp: number): void {
    step(timestamp);
    window.requestAnimationFrame(RAF_step);
  }
  window.requestAnimationFrame(RAF_step);
});
