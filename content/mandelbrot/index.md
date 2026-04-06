+++
title = "Mandelbrot Explorer"
date = 2026-04-02

[extra]
subtitle = "WebGL Mandelbrot set explorer with emulated double-precision for deep zoom."
tab_title = "Mandelbrot"
+++

<link id="css" rel="stylesheet" type="text/css" href="css/style.css">
<canvas id="c"></canvas>
<div id="no-webgl" hidden>WebGL is not available in this browser.</div>

<div id="ui">
    <h3>Mandelbrot</h3>
    <div id="palettes"><!-- filled by JS --></div>
    <div class="row">
        <span class="lbl">offset</span>
        <input type="range" id="pal-offset" min="0" max="1" step="0.005" value="0">
        <button class="ub" id="anim-play">▶</button>
        <button class="ub" id="anim-dir">→</button>
    </div>
    <div class="row">
        <span class="lbl">anim speed</span>
        <input type="range" id="anim-speed" min="0.02" max="1.01" step="0.01" value="0.1">
    </div>
    <div class="row">
        <span class="lbl">color bands</span>
        <input type="range" id="color-scale" min="0.5" max="41" step="0.25" value="22">
    </div>
    <div class="row">
        <span class="lbl">brightness freq</span>
        <input type="range" id="bright-freq" min="0" max="16" step="1" value="16">
    </div>
    <div class="row">
        <span class="lbl">iterations</span>
        <button class="ub" id="iter-down">−</button>
        <span id="iter-val">4096</span>
        <button class="ub" id="iter-up">+</button>
    </div>
    <div class="row">
        <span class="lbl">zoom</span>
        <span id="zoom-val">2.50e+2</span>
    </div>
    <div class="row">
        <span class="lbl">render time</span>
        <span id="render-time">—</span>
    </div>
    <button id="reset">Reset view</button>
</div>

<div id="hints">
    scroll · zoom &nbsp;|&nbsp; drag · pan<br>
    P · cycle palette &nbsp;|&nbsp; ± · iterations &nbsp;|&nbsp; R · reset
</div>

<script src="mandelbrot.js" type="module"></script>
