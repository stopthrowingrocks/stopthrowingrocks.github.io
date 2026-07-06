import type { Puzzle } from './types';
import { state } from './state';
import { groupPuzzles } from './parse';
import { loadSaved, levelStatus, clearSaved } from './persistence';
import { renderPreview } from './preview';
import { refresh } from './render';
import { updateUndoButtons } from './undo';
import { exitSplitMode } from './split';
import { sbOpenHelp } from './help';

export function sbShowSelector(): void {
  document.getElementById("sb-game")!.style.display = "none";
  const sel = document.getElementById("sb-selector")!;
  sel.className = "";
  sel.innerHTML = "";

  const hdr = document.createElement("div");
  hdr.style.cssText = "width:100%;display:flex;justify-content:space-between;align-items:center;padding-bottom:2px";

  const hdrTitle = document.createElement("span");
  hdrTitle.style.cssText = "color:#aaa;font-size:.9rem;";
  hdrTitle.textContent = "Choose a category";

  const helpBtn = document.createElement("button");
  helpBtn.textContent = "?";
  helpBtn.title = "How to play";
  helpBtn.style.cssText = "padding:3px 10px;background:none;border:1px solid #0f3460;border-radius:20px;color:#4fc3f7;cursor:pointer;font-size:.88rem;";
  helpBtn.addEventListener("mouseenter", () => helpBtn.style.background = "#0f3460");
  helpBtn.addEventListener("mouseleave", () => helpBtn.style.background = "none");
  helpBtn.addEventListener("click", sbOpenHelp);

  hdr.appendChild(hdrTitle); hdr.appendChild(helpBtn);
  sel.appendChild(hdr);

  for (const [catName, puzzles] of groupPuzzles(state.puzzles)) {
    const solved  = puzzles.filter(p => levelStatus(p) === 'solved').length;
    const started = puzzles.filter(p => levelStatus(p) === 'started').length;
    let badgeHTML = "";
    if (solved  > 0) badgeHTML += `<span class="sb-stat-done">✓ ${solved}</span>`;
    if (started > 0) badgeHTML += `<span class="sb-stat-prog">· ${started}</span>`;

    const btn = document.createElement("button");
    btn.className = "sb-cat-btn";
    btn.innerHTML = `<span>${catName}</span><span class="sb-cat-badge">${badgeHTML}</span>`;
    btn.addEventListener("click", () => sbShowCategory(catName, puzzles));
    sel.appendChild(btn);
  }

  sel.style.display = "flex";
}

export function sbGoBack(): void {
  if (state.currentCat) sbShowCategory(state.currentCat, state.currentCatPuzzles!);
  else sbShowSelector();
}

export function sbShowCategory(catName: string, puzzles: Puzzle[]): void {
  state.currentCat        = catName;
  state.currentCatPuzzles = puzzles;

  document.getElementById("sb-game")!.style.display = "none";
  const sel = document.getElementById("sb-selector")!;
  sel.className = "grid-mode";
  sel.innerHTML = "";

  const back = document.createElement("button");
  back.className = "sb-back-btn";
  back.textContent = "← Back";
  back.addEventListener("click", sbShowSelector);
  sel.appendChild(back);

  const title = document.createElement("div");
  title.className = "sb-cat-title";
  title.textContent = catName;
  sel.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "sb-level-grid";

  for (const p of puzzles) {
    const status    = levelStatus(p);
    const saved       = loadSaved(p);
    const activeBoard = saved ? saved.boardsById[saved.currentBoardId] : null;

    const btn = document.createElement("button");
    btn.className = "sb-lv-btn" + (status !== 'empty' ? ` ${status}` : "");
    btn.appendChild(renderPreview(p, activeBoard?.state ?? null, 100));

    const num = document.createElement("span");
    num.className = "sb-lv-num";
    num.textContent = String(p.categoryIndex);
    btn.appendChild(num);

    if (status === 'solved') {
      const seal = document.createElement("div");
      seal.className = "sb-lv-seal";
      const mark = document.createElement("span"); mark.textContent = "✓";
      seal.appendChild(mark); btn.appendChild(seal);
    } else if (status === 'started') {
      const badge = document.createElement("span");
      badge.className = "sb-lv-badge"; badge.textContent = "·";
      btn.appendChild(badge);
    }

    btn.addEventListener("click", () => startPuzzle(p));
    grid.appendChild(btn);
  }

  sel.appendChild(grid);
  sel.style.display = "flex";
}

export function startPuzzle(p: Puzzle): void {
  state.puzzle = p;
  document.getElementById("sb-selector")!.style.display = "none";
  document.getElementById("sb-game")!.style.display = "flex";
  document.getElementById("sb-title")!.textContent = p.name;

  const saved = loadSaved(p);
  if (saved) {
    state.boardsById     = saved.boardsById;
    state.currentBoardId = saved.currentBoardId;
    state.boardIdCtr     = saved.boardIdCtr;
    state.groupIdCtr     = saved.groupIdCtr;
    state.undoStack = []; state.redoStack = [];
    exitSplitMode();
    refresh(); updateUndoButtons();
  } else {
    sbRestart(true);
  }
}

export function sbRestart(skipConfirm = false): void {
  if (!skipConfirm && !confirm("Reset this puzzle? All progress will be lost.")) return;
  clearSaved(state.puzzle);
  state.boardIdCtr = 0; state.groupIdCtr = 0;
  const id = state.boardIdCtr++;
  state.boardsById = {
    [id]: { id, state: new Array<0>(state.puzzle!.size ** 2).fill(0), activeSplits: [], impossible: false },
  };
  state.currentBoardId = id;
  state.undoStack = []; state.redoStack = [];
  exitSplitMode();
  refresh(); updateUndoButtons();
}
