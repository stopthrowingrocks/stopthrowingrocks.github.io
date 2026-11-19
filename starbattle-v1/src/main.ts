import { state } from './state';
import { parseLevels } from './parse';
import { sbUndo, sbRedo } from './undo';
import { sbToggleSplit, sbMarkImpossible } from './split';
import { sbShowSelector, sbGoBack, sbRestart, startPuzzle } from './selector';
import { sbOpenHelp } from './help';
import { addInteractionEventListeners } from './interaction';
import { refresh } from './render';

function wireButtons(): void {
  document.getElementById("sb-undo-btn")!      .addEventListener("click", sbUndo);
  document.getElementById("sb-redo-btn")!      .addEventListener("click", sbRedo);
  document.getElementById("sb-restart-btn")!   .addEventListener("click", () => sbRestart());
  document.getElementById("sb-split-btn")!     .addEventListener("click", sbToggleSplit);
  document.getElementById("sb-impossible-btn")!.addEventListener("click", sbMarkImpossible);
  document.getElementById("sb-menu-btn")!      .addEventListener("click", sbGoBack);
  document.getElementById("sb-help-btn")!      .addEventListener("click", sbOpenHelp);
}

wireButtons();
addInteractionEventListeners();

document.getElementById("sb-prev-btn")!.addEventListener("click", () => {
  if (!state.puzzle) return;
  const idx = state.puzzles.indexOf(state.puzzle);
  if (idx > 0) startPuzzle(state.puzzles[idx - 1]);
});
document.getElementById("sb-next-btn")!.addEventListener("click", () => {
  if (!state.puzzle) return;
  const idx = state.puzzles.indexOf(state.puzzle);
  if (idx < state.puzzles.length - 1) startPuzzle(state.puzzles[idx + 1]);
});

let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => { if (state.puzzle) refresh(); }, 150);
});

fetch("levels.json")
  .then(r => r.json())
  .then(data => { state.puzzles = parseLevels(data); sbShowSelector(); })
  .catch(() => { document.getElementById("sb-selector")!.textContent = "Failed to load puzzles."; });
