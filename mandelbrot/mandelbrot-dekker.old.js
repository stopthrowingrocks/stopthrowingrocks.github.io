// Mandelbrot Set Explorer
// Deep zoom via perturbation theory: a reference orbit is computed in float64
// on the CPU, then the GPU computes small single-precision deltas per pixel.
// Supports zoom depths up to ~10^15.
//
// Two-pass rendering:
//   Pass 1 (iteration): computes smooth escape time → packed RGBA8 texture (only on geometry change)
//   Pass 2 (color):     reads texture, applies palette (runs every frame)

// ─── Shaders ────────────────────────────────────────────────────────────────

const VERT = `#version 300 es
in vec2 a_pos;
void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Pass 1: compute smooth escape time via Dekker DD arithmetic (vec2 = hi+lo).
// Uses fma() for exact error-free products and bit-cast barriers to prevent
// GLSL compiler algebraic simplification of error terms.
const ITER_FRAG = `#version 300 es
#pragma optimize("", off)
precision highp float;

uniform vec2  u_res;
uniform vec2  u_ctr_x;   // center of the screen, cx as double-double (hi, lo)
uniform vec2  u_ctr_y;   // center of the screen, cy as double-double (hi, lo)
uniform float u_pxsz;    // world units per pixel
uniform float u_iters;

out vec4 fragColor;

// ── Dekker Double-Double (DD) arithmetic ──────────────────────────────────
// A DD number is vec2(hi, lo) with true value = hi + lo.

vec2 twoSum(float a, float b) {
    float s = a + b;
    float v = s - a;
    return vec2(s, (a - (s - v)) + (b - v));
}

// First argument should be the larger one
// Confirmed to work in regular JS with floats like 0.2 + 0.1
vec2 quickTwoSum(float a, float b) {
    float s = a + b;
    float t = b - (s - a);
    if (t != 0.0) { t = 1.0; } // TODO This should be activated at least once
    return vec2(s, t);
}

vec2 split(float a) {
    float t  = 4097.0 * a;
    float diff = float(t - a);
    float hi = t - diff;
    float low = a - hi;
    if (hi != a) { hi = 1.0; } // TODO This should be activated at least once
    return vec2(hi, low);
}

vec2 twoProd(float a, float b) {
    float p  = a * b;
    vec2  sa = split(a);
    vec2  sb = split(b);
    float e  = ((sa.x * sb.x - p) + sa.x * sb.y + sa.y * sb.x) + sa.y * sb.y;
    return vec2(p, e);
}

// DD addition
vec2 dd_add(vec2 a, vec2 b) {
    vec2 s = twoSum(a.x, b.x);
    vec2 t = twoSum(a.y, b.y);
    s.y += t.x;
    s = quickTwoSum(s.x, s.y);
    s.y += t.y;
    return quickTwoSum(s.x, s.y);
}

// DD subtraction
vec2 dd_sub(vec2 a, vec2 b) {
    return dd_add(a, vec2(-b.x, -b.y));
}

// DD multiplication
vec2 dd_mul(vec2 a, vec2 b) {
    vec2 p = twoProd(a.x, b.x);
    p.y += a.x * b.y + a.y * b.x;
    return quickTwoSum(p.x, p.y);
}

