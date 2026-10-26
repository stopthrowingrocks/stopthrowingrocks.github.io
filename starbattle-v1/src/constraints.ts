import { CellState } from './types';
import { state, getCurState } from './state';

export function computeAutoElim(): Set<number> {
  const cells = getCurState();
  const { size: N, stars: K, regions } = state.puzzle!;
  const auto   = new Set<number>();
  const rowCnt = new Array<number>(N).fill(0);
  const colCnt = new Array<number>(N).fill(0);
  const regCnt: Record<number, number> = {};

  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== CellState.STAR) continue;
    const r = Math.floor(i / N), c = i % N;
    rowCnt[r]++; colCnt[c]++;
    const rg = regions[i]; regCnt[rg] = (regCnt[rg] ?? 0) + 1;
    // All 8 neighbours of a star are auto-eliminated
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < N && nc >= 0 && nc < N) auto.add(nr * N + nc);
      }
    }
  }

  // Cells whose row/col/region already has K stars cannot hold another
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === CellState.STAR) continue;
    const r = Math.floor(i / N), c = i % N;
    if (rowCnt[r] >= K || colCnt[c] >= K || (regCnt[regions[i]] ?? 0) >= K) auto.add(i);
  }

  // Stars themselves are never marked auto-elim
  for (let i = 0; i < cells.length; i++) if (cells[i] === CellState.STAR) auto.delete(i);
  return auto;
}

export function computeConflicts(): Set<number> {
  const cells  = getCurState();
  const { size: N, stars: K, regions } = state.puzzle!;
  const conflicts = new Set<number>();
  const stars  = cells.reduce<number[]>((a, v, i) => (v === CellState.STAR ? [...a, i] : a), []);
  const rowCnt = new Array<number>(N).fill(0);
  const colCnt = new Array<number>(N).fill(0);
  const regCnt = new Array<number>(N * N).fill(0);

  for (const i of stars) { rowCnt[Math.floor(i / N)]++; colCnt[i % N]++; regCnt[regions[i]]++; }

  for (const i of stars) {
    const r = Math.floor(i / N), c = i % N;
    if (rowCnt[r] > K || colCnt[c] > K || regCnt[regions[i]] > K) {
      conflicts.add(i);
      for (const j of stars) {
        const jr = Math.floor(j / N), jc = j % N;
        if (jr === r || jc === c || regions[j] === regions[i]) conflicts.add(j);
      }
    }
    // Adjacent stars conflict
    for (const j of stars) {
      if (j <= i) continue;
      const jr = Math.floor(j / N), jc = j % N;
      if (Math.abs(r - jr) <= 1 && Math.abs(c - jc) <= 1) { conflicts.add(i); conflicts.add(j); }
    }
  }
  return conflicts;
}

// A group is "bad" when it has too many stars OR can no longer reach K stars.
export function computeProblematic(autoElim: Set<number>): {
  badRows: Set<number>; badCols: Set<number>; badRegs: Set<number>;
} {
  const cells = getCurState();
  const { size: N, stars: K, regions } = state.puzzle!;
  const rowS = new Array<number>(N).fill(0), colS = new Array<number>(N).fill(0);
  const rowA = new Array<number>(N).fill(0), colA = new Array<number>(N).fill(0);
  const regS: Record<number, number> = {}, regA: Record<number, number> = {};

  for (let i = 0; i < cells.length; i++) {
    const r = Math.floor(i / N), c = i % N, rg = regions[i];
    regS[rg] ??= 0; regA[rg] ??= 0;
    if (cells[i] === CellState.STAR)                             { rowS[r]++; colS[c]++; regS[rg]++; }
    else if (cells[i] === CellState.EMPTY && !autoElim.has(i))  { rowA[r]++; colA[c]++; regA[rg]++; }
  }

  const badRows = new Set<number>(), badCols = new Set<number>(), badRegs = new Set<number>();
  for (let r = 0; r < N; r++) if (rowS[r] > K || rowS[r] + rowA[r] < K) badRows.add(r);
  for (let c = 0; c < N; c++) if (colS[c] > K || colS[c] + colA[c] < K) badCols.add(c);
  for (const rg of Object.keys(regS).map(Number)) {
    if (regS[rg] > K || regS[rg] + regA[rg] < K) badRegs.add(rg);
  }
  return { badRows, badCols, badRegs };
}

export function checkWin(): boolean {
  const cells = getCurState();
  const { stars: K, regions } = state.puzzle!;
  const numRegions = new Set(regions).size;
  if (cells.filter(v => v === CellState.STAR).length !== numRegions * K) return false;
  return computeConflicts().size === 0;
}
