+++
title = "Forced En Passant Checkmate"
date = 2026-05-15

[extra]
subtitle = "GAME. Play Black against a forced en-passant checkmate."
tab_title = "En Passant Checkmate"
+++

<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  /* ── Selector ── */
  #selector { display: flex; flex-direction: column; align-items: center; gap: 14px; width: 100%; max-width: 420px; margin: 0 auto; }
  .puzzle-btn {
    width: 100%; padding: 14px 18px; font-size: 1.05rem; cursor: pointer;
    background: #16213e; color: #eee; border: 2px solid #0f3460;
    border-radius: 8px; transition: background .15s, border-color .15s;
  }
  .puzzle-btn:hover { background: #0f3460; border-color: #e94560; }

  /* ── Game ── */
  #ep-game { display: none; flex-direction: column; align-items: center; gap: 10px; }
  #puzzle-title { font-size: 1rem; color: #aaa; }
  #ep-status { font-size: 1.05rem; min-height: 1.4em; }
  #ep-status.check { color: #e94560; font-weight: bold; }
  #ep-status.win   { color: #f5a623; font-weight: bold; }
  #ep-status.think { color: #aaa; }

  #ep-board { border: 3px solid #333; border-radius: 3px; cursor: pointer; display: block; }

  .ep-btn-row { display: flex; gap: 10px; }
  .ep-btn-row button {
    padding: 8px 20px; font-size: .95rem; cursor: pointer;
    background: #16213e; color: #eee; border: 1px solid #0f3460;
    border-radius: 6px; transition: background .15s;
  }
  .ep-btn-row button:hover { background: #0f3460; }

  /* promotion dialog */
  #ep-promo-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,.6); justify-content: center; align-items: center; z-index: 10;
  }
  #ep-promo-box {
    background: #16213e; border: 2px solid #0f3460; border-radius: 10px;
    padding: 24px 32px; text-align: center;
  }
  #ep-promo-box p { margin-bottom: 14px; font-size: 1rem; }
  #ep-promo-box button {
    margin: 4px; padding: 10px 16px; font-size: 1.4rem; cursor: pointer;
    background: #0f3460; color: #eee; border: none; border-radius: 6px;
  }
  #ep-promo-box button:hover { background: #e94560; }
</style>

<p style="color:#aaa;margin-bottom:16px">You play Black — can you delay the inevitable?</p>

<!-- ── Selector ── -->
<div id="selector"></div>

<!-- ── Game ── -->
<div id="ep-game">
  <div id="puzzle-title"></div>
  <div id="ep-status"></div>
  <canvas id="ep-board"></canvas>
  <div class="ep-btn-row">
    <button onclick="epUndo()">&#8592; Undo</button>
    <button onclick="epRestart()">&#8635; Restart</button>
    <button onclick="epShowSelector()">&#8801; Menu</button>
  </div>
</div>

<!-- ── Promotion picker ── -->
<div id="ep-promo-overlay">
  <div id="ep-promo-box">
    <p>Promote to:</p>
    <button onclick="epPickPromo('q')">&#9819;</button>
    <button onclick="epPickPromo('r')">&#9820;</button>
    <button onclick="epPickPromo('b')">&#9821;</button>
    <button onclick="epPickPromo('n')">&#9822;</button>
  </div>
</div>

