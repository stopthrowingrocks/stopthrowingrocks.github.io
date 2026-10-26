// Critical Julia Set Explorer
//
// GPU renders the Julia set for a fixed c; CPU computes c on the Mandelbrot
// boundary from angle α via gradient descent on the Böttcher potential H_n:
//
//   H(0, z, c)  = |z| >= R  ?  log2(ln|z|)  :  log2(ln R)
//   H(n, z, c)  = |z| >= R  ?  log2(ln|z|)  :  H(n-1, z²+c, c) - 1
//   H_n(n, c)   = H(n, 0+0i, c)          [potential at c, starting from 0]
//
//   U(n,x,y)    = -∇H_n  (gradient in the c-plane, negated)
//   N(z)        = z / |z|²               [or 0 if z=0]
//   c_{j+1}     = c_j + d_t · N(U(n, Re(c_j), Im(c_j)))
//
// Starting point: c_0 = R·e^{iα},  R = 256.
// 1000 gradient steps with n = 30 converge to the external-ray landing point
// on ∂M for angle α.
//
// Two-pass rendering (same architecture as mandelbrot.js):
//   Pass 1 (iteration): packed RGBA8 smooth escape time → FBO texture
//   Pass 2 (color):     palette applied to texture every frame

// ─── Shaders ────────────────────────────────────────────────────────────────

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

// Julia iteration: z₀ = pixel position, c = fixed uniform.
const JULIA_FRAG = `#version 300 es
precision highp float;

uniform vec2  u_res;
uniform float u_cx;
uniform float u_cy;
uniform float u_pxsz;   // world units per pixel
uniform float u_iters;

out vec4 fragColor;

void main() {
    vec2 offset = gl_FragCoord.xy - u_res * 0.5;
    float zx = offset.x * u_pxsz;
    float zy = offset.y * u_pxsz;

    const float ESC2 = 256.0;
    int n = -1;

    for (int i = 0; i < 65536; i++) {
        if (float(i) >= u_iters) break;
        float nx = zx*zx - zy*zy + u_cx;
        zy = 2.0*zx*zy + u_cy;
        zx = nx;
        float r2 = zx*zx + zy*zy;
        if (r2 > ESC2) { n = i + 1; break; }
    }

    if (n == -1) { fragColor = vec4(0.0, 0.0, 0.0, 0.0); return; }

    float r2      = clamp(zx*zx + zy*zy, 5.0, 1e30);
    float log_r   = log(r2) * 0.5;
    float nu      = log(log_r / log(2.0)) / log(2.0);
    float smoothV = float(n) + 1.0 - nu;

    float norm = smoothV / 65536.0;
    float r    = floor(norm * 255.0) / 255.0;
    float g    = floor(fract(norm * 255.0) * 255.0) / 255.0;
    float b    = fract(norm * 255.0 * 255.0);
    fragColor = vec4(r, g, b, 1.0);
}`;

// Pass 2: same cosine palette as mandelbrot.js
const COLOR_FRAG = `#version 300 es
precision highp float;

uniform vec2      u_res;
uniform sampler2D u_iter_tex;
uniform float     u_cscale;
uniform vec3      u_pa, u_pb, u_pc, u_pd;
uniform float     u_poff;
uniform float     u_bfreq;

out vec4 fragColor;

vec3 palette(float t) {
    t = fract(t + u_poff);
    vec3 color = u_pa + u_pb * cos(6.28318 * (u_pc * t + u_pd));
    float b = cos(6.28318 * u_bfreq * t);
    color = mix(color, vec3(1.0), max(b, 0.0) * 0.9);
    color = mix(color, vec3(0.0), max(-b, 0.0) * 0.9);
    return color;
}

void main() {
    vec2 uv   = gl_FragCoord.xy / u_res;
    vec4 data = texture(u_iter_tex, uv);
    if (data.a < 0.5) { fragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    float smoothV = (data.r + data.g / 255.0 + data.b / 65025.0) * 65536.0;
    fragColor = vec4(palette(smoothV / u_cscale), 1.0);
}`;

// ─── Palettes ────────────────────────────────────────────────────────────────