void main() {
    vec2 offset = gl_FragCoord.xy - u_res * 0.5;

    // c = center + offset * pixelSize
    // TODO check that this allows for small values
    vec2 px = dd_add(u_ctr_x, vec2(offset.x * u_pxsz, 0.0));
    vec2 py = dd_add(u_ctr_y, vec2(offset.y * u_pxsz, 0.0));

    vec2 zx = vec2(0.0);
    vec2 zy = vec2(0.0);

    const float ESC2 = 256.0;
    int  n  = -1;
    float ex = 0.0, ey = 0.0;

    for (int i = 0; i < 65536; i++) {
        if (float(i) >= u_iters) break;
        ex = zx.x;
        ey = zy.x;
        float r2 = ex * ex + ey * ey;
        if (r2 > ESC2 || r2 != r2) { n = i; break; }
        vec2 zx_pl_y = dd_add(zx, zy);
        vec2 zx_mn_y = dd_sub(zx, zy);
        vec2 zx2_mn_y2 = dd_mul(zx_mn_y, zx_pl_y);
        vec2 z2xy = 2.0 * dd_mul(zx, zy);
        zx = dd_add(zx2_mn_y2, px);
        zy = dd_add(z2xy, py);
    }

    if (n == -1) {
        fragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }

    float r2      = clamp(ex * ex + ey * ey, 5.0, 1e30);
    float log_r   = log(r2) * 0.5;
    float nu      = log(log_r / log(2.0)) / log(2.0);
    float smoothV = float(n) + 1.0 - nu;

    float norm = smoothV / 65536.0;
    float r    = floor(norm * 255.0) / 255.0;
    float g    = floor(fract(norm * 255.0) * 255.0) / 255.0;
    float b    = fract(norm * 255.0 * 255.0);
    fragColor = vec4(r, g, b, 1.0);
}`;

// Pass 2: read packed iteration texture, apply cosine palette.
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
    // Brightness modulation: white → color → black → color
    float b = cos(6.28318 * u_bfreq * t);
    color = mix(color, vec3(1.0), max(b, 0.0) * 0.9);
    color = mix(color, vec3(0.0), max(-b, 0.0) * 0.9);
    return color;
}

void main() {
    vec2 uv   = gl_FragCoord.xy / u_res;
    vec4 data = texture(u_iter_tex, uv);

    if (data.a < 0.5) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    float smoothV = (data.r + data.g / 255.0 + data.b / 65025.0) * 65536.0;
    fragColor = vec4(palette(smoothV / u_cscale), 1.0);
}`;

// ─── Palettes ────────────────────────────────────────────────────────────────

const PALETTES = [
    { name: 'Rainbow',  a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1.0, 1.0, 1.0], d: [0.00, 0.33, 0.67] },
    { name: 'Electric', a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1.0, 1.0, 1.0], d: [0.00, 0.10, 0.20] },
    { name: 'Fire',     a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1.0, 1.0, 0.5], d: [0.00, 0.10, 0.50] },
    { name: 'Arctic',   a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [2.0, 1.0, 0.0], d: [0.50, 0.20, 0.25] },
    { name: 'Sunset',   a: [0.8, 0.5, 0.4], b: [0.2, 0.4, 0.2], c: [2.0, 1.0, 1.0], d: [0.00, 0.25, 0.25] },
    { name: 'Gold',     a: [0.5, 0.4, 0.2], b: [0.5, 0.4, 0.2], c: [1.0, 1.0, 0.0], d: [0.00, 0.05, 0.20] },
];

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
    cx: -0.5, cy: 0.0,   // float64 center
    zoom: 250.0,          // pixels per world unit
    maxIter: 4096,
    palIdx: 0,
    palOffset: 0.0,
    colorScale: 9,
    brightFreq: 16,
};

let gl;
let iterProg, colorProg;
let iterUniforms, colorUniforms;
let quadBuf, quadAPos_iter, quadAPos_color;
let iterFBO, iterTex, iterTexW = 0, iterTexH = 0;
let iterDirty = true;

let dragging = false;
let dragX = 0, dragY = 0, dragCX = 0, dragCY = 0;

// ─── Animation ───────────────────────────────────────────────────────────────

const anim = { playing: true, speed: 0.15, dir: -1, rafId: null, lastT: null };

function animTick(t) {
    if (!anim.playing) return;
    anim.rafId = requestAnimationFrame(animTick);
    if (anim.lastT === null) { anim.lastT = t; return; }
    const dt = (t - anim.lastT) / 1000;
    anim.lastT = t;
    const effSpeed = anim.speed / Math.max(state.brightFreq, 1);
    state.palOffset = ((state.palOffset + anim.dir * effSpeed * dt) % 1 + 1) % 1;
    const slider = document.getElementById('pal-offset');
    if (slider) slider.value = state.palOffset;
    render();  // iterDirty stays false → only color pass runs
}

function setPlaying(on) {
    anim.playing = on;
    const btn = document.getElementById('anim-play');
    if (btn) btn.textContent = on ? '⏸' : '▶';
    if (on) { anim.lastT = null; anim.rafId = requestAnimationFrame(animTick); }
    else if (anim.rafId) { cancelAnimationFrame(anim.rafId); anim.rafId = null; }
}

// ─── WebGL helpers ────────────────────────────────────────────────────────────

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

