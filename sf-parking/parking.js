/* SF Parking Ticket Risk Estimator
 * Fetches citation counts aggregated by (day-of-week, hour) from SF Open Data,
 * computes a relative risk score, and shows a monthly timeline for the selected slot.
 *
 * Data: https://data.sfgov.org/Transportation/SFMTA-Parking-Citations-Fines/ab4h-6ztd
 * Socrata SoQL: https://dev.socrata.com/docs/functions/
 *
 * DOW convention (Socrata date_extract_dow): 0 = Sunday ... 6 = Saturday
 */

const API_URL = 'https://data.sfgov.org/resource/ab4h-6ztd.json';
const DAYS    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── State ─────────────────────────────────────────────────────────────────────
let citationData = null; // [7][24] per-weekday-occurrence average counts
let avgFineData  = null; // [7][24] average fine in dollars
let dataWeeks    = null; // weeks spanned by the dataset
let dataMinDate  = null; // earliest citation date
let dataMaxDate  = null; // latest citation date (capped at today)
let globalMax    = null; // max count across all (dow, hour) — shared Y scale

let selectedDow   = new Date().getDay();
let selectedStart = 9;

// Timeline
let tlDebounce = null;
let tlAbort    = null;
let tlData     = []; // [{time, cnt, avgFine}] for the current selection