const PALETTES = [
    { name: 'Rainbow',  a: [0.5,0.5,0.5], b: [0.5,0.5,0.5], c: [1.0,1.0,1.0], d: [0.00,0.33,0.67] },
    { name: 'Electric', a: [0.5,0.5,0.5], b: [0.5,0.5,0.5], c: [1.0,1.0,1.0], d: [0.00,0.10,0.20] },
    { name: 'Fire',     a: [0.5,0.5,0.5], b: [0.5,0.5,0.5], c: [1.0,1.0,0.5], d: [0.00,0.10,0.50] },
    { name: 'Arctic',   a: [0.5,0.5,0.5], b: [0.5,0.5,0.5], c: [2.0,1.0,0.0], d: [0.50,0.20,0.25] },
    { name: 'Sunset',   a: [0.8,0.5,0.4], b: [0.2,0.4,0.2], c: [2.0,1.0,1.0], d: [0.00,0.25,0.25] },
    { name: 'Gold',     a: [0.5,0.4,0.2], b: [0.5,0.4,0.2], c: [1.0,1.0,0.0], d: [0.00,0.05,0.20] },
];

// ─── Boundary Computation (CPU) ──────────────────────────────────────────────
// Implements the Desmos formulas with R=256, n=30, 1000 gradient steps.

const GRAD_N     = 1000;      // H_n iteration depth
const GRAD_STEPS = 60000;    // gradient descent steps
const GRAD_DT    = 0.0025;    // step size d_t
const GRAD_H     = 1e-3;    // finite-difference epsilon for ∇H
const ESCAPE_R   = 256;     // R in the Desmos formula
const ESCAPE_R2  = ESCAPE_R * ESCAPE_R;
const LOG2_LN_R  = Math.log2(Math.log(ESCAPE_R)); // log2(ln R), base-case value

// H_n(GRAD_N, cx + i*cy)  — evaluates H(n, 0, c) iteratively.
function evalHn(cx, cy) {
    let zx = 0, zy = 0;
    for (let i = 0; i < GRAD_N; i++) {
        const nx = zx*zx - zy*zy + cx;
        const ny = 2*zx*zy + cy;
        zx = nx; zy = ny;
        const r2 = zx*zx + zy*zy;
        if (r2 >= ESCAPE_R2) {
            // Escaped at step i+1: H = log2(ln|z|) - (i+1)
            return Math.log2(0.5 * Math.log(r2)) - (i + 1);
        }
    }
    // Did not escape in GRAD_N steps: base case H(0, z_n, c) = log2(ln R)
    return LOG2_LN_R - GRAD_N;
}

// Map angle α to a point on the Mandelbrot boundary via gradient descent.
// Returns [cx, cy] ≈ landing point of external ray at angle α.
//
// Near parabolic angles (e.g. 7/12 turns ≈ 3.665 rad) the potential gradient
// saturates to zero because orbits linger near the parabolic fixed point for
// many iterations, making evalHn(c+h) ≈ evalHn(c−h) even outside M.  When
// that happens we restore the last c that still had a valid gradient so we
// don't return a point stuck inside M.
function angleToC(alpha) {
    // z_0 = R·e^{iα}
    let cx = ESCAPE_R * Math.cos(alpha);
    let cy = ESCAPE_R * Math.sin(alpha);
    let prevCx = cx, prevCy = cy;

    for (let j = 0; j < GRAD_STEPS; j++) {
        // ∇H_n by central finite differences
        const dHdx = (evalHn(cx + GRAD_H, cy) - evalHn(cx - GRAD_H, cy)) / (2 * GRAD_H);
        const dHdy = (evalHn(cx, cy + GRAD_H) - evalHn(cx, cy - GRAD_H)) / (2 * GRAD_H);

        // U = −∇H_n
        const ux = -dHdx;
        const uy = -dHdy;

        // N(U) = U / |U|²
        // If |U| ≈ 0 the gradient has saturated (parabolic slowdown or inside M).
        // Return the last position that still had a valid gradient.
        const r2 = ux*ux + uy*uy;
        if (r2 < 1e-30) { cx = prevCx; cy = prevCy; break; }

        prevCx = cx; prevCy = cy;
        cx += GRAD_DT * ux / r2;
        cy += GRAD_DT * uy / r2;
    }
    return [cx, cy];
}

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
    cx: -0.75, cy: 0.0,
    alpha: Math.PI,
    maxIter: 256,
    palIdx: 0,
    palOffset: 0,
    colorScale: 9,
    brightFreq: 6,
};