function createProgram(vertSrc, fragSrc) {
    const vs = compileShader(gl.VERTEX_SHADER, vertSrc);
    const fs = compileShader(gl.FRAGMENT_SHADER, fragSrc);
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

// Split a float64 into a double-double pair [hi, lo] of float32 values.
function splitDD(x) {
    const hi = Math.fround(x);
    const lo = Math.fround(x - hi);
    return [hi, lo];
}

// ─── Render ──────────────────────────────────────────────────────────────────

function render() {
    const canvas = gl.canvas;

    // Resize canvas to CSS size × DPR (capped at 2×)
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w   = Math.round(canvas.clientWidth  * dpr);
    const h   = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width  = w;
        canvas.height = h;
    }

    // ── Pass 1: Iteration (only when geometry changed or canvas resized) ──────
    if (iterDirty || iterTexW !== w || iterTexH !== h) {
        if (iterTexW !== w || iterTexH !== h) {
            gl.bindTexture(gl.TEXTURE_2D, iterTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            iterTexW = w;
            iterTexH = h;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, iterFBO);
        gl.viewport(0, 0, w, h);
        gl.useProgram(iterProg);

        const cx = splitDD(state.cx);
        const cy = splitDD(state.cy);

        gl.uniform2f(iterUniforms.u_res,    w, h);
        gl.uniform2fv(iterUniforms.u_ctr_x, cx);
        gl.uniform2fv(iterUniforms.u_ctr_y, cy);
        gl.uniform1f(iterUniforms.u_pxsz,   1.0 / (state.zoom * dpr));
        gl.uniform1f(iterUniforms.u_iters,  state.maxIter);

        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
        gl.enableVertexAttribArray(quadAPos_iter);
        gl.vertexAttribPointer(quadAPos_iter, 2, gl.FLOAT, false, 0, 0);
        const t0 = performance.now();
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.finish();  // wait for GPU to complete
        const dt = performance.now() - t0;
        const el = document.getElementById('render-time');
        if (el) el.textContent = dt < 1000 ? `${dt.toFixed(0)} ms` : `${(dt / 1000).toFixed(1)} s`;

        iterDirty = false;
    }

    // ── Pass 2: Colorization (every frame) ───────────────────────────────────
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
}

// ─── Events ──────────────────────────────────────────────────────────────────

function initEvents(canvas) {
    // Zoom toward cursor
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        let dy = e.deltaY;
        if (e.deltaMode === 1) dy *= 16;
        if (e.deltaMode === 2) dy *= 100;
        const factor = Math.pow(2, -dy / 500);

        const mx = e.offsetX;
        const my = canvas.clientHeight - e.offsetY;

        const wx = state.cx + (mx - canvas.clientWidth  / 2) / state.zoom;
        const wy = state.cy + (my - canvas.clientHeight / 2) / state.zoom;

        state.zoom *= factor;

        state.cx = wx - (mx - canvas.clientWidth  / 2) / state.zoom;
        state.cy = wy - (my - canvas.clientHeight / 2) / state.zoom;

        iterDirty = true;
        updateInfo();
        render();
    }, { passive: false });

    // Pan: drag
    canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        dragging = true;
        dragX  = e.offsetX;
        dragY  = e.offsetY;
        dragCX = state.cx;
        dragCY = state.cy;
        canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const rect = canvas.getBoundingClientRect();
        const x  = e.clientX - rect.left;
        const y  = e.clientY - rect.top;
        const dx = x  - dragX;
        const dy = -(y - dragY);
        state.cx = dragCX - dx / state.zoom;
        state.cy = dragCY - dy / state.zoom;
        iterDirty = true;
        render();
    });

    window.addEventListener('mouseup', () => {
        dragging = false;
        canvas.style.cursor = 'grab';
    });

    // Touch: one finger = pan, two fingers = pinch-zoom
    let lastDist = 0;

    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        if (e.touches.length === 1) {
            dragging = true;
            dragX  = e.touches[0].clientX - rect.left;
            dragY  = e.touches[0].clientY - rect.top;
            dragCX = state.cx;
            dragCY = state.cy;
        } else if (e.touches.length === 2) {
            dragging = false;
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lastDist = Math.hypot(dx, dy);
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        if (e.touches.length === 1 && dragging) {
            const x  = e.touches[0].clientX - rect.left;
            const y  = e.touches[0].clientY - rect.top;
            const dx = x  - dragX;
            const dy = -(y - dragY);
            state.cx = dragCX - dx / state.zoom;
            state.cy = dragCY - dy / state.zoom;
            iterDirty = true;
            render();
        } else if (e.touches.length === 2) {
            const dx   = e.touches[0].clientX - e.touches[1].clientX;
            const dy   = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            if (lastDist > 0) {
                const factor = dist / lastDist;
                const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
                const my = canvas.clientHeight - (e.touches[0].clientY + e.touches[1].clientY) / 2 + rect.top;
                const wx = state.cx + (mx - canvas.clientWidth  / 2) / state.zoom;
                const wy = state.cy + (my - canvas.clientHeight / 2) / state.zoom;
                state.zoom *= factor;
                state.cx = wx - (mx - canvas.clientWidth  / 2) / state.zoom;
                state.cy = wy - (my - canvas.clientHeight / 2) / state.zoom;
                iterDirty = true;
                updateInfo();
                render();
            }
            lastDist = dist;
        }
    }, { passive: false });

    canvas.addEventListener('touchend', () => { dragging = false; lastDist = 0; });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
        if (e.target !== document.body && e.target !== canvas) return;
        switch (e.key) {
            case 'r': case 'R': reset(); break;
            case 'p': case 'P': cyclePalette(); break;
            case '=': case '+': adjustIter(2);   break;
            case '-':            adjustIter(0.5); break;
        }
    });
}

