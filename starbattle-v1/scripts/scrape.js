#!/usr/bin/env node
/**
 * Scrapes Star Battle puzzles from puzzle-star-battle.com
 * Usage: node scrape.js
 *
 * Saves progress to scrape-progress.json (resumable).
 * Final output → ../levels.json
 */

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { sizeParam: 0, label: '5×5 1★ Normal',   gridSize: 5,  stars: 1, difficulty: 'normal' },
  { sizeParam: 1, label: '6×6 1★ Normal',   gridSize: 6,  stars: 1, difficulty: 'normal' },
  { sizeParam: 2, label: '6×6 1★ Hard',     gridSize: 6,  stars: 1, difficulty: 'hard'   },
  { sizeParam: 3, label: '8×8 1★ Normal',   gridSize: 8,  stars: 1, difficulty: 'normal' },
  { sizeParam: 4, label: '8×8 1★ Hard',     gridSize: 8,  stars: 1, difficulty: 'hard'   },
  { sizeParam: 5, label: '10×10 2★ Normal', gridSize: 10, stars: 2, difficulty: 'normal' },
  { sizeParam: 6, label: '10×10 2★ Hard',   gridSize: 10, stars: 2, difficulty: 'hard'   },
  { sizeParam: 7, label: '14×14 3★ Normal', gridSize: 14, stars: 3, difficulty: 'normal' },
  { sizeParam: 8, label: '14×14 3★ Hard',   gridSize: 14, stars: 3, difficulty: 'hard'   },
];

const TARGET    = 50;
const BASE_URL  = 'https://www.puzzle-star-battle.com';
const OUT_FILE  = path.join(__dirname, '..', 'levels.json');
const PROG_FILE = path.join(__dirname, 'scrape-progress.json');
const DELAY_MS  = 1200;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROG_FILE, 'utf8')); }
  catch { return { puzzles: [], seen: {} }; }
}

function saveProgress(prog) {
  fs.writeFileSync(PROG_FILE, JSON.stringify(prog, null, 2));
}

// Flat region-ID array → rows of single chars
function toShapes(regions, N) {
  const CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';
  const map = {};
  let next = 0;
  const mapped = regions.map(r => {
    if (!(r in map)) map[r] = CHARS[next++ % CHARS.length];
    return map[r];
  });
  const rows = [];
  for (let r = 0; r < N; r++) rows.push(mapped.slice(r * N, (r + 1) * N).join(''));
  return rows;
}

// ---------------------------------------------------------------------------
// Extraction strategies
// ---------------------------------------------------------------------------

// Strategy A: JS global "task" variable (common in this puzzle site family)
// The task is either:
//   a) comma-separated integers: "1,2,3,10,10,..."  ← used by 10×10 and 14×14
//   b) run of single chars: "AABBCC..."             ← used by smaller puzzles
async function tryTaskVar(page, N) {
  const taskStr = await page.evaluate(() => {
    for (const k of ['task', 'gameTask', 'puzzle_task', 'taskStr', 'g_task']) {
      if (typeof window[k] === 'string' && window[k].length >= 4) return window[k];
    }
    for (const k of ['game', 'Game', 'SBattle', 'puzzle']) {
      const v = window[k];
      if (v && typeof v.task === 'string') return v.task;
    }
    return null;
  });
  if (!taskStr) return null;

  // --- comma-separated format ---
  if (taskStr.includes(',')) {
    const parts = taskStr.split(',').map(s => s.trim()).filter(s => s !== '');
    if (parts.length === N * N) {
      const map = {};
      let next = 0;
      return parts.map(p => { if (!(p in map)) map[p] = next++; return map[p]; });
    }
  }

  // --- single-char format ---
  const flat = taskStr.replace(/[^a-z0-9]/gi, '');
  if (flat.length === N * N) {
    const map = {};
    let next = 0;
    return [...flat].map(c => { if (!(c in map)) map[c] = next++; return map[c]; });
  }

  return null;
}