<script>
const PUZZLES = [
  {
    name: "Puzzle 1 — Knight & Rook battery",
    source: "https://youtu.be/6qVgF1OO_cw?si=5oMdbTC90LOKQiRP&t=319",
    fen:  "6k1/4p3/4N3/5PB1/Q7/3P4/PPP4P/2K1R3 w - - 0 1",
    solution: {
      "6k1/4p3/4N3/5PB1/Q7/3P4/PPP4P/2K1R3 w - -": "a4e8",
      "4Q3/4p2k/4N3/5PB1/8/3P4/PPP4P/2K1R3 w - -": "g5h4",
      "4Q3/4p3/4N2k/5P2/7B/3P4/PPP4P/2K1R3 w - -": "e8a4",
      "8/4p2k/4N3/5P2/Q6B/3P4/PPP4P/2K1R3 w - -": "e1g1",
      "7k/4p3/4N3/5P2/Q6B/3P4/PPP4P/2K3R1 w - -": "h4e1",
      "8/4p2k/4N3/5P2/Q7/3P4/PPP4P/2K1B1R1 w - -": "a4f4",
      "7k/4p3/4N3/5P2/5Q2/3P4/PPP4P/2K1B1R1 w - -": "e1h4",
      "8/4p2k/4N3/5P2/5Q1B/3P4/PPP4P/2K3R1 w - -": "e6f8",
      "5N1k/4p3/8/5P2/5Q1B/3P4/PPP4P/2K3R1 w - -": "f4d4",
      "5N1k/8/8/4pP2/3Q3B/3P4/PPP4P/2K3R1 w - e6": "f5e6",
      "8/4p3/4N2k/5P2/Q6B/3P4/PPP4P/2K3R1 w - -": "g1g5",
      "8/4p2k/4N3/5PR1/Q6B/3P4/PPP4P/2K5 w - -": "g5g6",
      "7k/4p3/4N1R1/5P2/Q6B/3P4/PPP4P/2K5 w - -": "h4g5",
      "8/4p2k/4N1R1/5PB1/Q7/3P4/PPP4P/2K5 w - -": "e6f8",
      "5N1k/4p3/6R1/5PB1/Q7/3P4/PPP4P/2K5 w - -": "a4d4",
      "5N1k/8/6R1/4pPB1/3Q4/3P4/PPP4P/2K5 w - e6": "f5e6",
      "8/4p3/4N3/5P1k/Q6B/3P4/PPP4P/2K1R3 w - -": "e1g1",
      "8/4p1N1/7k/5P2/Q6B/3P4/PPP4P/2K1R3 w - -": "g7e6",
    }
  },
  {
    name: "Puzzle 2 — Bishop & Rook battery",
    source: "https://youtu.be/6qVgF1OO_cw?si=inRThVLwfYaSYAif&t=372",
    fen:  "5k2/4p3/4R3/5PB1/Q7/3P4/PPP4P/2K5 w - - 2 3",
    solution: {
      "5k2/4p3/4R3/5PB1/Q7/3P4/PPP4P/2K5 w - -": "g5e3",
      "6k1/4p3/4R3/5P2/Q7/3PB3/PPP4P/2K5 w - -": "a4e8",
      "4Q3/4p2k/4R3/5P2/8/3PB3/PPP4P/2K5 w - -": "e3a7",
      "4Q3/B3p1k1/4R3/5P2/8/3P4/PPP4P/2K5 w - -": "e6g6",
      "4Q3/B3p2k/6R1/5P2/8/3P4/PPP4P/2K5 w - -": "e8f7",
      "7k/B3pQ2/6R1/5P2/8/3P4/PPP4P/2K5 w - -": "a7d4",
      "7k/5Q2/6R1/4pP2/3B4/3P4/PPP4P/2K5 w - e6": "f5e6",
      "4Q3/4p1k1/4R3/5P2/8/3PB3/PPP4P/2K5 w - -": "e6g6",
      "4Q3/4p2k/6R1/5P2/8/3PB3/PPP4P/2K5 w - -": "e8f7",
      "7k/4pQ2/6R1/5P2/8/3PB3/PPP4P/2K5 w - -": "e3d4",
      "8/4p1k1/4R3/5P2/Q7/3PB3/PPP4P/2K5 w - -": "a4e8",
      "8/4pk2/4R3/5P2/Q7/3PB3/PPP4P/2K5 w - -": "a4a8",
      "Q7/4p1k1/4R3/5P2/8/3PB3/PPP4P/2K5 w - -": "a8e8",
    }
  }
];
</script>
<script type="module">
import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js/+esm";

const SQ = 72;
const BOARD_PX = 8 * SQ;
const canvas = document.getElementById("ep-board");
canvas.width = canvas.height = BOARD_PX;
const ctx = canvas.getContext("2d");