// Julia set viewport: [-VIEW, VIEW] × [-VIEW, VIEW]
const VIEW = 2.0;

let iterDirty = true;

// ─── Animation ───────────────────────────────────────────────────────────────

const anim = {
    playing: false,
    speed:   0.3,    // radians per second
    dir:     1,
    rafId:   null,
    lastT:   null,
};

function animTick(t) {
    if (!anim.playing) return;
    anim.rafId = requestAnimationFrame(animTick);
    if (anim.lastT === null) { anim.lastT = t; return; }
    const dt = (t - anim.lastT) / 1000;
    anim.lastT = t;

    state.alpha = ((state.alpha + anim.dir * anim.speed * dt) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const slider = document.getElementById('alpha-slider');
    if (slider) slider.value = state.alpha;
    updateAlphaDisplay();
    updateC();
    render();
}

function setPlaying(on) {
    anim.playing = on;
    const btn = document.getElementById('anim-play');
    if (btn) btn.textContent = on ? '⏸' : '▶';
    if (on) { anim.lastT = null; anim.rafId = requestAnimationFrame(animTick); }
    else if (anim.rafId) { cancelAnimationFrame(anim.rafId); anim.rafId = null; }
}

// ─── WebGL Helpers ───────────────────────────────────────────────────────────

let gl;
let juliaProg, colorProg;
let juliaUniforms, colorUniforms;
let quadBuf, quadAPos_julia, quadAPos_color;
let iterFBO, iterTex, iterTexW = 0, iterTexH = 0;

function compileShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(s));
        return null;
    }
    return s;
}

function createProgram(vsrc, fsrc) {
    const vs = compileShader(gl.VERTEX_SHADER, vsrc);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsrc);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(p));
        return null;
    }
    return p;
}

// ─── Render ──────────────────────────────────────────────────────────────────

function render() {
    const canvas = gl.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w   = Math.round(canvas.clientWidth  * dpr);
    const h   = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
    }

    // ── Pass 1: Julia iteration (only on dirty or resize) ─────────────────
    if (iterDirty || iterTexW !== w || iterTexH !== h) {
        if (iterTexW !== w || iterTexH !== h) {
            gl.bindTexture(gl.TEXTURE_2D, iterTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            iterTexW = w; iterTexH = h;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, iterFBO);
        gl.viewport(0, 0, w, h);
        gl.useProgram(juliaProg);

        // Scale so the shorter axis spans [-VIEW, VIEW]
        const pxsz = (2 * VIEW) / Math.min(w, h);
        gl.uniform2f(juliaUniforms.u_res,   w, h);
        gl.uniform1f(juliaUniforms.u_cx,    state.cx);
        gl.uniform1f(juliaUniforms.u_cy,    state.cy);
        gl.uniform1f(juliaUniforms.u_pxsz,  pxsz);
        gl.uniform1f(juliaUniforms.u_iters, state.maxIter);

        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
        gl.enableVertexAttribArray(quadAPos_julia);
        gl.vertexAttribPointer(quadAPos_julia, 2, gl.FLOAT, false, 0, 0);

        const t0 = performance.now();
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.finish();
        const elapsed = performance.now() - t0;
        const el = document.getElementById('render-time');
        if (el) el.textContent = elapsed < 1000 ? `${elapsed.toFixed(0)} ms` : `${(elapsed/1000).toFixed(1)} s`;

        iterDirty = false;
    }

    // ── Pass 2: Colorization (every frame) ────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(colorProg);

    const pal = PALETTES[state.palIdx];
    gl.uniform2f(colorUniforms.u_res,    w, h);
    gl.uniform1f(colorUniforms.u_cscale, state.colorScale * Math.max(state.brightFreq, 1));
    gl.uniform3fv(colorUniforms.u_pa,    pal.a);
    gl.uniform3fv(colorUniforms.u_pb,    pal.b);
    gl.uniform3fv(colorUniforms.u_pc,    pal.c);
    gl.uniform3fv(colorUniforms.u_pd,    pal.d);
    gl.uniform1f(colorUniforms.u_poff,   state.palOffset);
    gl.uniform1f(colorUniforms.u_bfreq,  state.brightFreq);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, iterTex);
    gl.uniform1i(colorUniforms.u_iter_tex, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(quadAPos_color);
    gl.vertexAttribPointer(quadAPos_color, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    drawUnitCircle();
}

// ─── Unit Circle Selector ────────────────────────────────────────────────────

function drawUnitCircle() {
    const uc  = document.getElementById('unit-circle');
    if (!uc) return;
    const ctx = uc.getContext('2d');
    const sz  = uc.width;   // physical pixels (CSS sets display size)
    ctx.clearRect(0, 0, sz, sz);

    const ox = sz / 2, oy = sz / 2;
    const r  = sz * 0.38;

    // Crosshairs
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox - r, oy); ctx.lineTo(ox + r, oy);
    ctx.moveTo(ox, oy - r); ctx.lineTo(ox, oy + r);
    ctx.stroke();

    // Circle
    ctx.strokeStyle = 'rgba(160,160,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ox, oy, r, 0, 2 * Math.PI);
    ctx.stroke();

    // Ray to selected point (screen y is flipped relative to math y)
    const px = ox + r * Math.cos(state.alpha);
    const py = oy - r * Math.sin(state.alpha);   // flip y

    ctx.strokeStyle = 'rgba(255,204,68,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(px, py);
    ctx.stroke();

    // Selected point dot
    ctx.fillStyle = '#ffcc44';
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, 2 * Math.PI);
    ctx.fill();
}

