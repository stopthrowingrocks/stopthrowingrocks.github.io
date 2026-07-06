+++
title = "Critical Julia Set Explorer"
date = 2026-04-20

[extra]
subtitle = "Julia sets parameterized by the Mandelbrot boundary."
tab_title = "Critical Julia"
+++

<link rel="stylesheet" type="text/css" href="css/style.css">
<canvas id="c"></canvas>
<div id="no-webgl" hidden>WebGL is not available in this browser.</div>

<div id="ui">
    <h3>Critical Julia Sets</h3>
    <div id="palettes"><!-- filled by JS --></div>
    <div class="row">
        <span class="lbl">offset</span>
        <input type="range" id="pal-offset" min="0" max="1" step="0.005" value="0">
        <button class="ub" id="anim-play">▶</button>
        <button class="ub" id="anim-dir">→</button>
    </div>
    <div class="row">
        <span class="lbl">anim speed</span>
        <input type="range" id="anim-speed" min="0.02" max="3" step="0.01" value="0.3">
    </div>
    <div class="row">
        <span class="lbl">color bands</span>
        <input type="range" id="color-scale" min="0.5" max="60" step="0.25" value="9">
    </div>
    <div class="row">
        <span class="lbl">brightness</span>
        <input type="range" id="bright-freq" min="1" max="32" step="1" value="6">
    </div>
    <div class="row">
        <span class="lbl">iterations</span>
        <button class="ub" id="iter-down">−</button>
        <span id="iter-val">256</span>
        <button class="ub" id="iter-up">+</button>
    </div>
    <div class="row">
        <span class="lbl">render time</span>
        <span id="render-time">—</span>
    </div>
    <hr style="border-color:rgba(255,255,255,0.1);margin:0.4rem 0;">
    <div class="row">
        <span class="lbl">α</span>
        <input type="range" id="alpha-slider" min="0" max="6.28318" step="0.001" value="3.14159">
    </div>
    <div class="row">
        <span class="lbl"></span>
        <input type="number" id="alpha-input" min="0" max="6.28318" step="0.001" value="3.14159">
        <span style="color:#666;font-size:0.7rem;">/ 2π</span>
    </div>
    <canvas id="unit-circle" width="150" height="150"></canvas>
    <div id="c-display">c = …</div>
    <div class="row" style="font-size:0.7rem;">
        <span class="lbl" style="color:#666;">∇H time</span>
        <span id="compute-time" style="color:#666;">—</span>
    </div>
</div>

<div id="hints">
    drag circle · set angle α &nbsp;|&nbsp; P · palette &nbsp;|&nbsp; ± · iterations
</div>

<script src="julia.js" type="module"></script>