// Strategy B: data-* attributes or region-class on <td>
async function tryDataAttrs(page, N) {
  const vals = await page.$$eval('td', tds => tds.map(td => {
    for (const k of ['area', 'region', 'color', 'group', 'cell', 'id']) {
      if (td.dataset[k] !== undefined) return td.dataset[k];
    }
    const m = td.className.match(/(?:^|\s)(?:area|region|c|r|cell)[-_]?(\w+)(?:\s|$)/);
    return m ? m[1] : null;
  }));
  if (vals.length !== N * N || vals.some(v => v === null)) return null;
  const map = {};
  let next = 0;
  return vals.map(v => { if (!(v in map)) map[v] = next++; return map[v]; });
}

// Strategy C: background colour per cell
async function tryColors(page, N) {
  const colors = await page.$$eval('td', tds => tds.map(td =>
    window.getComputedStyle(td).backgroundColor
  ));
  if (colors.length !== N * N) return null;
  const map = {};
  let next = 0;
  return colors.map(c => {
    const k = c.replace(/\s/g, '');
    if (!(k in map)) map[k] = next++;
    return map[k];
  });
}

// Try all strategies; log diagnostics on first call
async function extractRegions(page, N, verbose) {
  // Wait for window.task to be set (it's injected by PHP before the JS bundle)
  await page.waitForFunction(() => typeof window.task === 'string' && window.task.length > 4,
    { timeout: 20000 });
  await sleep(300);

  if (verbose) {
    const cells = await page.$$eval('td', tds => tds.slice(0, 5).map(td => ({
      class: td.className,
      data: { ...td.dataset },
      bg: window.getComputedStyle(td).backgroundColor,
      style: td.getAttribute('style') || '',
      html: td.outerHTML.slice(0, 120),
    }))).catch(() => []);
    console.log('[DIAG] first cells:', JSON.stringify(cells, null, 2));

    const globals = await page.evaluate(() => {
      const out = {};
      for (const k of Object.keys(window)) {
        try {
          const v = window[k];
          if (typeof v === 'string' && v.length > 8 && v.length < 800
              && /^[a-z0-9/|\\\-_ \n]+$/i.test(v))
            out[k] = v.slice(0, 150);
        } catch {}
      }
      return out;
    }).catch(() => ({}));
    console.log('[DIAG] JS string globals:', JSON.stringify(globals, null, 2));

    // Also dump all links on the page to find "Next" pattern
    const links = await page.$$eval('a[href]', as => as.map(a => ({
      text: a.innerText.trim().slice(0, 30),
      href: a.getAttribute('href'),
    }))).catch(() => []);
    console.log('[DIAG] page links:', JSON.stringify(links.slice(0, 30), null, 2));
  }

  let r;
  r = await tryTaskVar(page, N);  if (r) { verbose && console.log('[DIAG] used: task var');   return r; }
  r = await tryDataAttrs(page, N); if (r) { verbose && console.log('[DIAG] used: data attrs'); return r; }
  r = await tryColors(page, N);    if (r) { verbose && console.log('[DIAG] used: bg colors');  return r; }
  throw new Error('All extraction strategies failed');
}

// ---------------------------------------------------------------------------
// Get puzzle ID from page
// ---------------------------------------------------------------------------