// ─── C Update ────────────────────────────────────────────────────────────────

function updateC() {
    const t0 = performance.now();
    const [cx, cy] = angleToC(state.alpha);
    const elapsed  = performance.now() - t0;

    state.cx = cx;
    state.cy = cy;
    iterDirty = true;

    const cEl = document.getElementById('c-display');
    if (cEl) {
        const sign = cy >= 0 ? '+' : '';
        cEl.textContent = `c = ${cx.toFixed(7)} ${sign}${cy.toFixed(7)}i`;
    }
    const tEl = document.getElementById('compute-time');
    if (tEl) tEl.textContent = `${elapsed.toFixed(1)} ms`;
}

// ─── UI ──────────────────────────────────────────────────────────────────────

function initUI() {
    // Palette buttons
    const wrap = document.getElementById('palettes');
    PALETTES.forEach((pal, i) => {
        const btn = document.createElement('button');
        btn.textContent = pal.name;
        btn.addEventListener('click', () => {
            state.palIdx = i;
            updatePalButtons();
            render();
        });
        wrap.appendChild(btn);
    });

    // Alpha slider + number input (kept in sync)
    document.getElementById('alpha-slider').addEventListener('input', (e) => {
        state.alpha = +e.target.value;
        updateAlphaDisplay();
        updateC();
        render();
    });
    document.getElementById('alpha-input').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        if (isNaN(v)) return;
        state.alpha = ((v % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        document.getElementById('alpha-slider').value = state.alpha;
        updateAlphaDisplay();
        updateC();
        render();
    });
    document.getElementById('alpha-input').addEventListener('keydown', (e) => {
        e.stopPropagation();  // prevent +/- from triggering iter shortcuts
    });

    // Animation controls
    document.getElementById('anim-play').addEventListener('click', () => setPlaying(!anim.playing));
    document.getElementById('anim-dir').addEventListener('click', () => {
        anim.dir *= -1;
        document.getElementById('anim-dir').textContent = anim.dir > 0 ? '→' : '←';
    });
    document.getElementById('anim-speed').addEventListener('input', (e) => {
        anim.speed = +e.target.value;
    });

    // Color controls (pass 2 only, no re-iteration needed)
    document.getElementById('pal-offset').addEventListener('input', (e) => {
        state.palOffset = +e.target.value;
        if (!anim.playing) render();
    });
    document.getElementById('color-scale').addEventListener('input', (e) => {
        state.colorScale = +e.target.value;
        render();
    });
    document.getElementById('bright-freq').addEventListener('input', (e) => {
        state.brightFreq = +e.target.value;
        render();
    });

    // Iteration count
    document.getElementById('iter-down').addEventListener('click', () => adjustIter(0.5));
    document.getElementById('iter-up').addEventListener('click',   () => adjustIter(2));

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
        if (e.target !== document.body) return;
        switch (e.key) {
            case 'p': case 'P': cyclePalette(); break;
            case '=': case '+': adjustIter(2);   break;
            case '-':            adjustIter(0.5); break;
        }
    });

    updatePalButtons();
    updateAlphaDisplay();
    updateC();

    // Unit circle drag (mouse)
    initUnitCircleEvents();
}