const COL = {
  light: "#F0D9B5", dark: "#B58863",
  select: "#6FBF6F", legal: "#CDD26E",
  check: "#FF6B6B",
  lastLight: "#A9C8E8", lastDark: "#6A9FBF",
};

const PIECE_IMGS = {};
const PIECE_KEYS = ['wP','wN','wB','wR','wQ','wK','bP','bN','bB','bR','bQ','bK'];
let _imagesReady = 0;

function preloadPieces(cb) {
  PIECE_KEYS.forEach(key => {
    const img = new Image();
    img.onload  = () => { if (++_imagesReady === PIECE_KEYS.length) cb(); };
    img.onerror = () => { if (++_imagesReady === PIECE_KEYS.length) cb(); };
    img.src = `https://lichess1.org/assets/piece/cburnett/${key}.svg`;
    PIECE_IMGS[key] = img;
  });
}

let game, puzzle, history, selected, legalDests, lastMove;

function fenKey(fen) {
  return fen.split(" ").slice(0, 4).join(" ");
}

function epShowSelector() {
  document.getElementById("ep-game").style.display = "none";
  const sel = document.getElementById("selector");
  sel.innerHTML = "";
  PUZZLES.forEach(p => {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:4px;width:100%";
    const btn = document.createElement("button");
    btn.className = "puzzle-btn";
    btn.textContent = p.name;
    btn.onclick = () => startGame(p);
    wrap.appendChild(btn);
    if (p.source) {
      const a = document.createElement("a");
      a.href = p.source;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "See on YouTube";
      a.style.cssText = "font-size:.8rem;color:#aaa;text-decoration:underline;";
      wrap.appendChild(a);
    }
    sel.appendChild(wrap);
  });
  sel.style.display = "flex";
}

function startGame(p) {
  puzzle = p;
  document.getElementById("selector").style.display = "none";
  document.getElementById("ep-game").style.display = "flex";
  const titleEl = document.getElementById("puzzle-title");
  titleEl.innerHTML = p.source
    ? `${p.name} — <a href="${p.source}" target="_blank" rel="noopener" style="color:#aaa;text-decoration:underline;font-size:.9em">source</a>`
    : p.name;
  resetState();
  scheduleWhite();
}

function resetState() {
  game = new Chess(puzzle.fen);
  history = [];
  selected = null;
  legalDests = [];
  lastMove = null;
  render();
}

function epRestart() { resetState(); scheduleWhite(); }

function epUndo() {
  if (!history.length) return;
  game.load(history.pop());
  lastMove = null;
  selected = null;
  legalDests = [];
  render();
}

function scheduleWhite() {
  if (game.turn() === "w" && !game.isGameOver()) {
    setTimeout(doWhiteMove, 350);
  }
}

function doWhiteMove() {
  if (game.turn() !== "w" || game.isGameOver()) return;
  const key = fenKey(game.fen());
  const uci = puzzle.solution[key];
  if (!uci) { setStatus("White has no precomputed move here.", "check"); return; }
  const from = uci.slice(0, 2), to = uci.slice(2, 4), promo = uci[4] || undefined;
  const move = game.move({ from, to, promotion: promo });
  if (move) lastMove = { from: move.from, to: move.to };
  render();
}

let promoResolve = null;
function showPromo() {
  document.getElementById("ep-promo-overlay").style.display = "flex";
  return new Promise(r => { promoResolve = r; });
}
function epPickPromo(piece) {
  document.getElementById("ep-promo-overlay").style.display = "none";
  if (promoResolve) { promoResolve(piece); promoResolve = null; }
}

canvas.addEventListener("click", async (e) => {
  if (game.turn() !== "b" || game.isGameOver()) return;
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;
  const file = Math.floor(px / SQ), rank = 7 - Math.floor(py / SQ);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return;
  const sq = "abcdefgh"[file] + (rank + 1);

  if (selected === null) {
    trySelect(sq);
  } else if (sq === selected) {
    deselect();
  } else if (legalDests.includes(sq)) {
    await applyBlackMove(sq);
  } else {
    trySelect(sq);
  }
  render();
});

