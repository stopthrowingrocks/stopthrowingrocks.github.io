+++
title = "Star Battle"
date = 2026-06-23

[extra]
subtitle = "PUZZLE. Place stars — one per row, column, and region, no touching."
tab_title = "Star Battle"
+++

<link rel="stylesheet" href="starbattle.css">

<div id="sb-selector"></div>

<div id="sb-game">
  <div id="sb-title"></div>
  <div id="sb-status"></div>
  <div id="sb-branch-label"></div>
  <div id="sb-table-wrap"></div>
  <div class="sb-btn-row">
    <button id="sb-undo-btn" disabled>↩</button>
    <button id="sb-redo-btn" disabled>↪</button>
    <button id="sb-restart-btn">↺ Reset</button>
    <button id="sb-split-btn">✂ Split</button>
    <button id="sb-impossible-btn">✗ Impos.</button>
    <button id="sb-menu-btn">← Exit</button>
  </div>
</div>

<script src="starbattle.js"></script>
