+++
title = "Mandelbrot Explorer"
date = 2026-04-02

[extra]
subtitle = "WebGL Mandelbrot set explorer."
tab_title = "Mandelbrot"
+++

<link id="css" rel="stylesheet" type="text/css" href="css/style.css">
<canvas id="c"></canvas>
<canvas id="orbit-canvas"></canvas>
<div id="orbit-tip" hidden></div>
<div id="no-webgl" hidden>WebGL is not available in this browser.</div>

<div id="ui"> 
    <h3>Mandelbrot</h3>
    <div id="palettes"><!-- filled by JS --></div>
    <div class="row">
        <span class="lbl">offset</span>
        <input type="range" id="pal-offset" min="0" max="1" step="0.005" value="0">
        <button class="ub" id="anim-play">⏸</button>
        <button class="ub" id="anim-dir">←</button>
    </div>
    <div class="row">
        <span class="lbl">anim speed</span>
        <input type="range" id="anim-speed" min="0.02" max="1.01" step="0.01" value="0.15">
    </div>
    <div class="row">
        <span class="lbl">color bands</span>
        <input type="range" id="color-scale" min="0.5" max="60" step="0.25" value="9">
    </div>
    <div class="row">
        <span class="lbl">brightness freq</span>
        <input type="range" id="bright-freq" min="1" max="32" step="1" value="6">
    </div>
    <div class="row">
        <span class="lbl">iterations</span>
        <button class="ub" id="iter-down">−</button>
        <span id="iter-val">2048</span>
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
    <div class="row">
        <button class="ub" id="orbit-toggle">Orbit</button>
        <span id="orbit-info"></span>
    </div>
    <button id="reset">Reset view</button>
</div>

<div id="hints">
    scroll · zoom &nbsp;|&nbsp; drag · pan &nbsp;|&nbsp; shift+click · orbit<br>
    P · cycle palette &nbsp;|&nbsp; ± · iterations &nbsp;|&nbsp; R · reset
</div>

<script src="mandelbrot.js" type="module"></script>