// ─── UI ──────────────────────────────────────────────────────────────────────

function initUI() {
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

    document.getElementById('pal-offset').addEventListener('input', (e) => {
        state.palOffset = +e.target.value;
        if (!anim.playing) render();
    });

    document.getElementById('anim-play').addEventListener('click', () => setPlaying(!anim.playing));
    document.getElementById('anim-dir').addEventListener('click', () => {
        anim.dir *= -1;
        document.getElementById('anim-dir').textContent = anim.dir > 0 ? '→' : '←';
    });
    document.getElementById('anim-speed').addEventListener('input', (e) => {
        anim.speed = +e.target.value;
    });

    document.getElementById('color-scale').addEventListener('input', (e) => {
        state.colorScale = +e.target.value;
        render();
    });

    document.getElementById('bright-freq').addEventListener('input', (e) => {
        state.brightFreq = +e.target.value;
        render();
    });

    document.getElementById('iter-down').addEventListener('click', () => adjustIter(0.5));
    document.getElementById('iter-up').addEventListener('click',   () => adjustIter(2));
    document.getElementById('reset').addEventListener('click', reset);

    updatePalButtons();
    updateInfo();

    // Start animation if default is playing
    if (anim.playing) {
        document.getElementById('anim-play').textContent = '⏸';
        document.getElementById('anim-dir').textContent = anim.dir > 0 ? '→' : '←';
        anim.rafId = requestAnimationFrame(animTick);
    }
}

function adjustIter(factor) {
    state.maxIter = Math.min(65536, Math.max(32, Math.round(state.maxIter * factor)));
    iterDirty = true;
    updateInfo();
    render();
}

function reset() {
    state.cx      = -0.5;
    state.cy      = 0.0;
    state.zoom    = 250.0;
    state.maxIter = 256;
    iterDirty = true;
    updateInfo();
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

function updateInfo() {
    document.getElementById('zoom-val').textContent = state.zoom.toExponential(2);
    document.getElementById('iter-val').textContent = state.maxIter;
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

    iterProg  = createProgram(VERT, ITER_FRAG);
    colorProg = createProgram(VERT, COLOR_FRAG);
    if (!iterProg || !colorProg) return;

    iterUniforms = {};
    for (const name of ['u_res', 'u_ctr_x', 'u_ctr_y', 'u_pxsz', 'u_iters']) {
        iterUniforms[name] = gl.getUniformLocation(iterProg, name);
    }
    colorUniforms = {};
    for (const name of ['u_res', 'u_cscale', 'u_pa', 'u_pb', 'u_pc', 'u_pd', 'u_poff', 'u_bfreq', 'u_iter_tex']) {
        colorUniforms[name] = gl.getUniformLocation(colorProg, name);
    }

    // Full-screen quad (shared between both passes)
    quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1,  1, -1,  -1, 1,  1, 1]), gl.STATIC_DRAW);
    quadAPos_iter  = gl.getAttribLocation(iterProg,  'a_pos');
    quadAPos_color = gl.getAttribLocation(colorProg, 'a_pos');

    // Iteration texture (RGBA8, sized on first render)
    iterTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, iterTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // FBO for iteration pass
    iterFBO = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, iterFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, iterTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    initEvents(canvas);
    initUI();
    render();
}

window.addEventListener('DOMContentLoaded', init);
