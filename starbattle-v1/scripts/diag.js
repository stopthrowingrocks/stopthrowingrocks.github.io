#!/usr/bin/env node
// Quick diagnostic — loads each failing category and dumps DOM info
const { chromium } = require('playwright');

const CATS = [
  { sizeParam: 5, label: '10×10 2★ Normal', N: 10 },
  { sizeParam: 7, label: '14×14 3★ Normal', N: 14 },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx  = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  page.on('dialog', d => d.dismiss().catch(() => {}));

  for (const cat of CATS) {
    console.log(`\n${'='.repeat(60)}\n${cat.label}\n${'='.repeat(60)}`);
    const url = `https://www.puzzle-star-battle.com/?size=${cat.sizeParam}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait up to 8s for something to settle
    await new Promise(r => setTimeout(r, 4000));

    // All td elements — count and first few
    const tdInfo = await page.$$eval('td', tds => ({
      count: tds.length,
      first5: tds.slice(0, 5).map(td => ({
        class: td.className,
        data: { ...td.dataset },
        bg: window.getComputedStyle(td).backgroundColor,
        style: td.getAttribute('style') || '',
        innerText: td.innerText.slice(0, 30),
      })),
    })).catch(e => ({ error: e.message }));
    console.log('td elements:', JSON.stringify(tdInfo, null, 2));

    // All string / array globals that look puzzle-related
    const globals = await page.evaluate(() => {
      const out = {};
      for (const k of Object.keys(window)) {
        try {
          const v = window[k];
          if (typeof v === 'string' && v.length >= 10 && v.length < 2000) {
            out[`STR:${k}`] = v.slice(0, 200);
          } else if (Array.isArray(v) && v.length >= 10 && v.length < 500) {
            out[`ARR:${k}`] = JSON.stringify(v).slice(0, 200);
          }
        } catch {}
      }
      return out;
    }).catch(() => ({}));
    console.log('\nJS globals (strings/arrays):', JSON.stringify(globals, null, 2));

    // Check for canvas elements (alternative rendering)
    const canvases = await page.$$eval('canvas', cs => cs.map(c => ({
      id: c.id, class: c.className, w: c.width, h: c.height,
    }))).catch(() => []);
    console.log('\nCanvas elements:', JSON.stringify(canvases));

    // Check for SVG
    const svgs = await page.$$eval('svg', ss => ss.map(s => ({
      id: s.id, class: s.className.baseVal, w: s.getAttribute('width'), h: s.getAttribute('height'),
    }))).catch(() => []);
    console.log('\nSVG elements:', JSON.stringify(svgs));

    // Find all table elements with counts
    const tables = await page.$$eval('table', ts => ts.map(t => ({
      id: t.id, class: t.className, rows: t.rows.length,
      cols: t.rows[0] ? t.rows[0].cells.length : 0,
    }))).catch(() => []);
    console.log('\nTables:', JSON.stringify(tables, null, 2));

    // Wait a bit more and try again (page might load lazily)
    await new Promise(r => setTimeout(r, 3000));
    const tdCount2 = await page.$$eval('td', tds => tds.length).catch(() => 0);
    console.log(`\ntd count after extra 3s: ${tdCount2}`);

    // Check task var
    const taskResult = await page.evaluate(N => {
      for (const k of ['task', 'gameTask', 'puzzle_task', 'taskStr', 'g_task', 'PuzzleData']) {
        if (window[k] !== undefined) return { key: k, val: String(window[k]).slice(0, 300), type: typeof window[k] };
      }
      // Deep search for a string matching expected length
      for (const k of Object.keys(window)) {
        try {
          const v = window[k];
          if (typeof v === 'string') {
            const clean = v.replace(/[^a-z0-9]/gi, '');
            if (clean.length === N * N) return { key: k, val: v.slice(0, 300), len: v.length };
          }
        } catch {}
      }
      return null;
    }, cat.N).catch(() => null);
    console.log('\ntask variable search:', JSON.stringify(taskResult, null, 2));
  }

  await browser.close();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