function updateAlphaDisplay() {
    const input = document.getElementById('alpha-input');
    // Only update the number input when it doesn't have focus, so we don't
    // clobber a value the user is actively typing.
    if (input && document.activeElement !== input) {
        input.value = state.alpha.toFixed(4);
    }
    const slider = document.getElementById('alpha-slider');
    if (slider) slider.value = state.alpha;
}

function adjustIter(factor) {
    state.maxIter = Math.min(65536, Math.max(32, Math.round(state.maxIter * factor)));
    document.getElementById('iter-val').textContent = state.maxIter;
    iterDirty = true;
    render();
}

function cyclePalette() {
    state.palIdx = (state.palIdx + 1) % PALETTES.length;
    updatePalButtons();
    render();
}

function updatePalButtons() {
    document.querySelectorAll('#palettes button').forEach((b, i) => {
        b.classList.toggle('active', i === state.palIdx);
    });
}

function initUnitCircleEvents() {
    const uc = document.getElementById('unit-circle');
    let dragging = false;

    function alphaFromEvent(e) {
        const rect = uc.getBoundingClientRect();
        const dx =  (e.clientX - rect.left)  - uc.clientWidth  / 2;
        const dy = -((e.clientY - rect.top)  - uc.clientHeight / 2); // flip y
        state.alpha = ((Math.atan2(dy, dx) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const slider = document.getElementById('alpha-slider');
        if (slider) slider.value = state.alpha;
        updateAlphaDisplay();
        updateC();
        render();
    }

    uc.addEventListener('mousedown', (e) => { dragging = true; alphaFromEvent(e); });
    window.addEventListener('mousemove', (e) => { if (dragging) alphaFromEvent(e); });
    window.addEventListener('mouseup',   ()  => { dragging = false; });

    // Touch support
    uc.addEventListener('touchstart', (e) => {
        e.preventDefault();
        dragging = true;
        alphaFromEvent(e.touches[0]);
    }, { passive: false });
    uc.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (dragging) alphaFromEvent(e.touches[0]);
    }, { passive: false });
    uc.addEventListener('touchend', () => { dragging = false; });
}

// ─── Init ────────────────────────────────────────────────────────────────────

function init() {
    const canvas = document.getElementById('c');
    gl = canvas.getContext('webgl2');
    if (!gl) {
        document.getElementById('no-webgl').hidden = false;
        canvas.hidden = true;
        return;
    }

    juliaProg = createProgram(VERT, JULIA_FRAG);
    colorProg  = createProgram(VERT, COLOR_FRAG);
    if (!juliaProg || !colorProg) return;

    juliaUniforms = {};
    for (const name of ['u_res', 'u_cx', 'u_cy', 'u_pxsz', 'u_iters']) {
        juliaUniforms[name] = gl.getUniformLocation(juliaProg, name);
    }
    colorUniforms = {};
    for (const name of ['u_res', 'u_cscale', 'u_pa', 'u_pb', 'u_pc', 'u_pd', 'u_poff', 'u_bfreq', 'u_iter_tex']) {
        colorUniforms[name] = gl.getUniformLocation(colorProg, name);
    }

    // Full-screen quad
    quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    quadAPos_julia = gl.getAttribLocation(juliaProg, 'a_pos');
    quadAPos_color = gl.getAttribLocation(colorProg,  'a_pos');

    // Iteration texture + FBO
    iterTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, iterTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    iterFBO = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, iterFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, iterTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    initUI();
    render();
}

window.addEventListener('DOMContentLoaded', init);