async function getPuzzleId(page) {
  const m = page.url().match(/[?&]id=(\d+)/);
  if (m) return m[1];
  const text = await page.$eval('body', el => el.innerText).catch(() => '');
  const m2 = text.match(/puzzle\s*(?:id|#|no\.?)[\s:]*([0-9,]+)/i);
  return m2 ? m2[1].replace(/,/g, '') : null;
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

// Selectors for the "Next puzzle" link/button (try several patterns)
const NEXT_SELS = [
  'a[title*="next" i]',
  'a[title*="Next" i]',
  'a:text("»")',
  'a:text("›")',
  'a:text(">")',
  'a:text-is("Next")',
  'a.next',
  '.next-puzzle a',
  '#next-puzzle',
  'a[href*="next"]',
  'button:text("Next")',
];

async function goNext(page, cat, baseUrl) {
  // Try clicking a Next-like element
  for (const sel of NEXT_SELS) {
    try {
      const el = await page.$(sel);
      if (el) {
        const href = await el.getAttribute('href');
        if (href) {
          // Navigate directly rather than clicking (avoids pop-ups / dialogs)
          const dest = href.startsWith('http') ? href : BASE_URL + '/' + href.replace(/^\//, '');
          await page.goto(dest, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await sleep(800);
          return true;
        }
        await el.click();
        await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
        await sleep(800);
        return true;
      }
    } catch {}
  }

  // If no Next button, try navigating to currentId + 1
  const id = await getPuzzleId(page);
  if (id) {
    const nextId = parseInt(id, 10) + 1;
    await page.goto(`${baseUrl}&id=${nextId}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(800);
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const prog = loadProgress();
  const seen = prog.seen   ?? {};
  const all  = prog.puzzles ?? [];
  console.log(`Resuming — ${all.length} puzzles already scraped.\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx  = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();

  // Dismiss any dialogs automatically
  page.on('dialog', d => d.dismiss().catch(() => {}));

  let firstEver = true;

  try {
    for (const cat of CATEGORIES) {
      const have = all.filter(p =>
        p.size === cat.gridSize && p.stars === cat.stars && p.difficulty === cat.difficulty
      );
      if (have.length >= TARGET) {
        console.log(`✓ ${cat.label}: already have ${have.length}`);
        continue;
      }
      console.log(`\n── ${cat.label} (${have.length}/${TARGET}) ──`);

      const baseUrl = `${BASE_URL}/?size=${cat.sizeParam}`;
      const N       = cat.gridSize;

      // Always start fresh on the category's default URL
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(1000);

      let attempts   = 0;
      let dupStreak  = 0;
      const verbose  = firstEver;

      while (have.length < TARGET && attempts < TARGET * 6) {
        attempts++;
        try {
          const id     = await getPuzzleId(page);
          const seenKey = `${cat.sizeParam}:${id ?? attempts}`;

          if (id && seen[seenKey]) {
            dupStreak++;
            if (dupStreak > 5) {
              // Force a bigger jump
              const jumpId = parseInt(id, 10) - Math.floor(Math.random() * 500 + 100);
              if (jumpId > 0) {
                await page.goto(`${baseUrl}&id=${jumpId}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
                await sleep(800);
                dupStreak = 0;
              }
            } else {
              await goNext(page, cat, baseUrl);
            }
            continue;
          }
          dupStreak = 0;

          const regions = await extractRegions(page, N, verbose && firstEver);
          if (verbose && firstEver) firstEver = false;

          const uniq = new Set(regions).size;
          if (uniq < 2 || uniq > N * 2) {
            console.log(`  skip: ${uniq} regions (expected ~${N})`);
            await goNext(page, cat, baseUrl);
            continue;
          }

          const shapes = toShapes(regions, N);
          const puzzle = { name: cat.label, difficulty: cat.difficulty, stars: cat.stars, size: N, shapes };

          all.push(puzzle);
          have.push(puzzle);
          if (id) seen[seenKey] = true;

          prog.puzzles = all;
          prog.seen    = seen;
          saveProgress(prog);

          console.log(`  [${have.length}/${TARGET}] id=${id ?? '?'}  regions=${uniq}`);

          await goNext(page, cat, baseUrl);
          await sleep(DELAY_MS);

        } catch (err) {
          console.error(`  attempt ${attempts} err: ${err.message.slice(0, 120)}`);
          // Reload the base URL and try again
          await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
          await sleep(2000);
        }
      }

      if (have.length < TARGET)
        console.warn(`  ⚠ Only got ${have.length}/${TARGET} for ${cat.label}`);
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(all, null, 2));
  console.log(`\n✅  ${all.length} puzzles → ${OUT_FILE}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
