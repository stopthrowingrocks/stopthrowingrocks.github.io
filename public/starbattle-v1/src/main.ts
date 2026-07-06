import { state } from './state';
import { parseLevels } from './parse';
import { sbUndo, sbRedo } from './undo';
import { sbToggleSplit, sbMarkImpossible } from './split';
import { sbShowSelector, sbGoBack, sbRestart } from './selector';
import { sbOpenHelp } from './help';
import { setupInteraction } from './interaction';

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
setupInteraction();

fetch("levels.json")
  .then(r => r.json())
  .then(data => { state.puzzles = parseLevels(data); sbShowSelector(); })
  .catch(() => { document.getElementById("sb-selector")!.textContent = "Failed to load puzzles."; });
