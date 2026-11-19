(() => {
  // src/state.ts
  var state = {
    puzzles: [],
    puzzle: null,
    boardsById: {},
    currentBoardId: 0,
    boardIdCtr: 0,
    groupIdCtr: 0,
    splitMode: false,
    undoStack: [],
    redoStack: [],
    interaction: {
      isDragging: false,
      dragMoved: false,
      mousedownIdx: -1,
      mousedownPrevState: 0 /* EMPTY */,
      isTouch: false
    },
    currentCat: null,
    currentCatPuzzles: null
  };
  var getCurBoard = () => state.boardsById[state.currentBoardId];
  var getCurState = () => state.boardsById[state.currentBoardId].state;

  // src/parse.ts
  function parseLevels(data) {
    const countByName = {};
    return data.map((lvl, i) => {
      const name = lvl.name ?? `Puzzle ${i + 1}`;
      countByName[name] = (countByName[name] ?? 0) + 1;
      return {
        name,
        categoryIndex: countByName[name],
        stars: lvl.stars,
        size: lvl.size,
        regions: lvl.shapes.flatMap((row) => [...row].map((c) => parseInt(c, 36)))
      };
    });
  }
  function groupPuzzles(puzzles) {
    const map = /* @__PURE__ */ new Map();
    for (const p of puzzles) {
      const group = map.get(p.name) ?? [];
      if (!map.has(p.name)) map.set(p.name, group);
      group.push(p);
    }
    return [...map.entries()];
  }

  // src/constants.ts
  var REGION_COLORS = [
    "#E8A0A0",
    "#A0C4E8",
    "#A0E8B4",
    "#EAD8A0",
    "#CCA0E8",
    "#E8E8A0",
    "#A0E4E8",
    "#E8A8D8",
    "#E8C8A0",
    "#B0E8A0",
    "#D4A0E8",
    "#A0D4C8",
    "#E8D4A0",
    "#C8A0C8"
  ];
  var THIN = "1px solid rgba(0,0,0,0.25)";
  var THICK = "3px solid #111";

  // src/constraints.ts
  function computeAutoElim() {
    const cells = getCurState();
    const { size: N, stars: K, regions } = state.puzzle;
    const auto = /* @__PURE__ */ new Set();
    const rowCnt = new Array(N).fill(0);
    const colCnt = new Array(N).fill(0);
    const regCnt = {};
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== 1 /* STAR */) continue;
      const r = Math.floor(i / N), c = i % N;
      rowCnt[r]++;
      colCnt[c]++;
      const rg = regions[i];
      regCnt[rg] = (regCnt[rg] ?? 0) + 1;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < N && nc >= 0 && nc < N) auto.add(nr * N + nc);
        }
      }
    }
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === 1 /* STAR */) continue;
      const r = Math.floor(i / N), c = i % N;
      if (rowCnt[r] >= K || colCnt[c] >= K || (regCnt[regions[i]] ?? 0) >= K) auto.add(i);
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === 1 /* STAR */) auto.delete(i);
    return auto;
  }
  function computeConflicts() {
    const cells = getCurState();
    const { size: N, stars: K, regions } = state.puzzle;
    const conflicts = /* @__PURE__ */ new Set();
    const stars = cells.reduce((a, v, i) => v === 1 /* STAR */ ? [...a, i] : a, []);
    const rowCnt = new Array(N).fill(0);
    const colCnt = new Array(N).fill(0);
    const regCnt = new Array(N * N).fill(0);
    for (const i of stars) {
      rowCnt[Math.floor(i / N)]++;
      colCnt[i % N]++;
      regCnt[regions[i]]++;
    }
    for (const i of stars) {
      const r = Math.floor(i / N), c = i % N;
      if (rowCnt[r] > K || colCnt[c] > K || regCnt[regions[i]] > K) {
        conflicts.add(i);
        for (const j of stars) {
          const jr = Math.floor(j / N), jc = j % N;
          if (jr === r || jc === c || regions[j] === regions[i]) conflicts.add(j);
        }
      }
      for (const j of stars) {
        if (j <= i) continue;
        const jr = Math.floor(j / N), jc = j % N;
        if (Math.abs(r - jr) <= 1 && Math.abs(c - jc) <= 1) {
          conflicts.add(i);
          conflicts.add(j);
        }
      }
    }
    return conflicts;
  }
  function computeProblematic(autoElim) {
    const cells = getCurState();
    const { size: N, stars: K, regions } = state.puzzle;
    const rowS = new Array(N).fill(0), colS = new Array(N).fill(0);
    const rowA = new Array(N).fill(0), colA = new Array(N).fill(0);
    const regS = {}, regA = {};
    for (let i = 0; i < cells.length; i++) {
      const r = Math.floor(i / N), c = i % N, rg = regions[i];
      regS[rg] ??= 0;
      regA[rg] ??= 0;
      if (cells[i] === 1 /* STAR */) {
        rowS[r]++;
        colS[c]++;
        regS[rg]++;
      } else if (cells[i] === 0 /* EMPTY */ && !autoElim.has(i)) {
        rowA[r]++;
        colA[c]++;
        regA[rg]++;
      }
    }
    const badRows = /* @__PURE__ */ new Set(), badCols = /* @__PURE__ */ new Set(), badRegs = /* @__PURE__ */ new Set();
    for (let r = 0; r < N; r++) if (rowS[r] > K || rowS[r] + rowA[r] < K) badRows.add(r);
    for (let c = 0; c < N; c++) if (colS[c] > K || colS[c] + colA[c] < K) badCols.add(c);
    for (const rg of Object.keys(regS).map(Number)) {
      if (regS[rg] > K || regS[rg] + regA[rg] < K) badRegs.add(rg);
    }
    return { badRows, badCols, badRegs };
  }
  function checkWin() {
    const cells = getCurState();
    const { stars: K, regions } = state.puzzle;
    const numRegions = new Set(regions).size;
    if (cells.filter((v) => v === 1 /* STAR */).length !== numRegions * K) return false;
    return computeConflicts().size === 0;
  }

  // src/persistence.ts
  function stateKey(p) {
    return `sb:${p.name.replace(/\s+/g, "_")}:${p.categoryIndex}`;
  }
  function saveState() {
    if (!state.puzzle) return;
    const { boardsById, currentBoardId, boardIdCtr, groupIdCtr } = state;
    localStorage.setItem(
      stateKey(state.puzzle),
      JSON.stringify({ boardsById, currentBoardId, boardIdCtr, groupIdCtr })
    );
  }
  function loadSaved(p) {
    try {
      const raw = localStorage.getItem(stateKey(p));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  function clearSaved(p) {
    if (p) localStorage.removeItem(stateKey(p));
  }
  function levelStatus(p) {
    const raw = localStorage.getItem(stateKey(p));
    if (!raw) return "empty";
    try {
      const s = JSON.parse(raw);
      const regionCount = new Set(p.regions).size;
      const isSolved = (cells) => cells.filter((v) => v === 1 /* STAR */).length === regionCount * p.stars;
      const hasProgress = (cells) => cells.some((v) => v !== 0 /* EMPTY */);
      if (Object.values(s.boardsById).some((b) => isSolved(b.state))) return "solved";
      const active = s.boardsById[s.currentBoardId];
      if (active && hasProgress(active.state)) return "started";
    } catch {
    }
    return "empty";
  }

  // src/render.ts
  function getCellSize() {
    const pad = window.innerWidth < 450 ? 12 : 40;
    return Math.max(20, Math.floor(Math.min(window.innerWidth - pad, 500) / state.puzzle.size));
  }
  function getSplitColor(split) {
    const anyImpossible = [split.origId, split.starId, split.elimId].some((id) => state.boardsById[id]?.impossible);
    if (!anyImpossible) return "#4fc3f7";
    const splits = getCurBoard().activeSplits;
    let directParentGroupId = null;
    for (let i = splits.length - 1; i >= 0; i--) {
      if (splits[i].role === "star" || splits[i].role === "elim") {
        directParentGroupId = splits[i].groupId;
        break;
      }
    }
    if (split.groupId === directParentGroupId && getCurBoard().impossible) return "#e94560";
    return "#888";
  }
  function renderTableStructure() {
    const cur = getCurBoard();
    const { size: N, regions: reg } = state.puzzle;
    const sz = getCellSize();
    const wrap = document.getElementById("sb-table-wrap");
    const splitCellMap = {};
    for (const split of cur.activeSplits) splitCellMap[split.idx] = split;
    const tbl = document.createElement("table");
    tbl.style.cssText = `border-collapse:collapse;display:block;${state.splitMode ? "cursor:crosshair;" : ""}`;
    for (let r = 0; r < N; r++) {
      const tr = document.createElement("tr");
      for (let c = 0; c < N; c++) {
        const idx = r * N + c;
        const td = document.createElement("td");
        const spl = splitCellMap[idx];
        const isThick = (side) => ({
          top: r === 0 || reg[idx] !== reg[(r - 1) * N + c],
          left: c === 0 || reg[idx] !== reg[r * N + (c - 1)],
          bottom: r === N - 1 || reg[idx] !== reg[(r + 1) * N + c],
          right: c === N - 1 || reg[idx] !== reg[r * N + (c + 1)]
        })[side];
        td.dataset.idx = String(idx);
        td.style.cssText = [
          `width:${sz}px`,
          `height:${sz}px`,
          `font-size:${Math.round(sz * 0.52)}px`,
          "text-align:center",
          "vertical-align:middle",
          `cursor:${state.splitMode ? "crosshair" : "pointer"}`,
          "user-select:none",
          "position:relative",
          `background-color:${REGION_COLORS[reg[idx]] ?? "#ddd"}`,
          `border-top:${isThick("top") ? THICK : THIN}`,
          `border-left:${isThick("left") ? THICK : THIN}`,
          `border-bottom:${isThick("bottom") ? THICK : THIN}`,
          `border-right:${isThick("right") ? THICK : THIN}`,
          spl ? `outline:2px solid ${getSplitColor(spl)};outline-offset:-2px` : ""
        ].join(";");
        tr.appendChild(td);
      }
      tbl.appendChild(tr);
    }
    wrap.innerHTML = "";
    wrap.appendChild(tbl);
    const titleRow = document.getElementById("sb-title-row");
    if (titleRow) titleRow.style.width = `${N * sz}px`;
  }
  function updateCellContents() {
    const cells = getCurState();
    const { size: N, regions: reg } = state.puzzle;
    const sz = getCellSize();
    const conflicts = computeConflicts();
    const autoElim = computeAutoElim();
    const { badRows, badCols, badRegs } = computeProblematic(autoElim);
    const wrap = document.getElementById("sb-table-wrap");
    const tbl = wrap.querySelector("table");
    if (!tbl) return;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const idx = r * N + c;
        const td = tbl.rows[r]?.cells[c];
        if (!td) continue;
        if (cells[idx] === 1 /* STAR */) {
          td.textContent = "\u2605";
          td.style.color = conflicts.has(idx) ? "#e94560" : "#111";
        } else if (cells[idx] === 2 /* ELIM */ || autoElim.has(idx)) {
          const isAuto = cells[idx] !== 2 /* ELIM */;
          const xSz = Math.round(sz * 0.32);
          td.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="${xSz}" height="${xSz}" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:block;"><path d="M2,2 L8,8 M8,2 L2,8" stroke="rgb(210,40,40)" stroke-width="2.2" stroke-linecap="round" fill="none" opacity="${isAuto ? 0.3 : 0.85}"/></svg>`;
          td.style.color = "";
        } else {
          td.innerHTML = "";
          td.style.color = "";
        }
      }
    }
    addProblemOverlays(wrap, tbl, badRows, badCols, badRegs, N, reg);
  }
  function addProblemOverlays(wrap, tbl, badRows, badCols, badRegs, N, reg) {
    wrap.querySelectorAll(".sb-ov").forEach((e) => e.remove());
    if (!badRows.size && !badCols.size && !badRegs.size) return;
    const wr = wrap.getBoundingClientRect();
    const B = 4, C = "#e94560";
    function rectDiv(t, l, w, h) {
      const d = document.createElement("div");
      d.className = "sb-ov";
      d.style.cssText = `position:absolute;pointer-events:none;z-index:3;box-sizing:border-box;border:${B}px solid ${C};top:${t}px;left:${l}px;width:${w}px;height:${h}px;`;
      wrap.appendChild(d);
    }
    function hBar(t, l, w) {
      const d = document.createElement("div");
      d.className = "sb-ov";
      d.style.cssText = `position:absolute;pointer-events:none;z-index:3;background:${C};top:${t}px;left:${l}px;width:${w}px;height:${B}px;`;
      wrap.appendChild(d);
    }
    function vBar(l, t, h) {
      const d = document.createElement("div");
      d.className = "sb-ov";
      d.style.cssText = `position:absolute;pointer-events:none;z-index:3;background:${C};left:${l}px;top:${t}px;width:${B}px;height:${h}px;`;
      wrap.appendChild(d);
    }
    for (const r of badRows) {
      const row = tbl.rows[r];
      if (!row) continue;
      const rc = row.getBoundingClientRect();
      rectDiv(rc.top - wr.top, rc.left - wr.left, rc.width, rc.height);
    }
    for (const c of badCols) {
      const tc = tbl.rows[0]?.cells[c];
      const bc = tbl.rows[N - 1]?.cells[c];
      if (!tc || !bc) continue;
      const tr = tc.getBoundingClientRect();
      const br = bc.getBoundingClientRect();
      rectDiv(tr.top - wr.top, tr.left - wr.left, tr.width, br.bottom - tr.top);
    }
    for (let i = 0; i < N * N; i++) {
      if (!badRegs.has(reg[i])) continue;
      const r = Math.floor(i / N), c = i % N;
      const cell = tbl.rows[r]?.cells[c];
      if (!cell) continue;
      const cc = cell.getBoundingClientRect();
      const t = cc.top - wr.top, l = cc.left - wr.left;
      const b = cc.bottom - wr.top, ri = cc.right - wr.left;
      if (r === 0 || reg[i] !== reg[(r - 1) * N + c]) hBar(t, l, ri - l);
      if (r === N - 1 || reg[i] !== reg[(r + 1) * N + c]) hBar(b - B, l, ri - l);
      if (c === 0 || reg[i] !== reg[r * N + (c - 1)]) vBar(l, t, b - t);
      if (c === N - 1 || reg[i] !== reg[r * N + (c + 1)]) vBar(ri - B, t, b - t);
    }
  }
  function renderStatus() {
    const el = document.getElementById("sb-status");
    if (checkWin()) {
      el.textContent = "Puzzle solved! \u2605";
      el.className = "win";
      saveState();
    } else {
      const { stars: K, regions } = state.puzzle;
      const numRegions = new Set(regions).size;
      const starCount = getCurState().filter((v) => v === 1 /* STAR */).length;
      el.textContent = `Stars placed: ${starCount} / ${numRegions * K}`;
      el.className = "";
    }
  }
  function updateBoardNav() {
    const cur = getCurBoard();
    const splits = cur.activeSplits;
    const label = document.getElementById("sb-branch-label");
    const { size: N } = state.puzzle;
    const cellLabel = (idx) => String.fromCharCode(65 + idx % N) + (Math.floor(idx / N) + 1);
    const imp = cur.impossible ? "  \u2717 impossible" : "";
    let parentSplit = null;
    for (let i = splits.length - 1; i >= 0; i--) {
      if (splits[i].role === "star" || splits[i].role === "elim") {
        parentSplit = splits[i];
        break;
      }
    }
    if (parentSplit) {
      const subCount = splits.filter((s) => s.role === "orig").length;
      const sub = subCount ? ` +${subCount} sub-split${subCount !== 1 ? "s" : ""}` : "";
      const role = parentSplit.role === "star" ? "\u2605 Star" : "\xB7 Elim";
      label.textContent = `${role} branch \u2014 cell ${cellLabel(parentSplit.idx)}${sub}${imp}`;
      label.className = cur.impossible ? "impossible" : "live";
    } else if (splits.some((s) => s.role === "orig")) {
      const cells = splits.filter((s) => s.role === "orig").map((s) => cellLabel(s.idx)).join(", ");
      label.textContent = `\u25C8 Original \u2014 split on ${cells}${imp}`;
      label.className = cur.impossible ? "impossible" : "live";
    } else {
      label.textContent = cur.impossible ? "\u2717 impossible" : "";
      label.className = cur.impossible ? "impossible" : "";
    }
  }
  function updatePuzzleNav() {
    const prevBtn = document.getElementById("sb-prev-btn");
    const nextBtn = document.getElementById("sb-next-btn");
    if (!prevBtn || !nextBtn) return;
    const idx = state.puzzle ? state.puzzles.indexOf(state.puzzle) : -1;
    prevBtn.disabled = idx <= 0;
    nextBtn.disabled = idx < 0 || idx >= state.puzzles.length - 1;
  }
  function refresh() {
    renderTableStructure();
    updateCellContents();
    renderStatus();
    updateBoardNav();
    updatePuzzleNav();
  }

  // src/undo.ts
  function snapshot() {
    const { boardsById, currentBoardId, boardIdCtr, groupIdCtr } = state;
    return JSON.stringify({ boardsById, currentBoardId, boardIdCtr, groupIdCtr });
  }
  function applySnapshot(snap) {
    const s = JSON.parse(snap);
    state.boardsById = s.boardsById;
    state.currentBoardId = s.currentBoardId;
    state.boardIdCtr = s.boardIdCtr;
    state.groupIdCtr = s.groupIdCtr;
  }
  function saveUndo() {
    state.undoStack.push(snapshot());
    state.redoStack = [];
    if (state.undoStack.length > 60) state.undoStack.shift();
    updateUndoButtons();
  }
  function updateUndoButtons() {
    const u = document.getElementById("sb-undo-btn");
    const r = document.getElementById("sb-redo-btn");
    if (u) u.disabled = !state.undoStack.length;
    if (r) r.disabled = !state.redoStack.length;
  }
  function sbUndo() {
    if (!state.undoStack.length) return;
    state.redoStack.push(snapshot());
    applySnapshot(state.undoStack.pop());
    refresh();
    updateUndoButtons();
    saveState();
  }
  function sbRedo() {
    if (!state.redoStack.length) return;
    state.undoStack.push(snapshot());
    applySnapshot(state.redoStack.pop());
    refresh();
    updateUndoButtons();
    saveState();
  }

  // src/split.ts
  function exitSplitMode() {
    state.splitMode = false;
    document.getElementById("sb-split-btn")?.classList.remove("active");
  }
  function sbToggleSplit() {
    state.splitMode = !state.splitMode;
    document.getElementById("sb-split-btn").classList.toggle("active", state.splitMode);
    refresh();
  }
  function splitCell(idx) {
    if (getCurBoard().activeSplits.some((s) => s.idx === idx)) return;
    saveUndo();
    const cur = getCurBoard();
    const groupId = state.groupIdCtr++;
    const starId = state.boardIdCtr++;
    const elimId = state.boardIdCtr++;
    const baseSplits = cur.activeSplits.map((s) => ({ ...s }));
    const entry = { groupId, idx, origId: state.currentBoardId, starId, elimId };
    cur.activeSplits.push({ ...entry, role: "orig" });
    const stateStar = cur.state.slice();
    stateStar[idx] = 1 /* STAR */;
    state.boardsById[starId] = {
      id: starId,
      state: stateStar,
      impossible: false,
      activeSplits: [...baseSplits, { ...entry, role: "star" }]
    };
    const stateElim = cur.state.slice();
    stateElim[idx] = 2 /* ELIM */;
    state.boardsById[elimId] = {
      id: elimId,
      state: stateElim,
      impossible: false,
      activeSplits: [...baseSplits, { ...entry, role: "elim" }]
    };
    state.currentBoardId = starId;
    exitSplitMode();
    refresh();
    saveState();
  }
  function clickSplitCell(groupId) {
    const split = getCurBoard().activeSplits.find((s) => s.groupId === groupId);
    if (!split) return;
    const anyImpossible = [split.origId, split.starId, split.elimId].some((id) => state.boardsById[id]?.impossible);
    let destId;
    if (anyImpossible) {
      if (state.currentBoardId === split.starId) destId = split.elimId;
      else if (state.currentBoardId === split.elimId) destId = split.starId;
      else destId = split.origId;
    } else {
      const cycle = [split.origId, split.elimId, split.starId];
      const pos = cycle.indexOf(state.currentBoardId);
      destId = pos === -1 ? split.origId : cycle[(pos + 1) % cycle.length];
    }
    state.currentBoardId = destId;
    refresh();
  }
  function propagateChange(boardId, cellIdx, value, visited = /* @__PURE__ */ new Set()) {
    if (visited.has(boardId)) return;
    visited.add(boardId);
    const board = state.boardsById[boardId];
    if (!board) return;
    for (const split of board.activeSplits) {
      if (split.role !== "orig") continue;
      if (split.origId !== boardId) continue;
      if (cellIdx === split.idx) continue;
      const star = state.boardsById[split.starId];
      const elim = state.boardsById[split.elimId];
      if (star) {
        star.state[cellIdx] = value;
        propagateChange(split.starId, cellIdx, value, visited);
      }
      if (elim) {
        elim.state[cellIdx] = value;
        propagateChange(split.elimId, cellIdx, value, visited);
      }
    }
  }
  function sbMarkImpossible() {
    saveUndo();
    let id = state.currentBoardId;
    let navDest = state.currentBoardId;
    while (id !== null) {
      state.boardsById[id].impossible = true;
      const board = state.boardsById[id];
      let parentSplit = null;
      for (let i = board.activeSplits.length - 1; i >= 0; i--) {
        const s = board.activeSplits[i];
        if (s.role === "star" || s.role === "elim") {
          parentSplit = s;
          break;
        }
      }
      if (!parentSplit) {
        navDest = id;
        break;
      }
      const sibId = parentSplit.role === "star" ? parentSplit.elimId : parentSplit.starId;
      const sibling = state.boardsById[sibId];
      if (sibling?.impossible) {
        id = parentSplit.origId;
        navDest = parentSplit.origId;
      } else {
        navDest = sibId;
        break;
      }
    }
    state.currentBoardId = navDest;
    refresh();
    saveState();
  }

  // src/preview.ts
  function renderPreview(p, stateArr, size = 150) {
    const { size: N, regions } = p;
    const cs = Math.floor(size / N);
    const cv = document.createElement("canvas");
    cv.width = cs * N;
    cv.height = cs * N;
    const ctx = cv.getContext("2d");
    for (let i = 0; i < N * N; i++) {
      let drawEdge = function(thick, x1, y1, x2, y2) {
        ctx.lineWidth = thick ? 2 : 0.5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      };
      const r = Math.floor(i / N), col = i % N;
      const x = col * cs, y = r * cs;
      ctx.fillStyle = REGION_COLORS[regions[i]] ?? "#ddd";
      ctx.fillRect(x, y, cs, cs);
      ctx.strokeStyle = "#111";
      drawEdge(r === 0 || regions[i] !== regions[(r - 1) * N + col], x, y, x + cs, y);
      drawEdge(col === 0 || regions[i] !== regions[r * N + (col - 1)], x, y, x, y + cs);
      drawEdge(r === N - 1 || regions[i] !== regions[(r + 1) * N + col], x, y + cs, x + cs, y + cs);
      drawEdge(col === N - 1 || regions[i] !== regions[r * N + (col + 1)], x + cs, y, x + cs, y + cs);
      if (stateArr?.[i] === 1 /* STAR */) {
        ctx.fillStyle = "#111";
        ctx.font = `bold ${Math.round(cs * 0.55)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("\u2605", x + cs / 2, y + cs / 2);
      } else if (stateArr?.[i] === 2 /* ELIM */) {
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.beginPath();
        ctx.arc(x + cs / 2, y + cs / 2, cs * 0.13, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return cv;
  }

  // src/help.ts
  var SLIDES = [
    {
      title: "The Goal",
      body: "<p>Place <strong>K stars</strong> in every row, every column, and every colored region \u2014 K is shown in the category name (1\u2605, 2\u2605, or 3\u2605).</p><p>Stars may <strong>never touch</strong> each other, not even diagonally.</p>"
    },
    {
      title: "Placing Stars",
      body: "<p><strong>Click</strong> a cell to cycle: empty \u2192 <span class='sb-key'>\xB7</span> eliminated \u2192 <span class='sb-key'>\u2605</span> star \u2192 empty.</p><p><strong>Drag</strong> across cells to eliminate multiple cells at a time.</p>"
    },
    {
      title: "Visual Feedback",
      body: "<p><strong>Auto-elimination.</strong> If a cell is next to a starred neighbor, or is in a completed row, column, or region, it will automatically be marked as eliminated for you, but in a lighter color so you know it was an automatic marking.</p><p><strong>Constraint violation.</strong> If there are too few or too many stars in a row, column, or region, that row/column/region will be outlined in red so you know the board cannot be solved in its current state.</p>"
    },
    {
      title: "Splitting (Advanced)",
      body: "<p>To assist in understanding the puzzle structure and trying different options, you have the ability to <strong>Split</strong> the board on a cell. What this will do is create <em>two boards</em>, one where that cell is a star, and one where it is eliminated.</p><p>To split a cell, either right click a cell or press the <strong>Split</strong> button and then click a cell normally. Once the boards are split, you can cycle between them by clicking on the split cell, which is bordered in blue.</p>"
    },
    {
      title: "\u2717 Impos.",
      body: "<p>If you've split the board and become convinced that that board is impossible, you can press the <strong>\u2717 Impos.</strong> button to declare that board impossible. This will bring you back to the other board, which is now considered forced. The corresponding cell that was originally split on will be bordered in grey, and you can click it to bring yourself back to the board you declared impossible.</p><p>You can declare a board impossible either after you've created a <strong>contradiction</strong> outlined in red, or if you become convinced by your own reasoning.</p>"
    }
  ];
  var modal = null;
  var slideEls = [];
  var dotEls = [];
  var currentIdx = 0;
  function build() {
    if (modal) return;
    modal = document.createElement("div");
    modal.id = "sb-help-modal";
    modal.addEventListener("click", (e) => {
      if (e.target === modal) sbCloseHelp();
    });
    const box = document.createElement("div");
    box.id = "sb-help-box";
    const closeBtn = document.createElement("button");
    closeBtn.id = "sb-help-close";
    closeBtn.textContent = "\u2715";
    closeBtn.addEventListener("click", sbCloseHelp);
    box.appendChild(closeBtn);
    SLIDES.forEach((s, i) => {
      const el = document.createElement("div");
      el.className = "sb-slide" + (i === 0 ? " active" : "");
      el.innerHTML = `<h3>${s.title}</h3>${s.body}`;
      box.appendChild(el);
      slideEls.push(el);
    });
    const footer = document.createElement("div");
    footer.id = "sb-help-footer";
    const prev = document.createElement("button");
    prev.id = "sb-help-prev";
    prev.className = "sb-hnav";
    prev.textContent = "\u2190 Prev";
    prev.disabled = true;
    prev.addEventListener("click", () => goto(currentIdx - 1));
    const dotsEl = document.createElement("div");
    dotsEl.id = "sb-help-dots";
    SLIDES.forEach((_, i) => {
      const d = document.createElement("div");
      d.className = "sb-dot" + (i === 0 ? " on" : "");
      d.addEventListener("click", () => goto(i));
      dotsEl.appendChild(d);
      dotEls.push(d);
    });
    const next = document.createElement("button");
    next.id = "sb-help-next";
    next.className = "sb-hnav";
    next.textContent = "Next \u2192";
    next.addEventListener("click", () => goto(currentIdx + 1));
    footer.appendChild(prev);
    footer.appendChild(dotsEl);
    footer.appendChild(next);
    box.appendChild(footer);
    modal.appendChild(box);
    document.body.appendChild(modal);
  }
  function goto(i) {
    slideEls[currentIdx].classList.remove("active");
    dotEls[currentIdx].classList.remove("on");
    currentIdx = Math.max(0, Math.min(i, slideEls.length - 1));
    slideEls[currentIdx].classList.add("active");
    dotEls[currentIdx].classList.add("on");
    document.getElementById("sb-help-prev").disabled = currentIdx === 0;
    document.getElementById("sb-help-next").disabled = currentIdx === slideEls.length - 1;
  }
  function sbOpenHelp() {
    build();
    goto(0);
    modal.classList.add("open");
  }
  function sbCloseHelp() {
    modal?.classList.remove("open");
  }

  // src/selector.ts
  function makeHelpBtn() {
    const btn = document.createElement("button");
    btn.className = "sb-back-btn";
    btn.textContent = "Help?";
    btn.addEventListener("click", sbOpenHelp);
    return btn;
  }
  function sbShowSelector() {
    document.getElementById("sb-game").style.display = "none";
    const sel = document.getElementById("sb-selector");
    sel.className = "";
    sel.innerHTML = "";
    const hdr = document.createElement("div");
    hdr.style.cssText = "width:100%;display:flex;justify-content:space-between;align-items:center;";
    const hdrTitle = document.createElement("span");
    hdrTitle.style.cssText = "color:#aaa;font-size:.9rem;";
    hdrTitle.textContent = "Choose a category";
    hdr.appendChild(hdrTitle);
    hdr.appendChild(makeHelpBtn());
    sel.appendChild(hdr);
    for (const [catName, puzzles] of groupPuzzles(state.puzzles)) {
      const solved = puzzles.filter((p) => levelStatus(p) === "solved").length;
      const started = puzzles.filter((p) => levelStatus(p) === "started").length;
      let badgeHTML = "";
      if (solved > 0) badgeHTML += `<span class="sb-stat-done">\u2713 ${solved}</span>`;
      if (started > 0) badgeHTML += `<span class="sb-stat-prog">\xB7 ${started}</span>`;
      const btn = document.createElement("button");
      btn.className = "sb-cat-btn";
      btn.innerHTML = `<span>${catName}</span><span class="sb-cat-badge">${badgeHTML}</span>`;
      btn.addEventListener("click", () => sbShowCategory(catName, puzzles));
      sel.appendChild(btn);
    }
    sel.style.display = "flex";
  }
  function sbGoBack() {
    if (state.currentCat) sbShowCategory(state.currentCat, state.currentCatPuzzles);
    else sbShowSelector();
  }
  function sbShowCategory(catName, puzzles) {
    state.currentCat = catName;
    state.currentCatPuzzles = puzzles;
    document.getElementById("sb-game").style.display = "none";
    const sel = document.getElementById("sb-selector");
    sel.className = "grid-mode";
    sel.innerHTML = "";
    const nav = document.createElement("div");
    nav.className = "sb-nav-row";
    const back = document.createElement("button");
    back.className = "sb-back-btn";
    back.textContent = "\u2190 Back";
    back.addEventListener("click", sbShowSelector);
    const title = document.createElement("div");
    title.className = "sb-cat-title";
    title.textContent = catName;
    nav.appendChild(back);
    nav.appendChild(title);
    nav.appendChild(makeHelpBtn());
    sel.appendChild(nav);
    const grid = document.createElement("div");
    grid.className = "sb-level-grid";
    for (const p of puzzles) {
      const status = levelStatus(p);
      const saved = loadSaved(p);
      const activeBoard = saved ? saved.boardsById[saved.currentBoardId] : null;
      const btn = document.createElement("button");
      btn.className = "sb-lv-btn" + (status !== "empty" ? ` ${status}` : "");
      btn.appendChild(renderPreview(p, activeBoard?.state ?? null, 100));
      const num = document.createElement("span");
      num.className = "sb-lv-num";
      num.textContent = String(p.categoryIndex);
      btn.appendChild(num);
      if (status === "solved") {
        const seal = document.createElement("div");
        seal.className = "sb-lv-seal";
        const mark = document.createElement("span");
        mark.textContent = "\u2713";
        seal.appendChild(mark);
        btn.appendChild(seal);
      } else if (status === "started") {
        const badge = document.createElement("span");
        badge.className = "sb-lv-badge";
        badge.textContent = "\xB7";
        btn.appendChild(badge);
      }
      btn.addEventListener("click", () => startPuzzle(p));
      grid.appendChild(btn);
    }
    sel.appendChild(grid);
    sel.style.display = "flex";
  }
  function startPuzzle(p) {
    state.puzzle = p;
    document.getElementById("sb-selector").style.display = "none";
    document.getElementById("sb-game").style.display = "flex";
    document.getElementById("sb-title").textContent = p.name;
    const saved = loadSaved(p);
    if (saved) {
      state.boardsById = saved.boardsById;
      state.currentBoardId = saved.currentBoardId;
      state.boardIdCtr = saved.boardIdCtr;
      state.groupIdCtr = saved.groupIdCtr;
      state.undoStack = [];
      state.redoStack = [];
      exitSplitMode();
      refresh();
      updateUndoButtons();
    } else {
      sbRestart(true);
    }
  }
  function sbRestart(skipConfirm = false) {
    if (!skipConfirm && !confirm("Reset this puzzle? All progress will be lost.")) return;
    clearSaved(state.puzzle);
    state.boardIdCtr = 0;
    state.groupIdCtr = 0;
    const id = state.boardIdCtr++;
    state.boardsById = {
      [id]: { id, state: new Array(state.puzzle.size ** 2).fill(0 /* EMPTY */), activeSplits: [], impossible: false }
    };
    state.currentBoardId = id;
    state.undoStack = [];
    state.redoStack = [];
    exitSplitMode();
    refresh();
    updateUndoButtons();
  }

  // src/interaction.ts
  function markCellAndRender(idx, value) {
    getCurState()[idx] = value;
    propagateChange(state.currentBoardId, idx, value);
    updateCellContents();
    renderStatus();
  }
  function getSplitAt(idx) {
    return getCurBoard().activeSplits.find((s) => s.idx === idx);
  }
  function beginPress(idx, isTouch = false) {
    if (state.splitMode) {
      splitCell(idx);
      return;
    }
    const spl = getSplitAt(idx);
    if (spl) {
      clickSplitCell(spl.groupId);
      return;
    }
    saveUndo();
    state.interaction.isDragging = true;
    state.interaction.dragMoved = false;
    state.interaction.mousedownIdx = idx;
    state.interaction.mousedownPrevState = getCurState()[idx];
    state.interaction.isTouch = isTouch;
    if (!isTouch && getCurState()[idx] === 0 /* EMPTY */) markCellAndRender(idx, 2 /* ELIM */);
  }
  function continuePress(idx, wrap) {
    if (idx !== state.interaction.mousedownIdx && getCurState()[idx] === 0 /* EMPTY */ && !getSplitAt(idx)) {
      if (!state.interaction.dragMoved) {
        const orig = state.interaction.mousedownIdx;
        if (getCurState()[orig] === 0 /* EMPTY */ && !getSplitAt(orig)) {
          getCurState()[orig] = 2 /* ELIM */;
          propagateChange(state.currentBoardId, orig, 2 /* ELIM */);
        }
      }
      state.interaction.dragMoved = true;
      wrap.classList.add("sb-dragging");
      markCellAndRender(idx, 2 /* ELIM */);
    }
  }
  function endPress() {
    const { isDragging, dragMoved, mousedownIdx, mousedownPrevState, isTouch } = state.interaction;
    const board = state.boardsById[state.currentBoardId];
    if (board && isDragging && !dragMoved && mousedownIdx !== -1) {
      if (!getSplitAt(mousedownIdx)) {
        if (mousedownPrevState === 0 /* EMPTY */ && isTouch) markCellAndRender(mousedownIdx, 2 /* ELIM */);
        else if (mousedownPrevState === 2 /* ELIM */) markCellAndRender(mousedownIdx, 1 /* STAR */);
        else if (mousedownPrevState === 1 /* STAR */) markCellAndRender(mousedownIdx, 0 /* EMPTY */);
      }
    } else if (dragMoved) {
      updateCellContents();
      renderStatus();
    }
    state.interaction.isDragging = false;
    state.interaction.dragMoved = false;
    state.interaction.mousedownIdx = -1;
    document.getElementById("sb-table-wrap")?.classList.remove("sb-dragging");
    saveState();
  }
  function addInteractionEventListeners() {
    const wrap = document.getElementById("sb-table-wrap");
    wrap.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      const el = e.target.closest("[data-idx]");
      if (!el) return;
      e.preventDefault();
      beginPress(Number(el.dataset.idx));
    });
    wrap.addEventListener("mouseover", (e) => {
      const el = e.target.closest("[data-idx]");
      if (!el || !state.interaction.isDragging) return;
      continuePress(Number(el.dataset.idx), wrap);
    });
    wrap.addEventListener("contextmenu", (e) => {
      const el = e.target.closest("[data-idx]");
      if (!el) return;
      e.preventDefault();
      splitCell(Number(el.dataset.idx));
    });
    window.addEventListener("mouseup", (e) => {
      void e;
      endPress();
    });
    wrap.addEventListener("touchstart", (e) => {
      if (!e.touches[0]) return;
      const el = e.target.closest("[data-idx]");
      if (!el) return;
      e.preventDefault();
      beginPress(Number(el.dataset.idx), true);
    }, { passive: false });
    wrap.addEventListener("touchmove", (e) => {
      if (!state.interaction.isDragging || !state.puzzle) return;
      e.preventDefault();
      const touch = e.touches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      const el = target?.closest("[data-idx]");
      if (!el) return;
      continuePress(Number(el.dataset.idx), wrap);
    }, { passive: false });
    wrap.addEventListener("touchend", (e) => {
      void e;
      endPress();
    });
  }

  // src/main.ts
  function wireButtons() {
    document.getElementById("sb-undo-btn").addEventListener("click", sbUndo);
    document.getElementById("sb-redo-btn").addEventListener("click", sbRedo);
    document.getElementById("sb-restart-btn").addEventListener("click", () => sbRestart());
    document.getElementById("sb-split-btn").addEventListener("click", sbToggleSplit);
    document.getElementById("sb-impossible-btn").addEventListener("click", sbMarkImpossible);
    document.getElementById("sb-menu-btn").addEventListener("click", sbGoBack);
    document.getElementById("sb-help-btn").addEventListener("click", sbOpenHelp);
  }
  wireButtons();
  addInteractionEventListeners();
  document.getElementById("sb-prev-btn").addEventListener("click", () => {
    if (!state.puzzle) return;
    const idx = state.puzzles.indexOf(state.puzzle);
    if (idx > 0) startPuzzle(state.puzzles[idx - 1]);
  });
  document.getElementById("sb-next-btn").addEventListener("click", () => {
    if (!state.puzzle) return;
    const idx = state.puzzles.indexOf(state.puzzle);
    if (idx < state.puzzles.length - 1) startPuzzle(state.puzzles[idx + 1]);
  });
  var resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (state.puzzle) refresh();
    }, 150);
  });
  fetch("levels.json").then((r) => r.json()).then((data) => {
    state.puzzles = parseLevels(data);
    sbShowSelector();
  }).catch(() => {
    document.getElementById("sb-selector").textContent = "Failed to load puzzles.";
  });
})();