// Map
let leafletMap     = null;
let heatLayer      = null;
let hmDebounce     = null;
let hmAbort        = null;
let hmAllData      = []; // {lat, lon, month, cnt} — per-(location, month) records
let hmMonths       = []; // sorted unique month timestamps from loaded data
let hmGlobalMax    = null; // P95 of all-time aggregate, locked after first page
let selectedHmMonth = null; // null = all time, else a month timestamp

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function init() {
  console.group('SF Parking: init');
  console.log('Fetching aggregated citation data...');
  try {
    const t0     = performance.now();
    const result = await fetchData();
    citationData = result.data;
    avgFineData  = result.avgFines;
    dataWeeks    = result.weeksSpanned;
    dataMinDate  = result.minDate;
    dataMaxDate  = result.maxDate;
    globalMax    = Math.max(...citationData.flat(), 1);
    console.log(
      `Data loaded in ${(performance.now() - t0).toFixed(0)}ms — ` +
      `${result.weeksSpanned.toFixed(1)} weeks spanned, ` +
      `${result.minDate.toISOString().slice(0,10)} to ${result.maxDate.toISOString().slice(0,10)}, ` +
      `globalMax = ${globalMax.toFixed(1)} citations/occurrence`
    );
  } catch (err) {
    console.error('Init failed:', err);
    document.getElementById('loading').textContent =
      'Could not load data: ' + err.message;
    console.groupEnd();
    return;
  }

  document.getElementById('loading').hidden = true;
  buildControls();
  ['controls', 'chart-container', 'result', 'data-note', 'map-section'].forEach(id => {
    document.getElementById(id).hidden = false;
  });
  initMap();
  console.groupEnd();
  update();
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function apiFetch(params, signal) {
  const url = `${API_URL}?${params}`;
  const res = await fetch(url, signal ? { signal } : undefined);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchData() {
  const aggParams = new URLSearchParams({
    '$select': [
      'date_extract_dow(citation_issued_datetime) as dow',
      'date_extract_hh(citation_issued_datetime)  as hour',
      'count(*) as cnt',
      'avg(fine_amount) as avg_fine',
    ].join(', '),
    '$group': 'dow, hour',
    '$order': 'dow, hour',
    '$limit': '200',
  });

  const rangeParams = new URLSearchParams({
    '$select': [
      'min(citation_issued_datetime) as min_date',
      'max(citation_issued_datetime) as max_date',
    ].join(', '),
  });

  const [aggRows, rangeRows] = await Promise.all([
    apiFetch(aggParams),
    apiFetch(rangeParams),
  ]);

  // Cap max date at today — dataset contains some far-future-dated records
  const minDate      = new Date(rangeRows[0].min_date);
  const maxDate      = new Date(Math.min(new Date(rangeRows[0].max_date), Date.now()));
  const weeksSpanned = (maxDate - minDate) / (7 * 24 * 3600 * 1000);

  const raw      = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const rawFines = Array.from({ length: 7 }, () => new Array(24).fill(0));

  for (const row of aggRows) {
    const d = parseInt(row.dow,  10);
    const h = parseInt(row.hour, 10);
    const c = parseInt(row.cnt,  10);
    const f = parseFloat(row.avg_fine);
    if (d >= 0 && d < 7 && h >= 0 && h < 24 && !isNaN(c)) {
      raw[d][h]      = c;
      rawFines[d][h] = isNaN(f) ? 0 : f;
    }
  }

  // Counts normalised to per-occurrence-of-that-weekday; fines are already averages
  const data     = raw.map(day => day.map(c => c / weeksSpanned));
  const avgFines = rawFines;
  return { data, avgFines, weeksSpanned, minDate, maxDate };
}

async function fetchTimeline(dow, hour, signal) {
  const params = new URLSearchParams({
    '$select': [
      'date_trunc_ym(citation_issued_datetime) as month',
      'count(*) as cnt',
      'avg(fine_amount) as avg_fine',
    ].join(', '),
    '$where': `date_extract_dow(citation_issued_datetime)=${dow} AND date_extract_hh(citation_issued_datetime)=${hour}`,
    '$group': 'month',
    '$order': 'month',
    '$limit': '300',
  });
  return apiFetch(params, signal);
}

// ── Controls ──────────────────────────────────────────────────────────────────

function buildControls() {
  const dayWrap = document.getElementById('day-buttons');
  DAYS.forEach((label, i) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.dataset.dow = i;
    if (i === selectedDow) btn.classList.add('active');
    btn.addEventListener('click', () => {
      selectedDow = i;
      dayWrap.querySelectorAll('button').forEach(b =>
        b.classList.toggle('active', +b.dataset.dow === i)
      );
      update();
    });
    dayWrap.appendChild(btn);
  });

  const slider = document.getElementById('start-hour');
  slider.value = selectedStart;
  slider.addEventListener('input', () => {
    selectedStart = +slider.value;
    document.getElementById('time-display').textContent = formatHour(selectedStart);
    update();
  });
  document.getElementById('time-display').textContent = formatHour(selectedStart);

  const totalPerWeek = citationData.flat().reduce((a, b) => a + b, 0);
  const totalM = (totalPerWeek * dataWeeks / 1e6).toFixed(1);
  document.getElementById('data-note').textContent =
    `Based on ${totalM} million citations recorded in San Francisco (2008–present). ` +
    `Counts shown are city-wide averages for a single occurrence of that day. ` +
    `Absolute probability depends on local enforcement density and violation type.`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatHour(h) {
  if (h === 0)  return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

function fmtFine(f) {
  return '$' + f.toFixed(2);
}

function slotLabel(dow, hour) {
  return `${DAYS[dow]} ${formatHour(hour)}–${formatHour((hour + 1) % 24)}`;
}

// ── Render ────────────────────────────────────────────────────────────────────

function update() {
  if (!citationData) return;
  console.log(`Selection: ${slotLabel(selectedDow, selectedStart)}`);
  renderChart();
  renderResult();
  scheduleTimelineFetch();
  scheduleHeatmapFetch();
}

function renderChart() {
  const chart    = document.getElementById('chart');
  chart.innerHTML = '';
  const hours    = citationData[selectedDow];
  const maxCount = globalMax;

  for (let h = 0; h < 24; h++) {
    const col  = document.createElement('div');
    col.className = 'bar-col';

    const fill = document.createElement('div');
    fill.className = 'bar-fill' + (h === selectedStart ? ' bar-selected' : '');
    fill.style.height = `${(hours[h] / maxCount * 100).toFixed(1)}%`;
    const avgFine = avgFineData[selectedDow][h];
    fill.title = `${formatHour(h)}: ~${Math.round(hours[h])} citations, avg fine ${fmtFine(avgFine)}`;

    col.appendChild(fill);
    chart.appendChild(col);
  }
}

function renderResult() {
  const hours   = citationData[selectedDow];
  const cnt     = hours[selectedStart];
  const avgFine = avgFineData[selectedDow][selectedStart];
  const dayAvg  = hours.reduce((a, b) => a + b, 0) / 24;
  const ratio   = cnt / Math.max(dayAvg, 1);

  let riskLabel, riskClass;
  if      (ratio < 0.6) { riskLabel = 'Low Risk';      riskClass = 'low';    }
  else if (ratio < 1.2) { riskLabel = 'Moderate Risk'; riskClass = 'medium'; }
  else if (ratio < 2.0) { riskLabel = 'High Risk';     riskClass = 'high';   }
  else                  { riskLabel = 'Very High Risk'; riskClass = 'high';   }

  const barPct   = Math.min(ratio / 4, 1) * 100;
  const barColor = riskClass === 'low'
    ? 'var(--callout-tip-color)'
    : riskClass === 'medium'
      ? 'var(--callout-warning-color)'
      : 'var(--callout-caution-color)';

  const result = document.getElementById('result');
  result.className = `risk-${riskClass}`;
  result.innerHTML = `
    <div class="risk-level ${riskClass}">${riskLabel}</div>
    <div class="risk-bar-wrap">
      <div class="risk-bar-fill" style="width:${barPct.toFixed(1)}%; background:${barColor}"></div>
    </div>
    <div class="risk-stats">
      On a typical <strong>${DAYS[selectedDow]} ${formatHour(selectedStart)}&ndash;${formatHour((selectedStart + 1) % 24)}</strong>,
      about <strong>~${Math.round(cnt)} citations</strong> are issued across SF
      (<strong>${ratio.toFixed(2)}&times;</strong> the hourly average for this day),
      with an average fine of <strong>${fmtFine(avgFine)}</strong>.
    </div>
  `;
}

// ── Timeline ──────────────────────────────────────────────────────────────────

function scheduleTimelineFetch() {
  clearTimeout(tlDebounce);
  setTimelineLoading(true);
  tlDebounce = setTimeout(doTimelineFetch, 350);
}

async function doTimelineFetch() {
  if (tlAbort) { tlAbort.abort(); console.log('Timeline: aborted previous request'); }
  tlAbort = new AbortController();
  const dow  = selectedDow;
  const hour = selectedStart;
  const t0   = performance.now();
  console.log(`Timeline: fetching ${slotLabel(dow, hour)}...`);
  try {
    const rows = await fetchTimeline(dow, hour, tlAbort.signal);
    if (dow === selectedDow && hour === selectedStart) {
      console.log(`Timeline: ${rows.length} months received in ${(performance.now() - t0).toFixed(0)}ms`);
      renderTimeline(rows);
    } else {
      console.log('Timeline: response discarded (selection changed)');
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      console.log('Timeline: fetch aborted');
    } else {
      console.error('Timeline: fetch failed', e);
      setTimelineLoading(false);
    }
  }
}

function setTimelineLoading(loading) {
  const container = document.getElementById('timeline-container');
  const svg = document.getElementById('timeline-svg');
  if (loading) {
    container.hidden = false;
    svg.style.opacity = '0.3';
    document.querySelector('.timeline-heading').textContent =
      `${DAYS[selectedDow]} ${formatHour(selectedStart)}\u2013${formatHour((selectedStart + 1) % 24)} \u2014 loading\u2026`;
  } else {
    svg.style.opacity = '1';
  }
}

function renderTimeline(rows) {
  // Each calendar month contains an average of 365.25/12/7 ≈ 4.348 occurrences
  // of any given weekday. Dividing the monthly count by this converts it to the
  // same per-occurrence scale used by the bar chart, so both share globalMax.
  const OCCURRENCES_PER_MONTH = (365.25 / 12) / 7;

  const now = Date.now();
  tlData = rows
    .map(r => ({
      time:    new Date(r.month).getTime(),
      cnt:     parseInt(r.cnt, 10) / OCCURRENCES_PER_MONTH,
      avgFine: parseFloat(r.avg_fine) || 0,
    }))
    .filter(r => r.time <= now && !isNaN(r.cnt))
    .sort((a, b) => a.time - b.time);

  console.log(
    `Timeline: rendered ${tlData.length} months, ` +
    `peak = ${Math.max(...tlData.map(r => r.cnt)).toFixed(1)} citations/occurrence`
  );

  document.querySelector('.timeline-heading').textContent =
    `Monthly citations \u2014 ${DAYS[selectedDow]} ${formatHour(selectedStart)}\u2013${formatHour((selectedStart + 1) % 24)}`;

  if (tlData.length === 0) {
    document.getElementById('timeline-svg').innerHTML =
      '<text x="300" y="55" text-anchor="middle" font-size="11" fill="var(--text-pale-color)">No data</text>';
    setTimelineLoading(false);
    return;
  }

  const W   = 600, H = 110;
  const pad = { top: 10, right: 8, bottom: 28, left: 8 };
  const pw  = W - pad.left - pad.right;
  const ph  = H - pad.top  - pad.bottom;

  const minT = tlData[0].time;
  const maxT = tlData[tlData.length - 1].time;

  const xScale = t => pad.left + (t - minT) / (maxT - minT) * pw;
  const yScale = c => pad.top + ph - (c / globalMax * ph);

  const pts      = tlData.map(r => `${xScale(r.time).toFixed(1)},${yScale(r.cnt).toFixed(1)}`);
  const linePath = 'M' + pts.join(' L');
  const areaPath = linePath
    + ` L${xScale(maxT).toFixed(1)},${(pad.top + ph).toFixed(1)}`
    + ` L${xScale(minT).toFixed(1)},${(pad.top + ph).toFixed(1)} Z`;

  const firstYear = new Date(minT).getFullYear();
  const lastYear  = new Date(maxT).getFullYear();
  const yearTicks = [];
  for (let y = firstYear + 1; y <= lastYear; y++) {
    const t = Date.UTC(y, 0, 1);
    if (t > minT && t < maxT) yearTicks.push({ x: xScale(t), y });
  }
  const labelEvery = yearTicks.length > 10 ? 2 : 1;

  const ticksHtml = yearTicks.map((t, i) => `
    <line x1="${t.x.toFixed(1)}" y1="${pad.top}" x2="${t.x.toFixed(1)}" y2="${pad.top + ph}"
          stroke="var(--text-decoration-color)" stroke-width="0.5"/>
    ${i % labelEvery === 0
      ? `<text x="${t.x.toFixed(1)}" y="${H - 5}" text-anchor="middle"
               font-size="9" fill="var(--text-pale-color)">${t.y}</text>`
      : ''}
  `).join('');

  const svg = document.getElementById('timeline-svg');
  svg.innerHTML = `
    <defs>
      <linearGradient id="tl-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="var(--primary-color)" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="var(--primary-color)" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    ${ticksHtml}
    <path d="${areaPath}" fill="url(#tl-grad)" stroke="none"/>
    <path d="${linePath}" fill="none" stroke="var(--primary-color)"
          stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    <g id="tl-cursor" visibility="hidden">
      <line id="tl-cursor-line" x1="0" y1="${pad.top}" x2="0" y2="${pad.top + ph}"
            stroke="var(--text-color)" stroke-width="1" stroke-dasharray="3,2"/>
      <circle id="tl-cursor-dot" cx="0" cy="0" r="3.5"
              fill="var(--primary-color)" stroke="var(--bg-color)" stroke-width="1.5"/>
      <rect id="tl-cursor-bg" x="0" y="${pad.top}" width="1" height="18" rx="2"
            fill="var(--bg-color)" stroke="var(--text-decoration-color)" stroke-width="0.75"/>
      <text id="tl-cursor-text" x="0" y="${pad.top + 12.5}"
            font-size="9.5" fill="var(--text-color)"></text>
    </g>
  `;

  svg.addEventListener('mousemove', onTimelineHover);
  svg.addEventListener('mouseleave', () => {
    svg.querySelector('#tl-cursor').setAttribute('visibility', 'hidden');
  });

  setTimelineLoading(false);
}

function onTimelineHover(e) {
  if (tlData.length < 2) return;
  const svg  = document.getElementById('timeline-svg');
  const rect = svg.getBoundingClientRect();

  const W   = 600, H = 110;
  const pad = { top: 10, right: 8, bottom: 28, left: 8 };
  const pw  = W - pad.left - pad.right;
  const ph  = H - pad.top  - pad.bottom;

  const svgX = (e.clientX - rect.left) / rect.width * W;

  const minT = tlData[0].time;
  const maxT = tlData[tlData.length - 1].time;

  const xScale = t => pad.left + (t - minT) / (maxT - minT) * pw;
  const yScale = c => pad.top + ph - (c / globalMax * ph);

  let best = tlData[0], bestDist = Infinity;
  for (const r of tlData) {
    const d = Math.abs(xScale(r.time) - svgX);
    if (d < bestDist) { bestDist = d; best = r; }
  }

  const cx = xScale(best.time);
  const cy = yScale(best.cnt);

  const dateStr = new Date(best.time).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const label   = `${dateStr} \u2014 ${best.cnt.toFixed(1)} citations, avg ${fmtFine(best.avgFine)}`;
  const labelW  = label.length * 5.5 + 8;
  const labelX  = cx + labelW + pad.right > W ? cx - labelW - 2 : cx + 2;

  const cursor = svg.querySelector('#tl-cursor');
  cursor.setAttribute('visibility', 'visible');
  svg.querySelector('#tl-cursor-line').setAttribute('x1', cx.toFixed(1));
  svg.querySelector('#tl-cursor-line').setAttribute('x2', cx.toFixed(1));
  svg.querySelector('#tl-cursor-dot').setAttribute('cx', cx.toFixed(1));
  svg.querySelector('#tl-cursor-dot').setAttribute('cy', cy.toFixed(1));
  svg.querySelector('#tl-cursor-bg').setAttribute('x',      labelX.toFixed(1));
  svg.querySelector('#tl-cursor-bg').setAttribute('width',  labelW.toFixed(1));
  svg.querySelector('#tl-cursor-text').setAttribute('x',    (labelX + 4).toFixed(1));
  svg.querySelector('#tl-cursor-text').textContent = label;
}

// ── Map ───────────────────────────────────────────────────────────────────────

const HM_PAGE_SIZE = 1000; // rows per paginated request
const HM_MAX_PAGES = 10;   // cap at 10,000 total records

function initMap() {
  leafletMap = L.map('map', { center: [37.7749, -122.4194], zoom: 13 });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(leafletMap);

  console.log('Map: Leaflet initialised, center SF');
}

function scheduleHeatmapFetch() {
  clearTimeout(hmDebounce);
  setHeatmapProgress(null);
  hmDebounce = setTimeout(doHeatmapFetch, 500);
}

async function doHeatmapFetch() {
  if (hmAbort) { hmAbort.abort(); console.log('Heatmap: aborted previous request'); }
  hmAbort = new AbortController();
  const signal = hmAbort.signal;
  const dow    = selectedDow;
  const hour   = selectedStart;

  // Reset per-selection state
  hmAllData       = [];
  hmMonths        = [];
  hmGlobalMax     = null;
  selectedHmMonth = null;
  const slider = document.getElementById('hm-month-slider');
  if (slider) { slider.value = 0; }
  const label = document.getElementById('hm-month-label');
  if (label) { label.textContent = 'All time'; }

  console.group(`Heatmap: ${slotLabel(dow, hour)}`);

  document.getElementById('map-heading').textContent =
    `Citation locations \u2014 ${DAYS[dow]} ${formatHour(hour)}\u2013${formatHour((hour + 1) % 24)}`;

  for (let page = 0; page < HM_MAX_PAGES; page++) {
    const offset = page * HM_PAGE_SIZE;
    const t0 = performance.now();
    let rows;
    try {
      rows = await fetchHeatmapPage(dow, hour, offset, signal);
    } catch (e) {
      if (e.name === 'AbortError') {
        console.log(`Heatmap: page ${page + 1} aborted`);
      } else {
        console.error(`Heatmap: page ${page + 1} failed`, e);
        setHeatmapProgress(null);
      }
      console.groupEnd();
      return;
    }

    if (dow !== selectedDow || hour !== selectedStart) {
      console.log(`Heatmap: page ${page + 1} discarded (selection changed)`);
      console.groupEnd();
      return;
    }

    const newPoints = parseHeatmapRows(rows);
    hmAllData = hmAllData.concat(newPoints);

    // Update sorted unique months list
    const monthSet = new Set(hmAllData.map(p => p.month).filter(m => m !== null));
    hmMonths = [...monthSet].sort((a, b) => a - b);

    const elapsed = (performance.now() - t0).toFixed(0);
    const done    = rows.length < HM_PAGE_SIZE;

    if (page === 0) {
      // Lock color scale at P95 of the all-time aggregate
      const aggrCounts = buildHeatPoints(null).map(p => p[2]).sort((a, b) => a - b);
      hmGlobalMax = aggrCounts[Math.floor(aggrCounts.length * 0.95)] ?? 1;
      console.log(`Heatmap: scale locked at P95 = ${hmGlobalMax}, ${hmMonths.length} months so far`);
      initMonthSlider();
    }

    syncMonthSlider();
    renderHeatForMonth(selectedHmMonth);

    console.log(
      `Page ${page + 1}: ${rows.length} rows in ${elapsed}ms — ` +
      `${hmAllData.length} records, ${hmMonths.length} months` +
      (done ? ' [last page]' : '')
    );
    setHeatmapProgress({ records: hmAllData.length, months: hmMonths.length, done });

    if (done) break;
  }

  // Ensure the progress indicator shows "done" even if we hit the page cap
  setHeatmapProgress({ records: hmAllData.length, months: hmMonths.length, done: true });
  console.groupEnd();
}

function fetchHeatmapPage(dow, hour, offset, signal) {
  const params = new URLSearchParams({
    '$select': [
      'latitude',
      'longitude',
      'date_trunc_ym(citation_issued_datetime) as month',
      'count(*) as cnt',
    ].join(', '),
    '$where': [
      'latitude IS NOT NULL',
      'longitude IS NOT NULL',
      `date_extract_dow(citation_issued_datetime) = ${dow}`,
      `date_extract_hh(citation_issued_datetime) = ${hour}`,
    ].join(' AND '),
    '$group':  'latitude, longitude, date_trunc_ym(citation_issued_datetime)',
    '$order':  'cnt DESC',
    '$limit':  String(HM_PAGE_SIZE),
    '$offset': String(offset),
  });
  return apiFetch(params, signal);
}

// Socrata returns geographic columns as WKT: "POINT(lon lat)"
const WKT_RE = /POINT\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/;

function parseHeatmapRows(rows) {
  const points = [];
  for (const r of rows) {
    const cnt = parseInt(r.cnt, 10);
    if (isNaN(cnt)) continue;
    const m = (r.latitude || r.longitude || '').match(WKT_RE);
    if (!m) continue;
    const lon = parseFloat(m[1]);
    const lat = parseFloat(m[2]);
    if (isNaN(lat) || isNaN(lon)) continue;
    const month = r.month ? new Date(r.month).getTime() : null;
    points.push({ lat, lon, cnt, month });
  }
  return points;
}

// Build [lat, lon, cnt] triples for Leaflet.heat, aggregating by location when
// month is null (all-time view) or filtering to a specific month timestamp.
function buildHeatPoints(month) {
  if (month === null) {
    const byLoc = new Map();
    for (const p of hmAllData) {
      const key = `${p.lat},${p.lon}`;
      const existing = byLoc.get(key);
      if (existing) existing[2] += p.cnt;
      else byLoc.set(key, [p.lat, p.lon, p.cnt]);
    }
    return [...byLoc.values()];
  }
  return hmAllData.filter(p => p.month === month).map(p => [p.lat, p.lon, p.cnt]);
}

function renderHeatForMonth(month) {
  updateHeatLayer(buildHeatPoints(month), hmGlobalMax);
}

// ── Month slider ──────────────────────────────────────────────────────────────

function initMonthSlider() {
  if (document.getElementById('hm-time-wrap')) return;
  const wrap = document.createElement('div');
  wrap.id = 'hm-time-wrap';
  wrap.innerHTML = `
    <span class="ctrl-label">Time period: <strong id="hm-month-label">All time</strong></span>
    <input type="range" id="hm-month-slider" min="0" max="0" value="0" step="1">
  `;
  // Insert above the progress line
  const section  = document.getElementById('map-section');
  const progress = document.getElementById('map-progress');
  section.insertBefore(wrap, progress);
  document.getElementById('hm-month-slider').addEventListener('input', onHmMonthSlider);
}

function syncMonthSlider() {
  const slider = document.getElementById('hm-month-slider');
  if (!slider) return;
  slider.max = hmMonths.length;
}

function onHmMonthSlider(e) {
  const idx = +e.target.value;
  selectedHmMonth = idx === 0 ? null : hmMonths[idx - 1];
  document.getElementById('hm-month-label').textContent = selectedHmMonth
    ? new Date(selectedHmMonth).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : 'All time';
  renderHeatForMonth(selectedHmMonth);
}

// ── Heat layer ────────────────────────────────────────────────────────────────

function updateHeatLayer(points, max) {
  if (!heatLayer) {
    heatLayer = L.heatLayer(points, {
      radius:   10,
      blur:     8,
      maxZoom:  17,
      max,
      gradient: { 0.2: '#4575b4', 0.45: '#fee090', 0.7: '#f46d43', 1.0: '#d73027' },
    }).addTo(leafletMap);
    leafletMap.invalidateSize();
  } else {
    heatLayer.setLatLngs(points);
    heatLayer.redraw();
  }
}

function totalDatasetMonths() {
  if (!dataMinDate || !dataMaxDate) return null;
  return (dataMaxDate.getFullYear() - dataMinDate.getFullYear()) * 12
       + (dataMaxDate.getMonth()    - dataMinDate.getMonth()) + 1;
}

function setHeatmapProgress(state) {
  const el = document.getElementById('map-progress');
  if (!el) return;
  if (!state) { el.textContent = ''; return; }
  const total     = totalDatasetMonths();
  const monthStr  = total ? `${state.months}\u202f/\u202f${total}` : `${state.months}`;
  if (state.done) {
    el.textContent =
      `${state.records.toLocaleString()} records loaded across ${monthStr} months`;
  } else {
    el.textContent =
      `${state.records.toLocaleString()} records loaded across ${monthStr} months \u2014 loading more\u2026`;
  }
}

init();