function trySelect(sq) {
  const piece = game.get(sq);
  if (piece && piece.color === "b") {
    selected = sq;
    legalDests = game.moves({ square: sq, verbose: true }).map(m => m.to);
  } else {
    deselect();
  }
}

function deselect() { selected = null; legalDests = []; }

function isLight(file, rank) { return (file + rank) % 2 === 0; }

function render() {
  ctx.clearRect(0, 0, BOARD_PX, BOARD_PX);
  const inCheck = game.isCheck();
  const turn = game.turn();

  let checkKingSq = null;
  if (inCheck) {
    const board = game.board();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (p && p.type === "k" && p.color === turn) {
          checkKingSq = "abcdefgh"[f] + (8 - r);
        }
      }
    }
  }

  const lastSqs = lastMove ? [lastMove.from, lastMove.to] : [];

  for (let rank = 7; rank >= 0; rank--) {
    for (let file = 0; file < 8; file++) {
      const sq = "abcdefgh"[file] + (rank + 1);
      const x = file * SQ, y = (7 - rank) * SQ;
      const light = isLight(file, rank);

      let bg;
      if (sq === selected) bg = COL.select;
      else if (legalDests.includes(sq)) bg = COL.legal;
      else if (sq === checkKingSq) bg = COL.check;
      else if (lastSqs.includes(sq)) bg = light ? COL.lastLight : COL.lastDark;
      else bg = light ? COL.light : COL.dark;

      ctx.fillStyle = bg;
      ctx.fillRect(x, y, SQ, SQ);

      const labelColor = light ? COL.dark : COL.light;
      ctx.font = "bold 10px Helvetica";
      ctx.fillStyle = labelColor;
      if (file === 0) { ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText(rank + 1, x + 3, y + 3); }
      if (rank === 0) { ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText("abcdefgh"[file], x + SQ - 3, y + SQ - 3); }

      const piece = game.get(sq);
      if (piece) {
        const img = PIECE_IMGS[piece.color + piece.type.toUpperCase()];
        if (img && img.complete) ctx.drawImage(img, x, y, SQ, SQ);
      }
    }
  }

  updateStatus();
}

function setStatus(msg, cls) {
  const el = document.getElementById("ep-status");
  el.textContent = msg;
  el.className = cls || "";
}

function updateStatus() {
  if (game.isCheckmate()) {
    const winner = game.turn() === "b" ? "White" : "Black (you!)";
    setStatus(`Checkmate — ${winner} wins`, "win");
  } else if (game.isStalemate()) {
    setStatus("Stalemate — draw", "think");
  } else if (game.isDraw()) {
    setStatus("Draw", "think");
  } else if (game.turn() === "b") {
    const msg = "Your turn (Black)" + (game.isCheck() ? "  —  CHECK!" : "");
    setStatus(msg, game.isCheck() ? "check" : "");
  } else {
    setStatus("White is thinking…", "think");
  }
}

async function applyBlackMove(toSq) {
  const candidates = game.moves({ square: selected, verbose: true })
    .filter(m => m.to === toSq);
  if (!candidates.length) return;

  const fenBefore = game.fen();
  let move;
  const needsPromo = candidates.some(m => m.flags.includes("p"));
  if (needsPromo) {
    const piece = await showPromo();
    move = game.move({ from: selected, to: toSq, promotion: piece });
  } else {
    move = game.move({ from: selected, to: toSq });
  }

  if (move) {
    history.push(fenBefore);
    lastMove = { from: move.from, to: move.to };
  }
  deselect();
  render();
  if (!game.isGameOver()) scheduleWhite();
}

window.epUndo        = epUndo;
window.epRestart     = epRestart;
window.epShowSelector = epShowSelector;
window.epPickPromo   = epPickPromo;

preloadPieces(epShowSelector);
</script>
