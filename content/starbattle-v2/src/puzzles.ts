import type { Fact, LineKind, Puzzle, RawLevel } from './types';

export const REGION_COLORS = [
  '#E8A0A0', '#A0C4E8', '#A0E8B4', '#EAD8A0', '#CCA0E8',
  '#E8E8A0', '#A0E4E8', '#E8A8D8', '#E8C8A0', '#B0E8A0',
  '#D4A0E8', '#A0D4C8', '#E8D4A0', '#C8A0C8',
];

export function parseLevels(data: RawLevel[]): Puzzle[] {
  const countByName: Record<string, number> = {};
  return data.map((lvl, i) => {
    const name = lvl.name ?? `Puzzle ${i + 1}`;
    countByName[name] = (countByName[name] ?? 0) + 1;
    return {
      name,
      categoryIndex: countByName[name],
      stars: lvl.stars,
      size: lvl.size,
      regions: lvl.shapes.flatMap(row => [...row].map(c => parseInt(c, 36))),
    };
  });
}

export function groupPuzzles(puzzles: Puzzle[]): [string, Puzzle[]][] {
  const map = new Map<string, Puzzle[]>();
  for (const p of puzzles) {
    const group = map.get(p.name) ?? [];
    if (!map.has(p.name)) map.set(p.name, group);
    group.push(p);
  }
  return [...map.entries()];
}

export const colLetter = (c: number): string => String.fromCharCode(65 + c);

/** "A1"-style label: column letter + 1-based row number. */
export function posLabel(idx: number, N: number): string {
  return colLetter(idx % N) + (Math.floor(idx / N) + 1);
}

/** Inverse of `posLabel`: "A1" -> cell index, or null if it's not a valid label on this board. */
export function cellLabelToIndex(label: string, N: number): number | null {
  const m = /^([A-Za-z])(\d+)$/.exec(label.trim());
  if (!m) return null;
  const col = m[1].toUpperCase().charCodeAt(0) - 65;
  const row = Number(m[2]) - 1;
  if (col < 0 || col >= N || row < 0 || row >= N) return null;
  return row * N + col;
}

/** King-move neighbours of a cell. */
export function neighbors(idx: number, N: number): number[] {
  const r = Math.floor(idx / N), c = idx % N;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < N && nc >= 0 && nc < N) out.push(nr * N + nc);
    }
  }
  return out;
}

/** Sorted distinct region ids of a puzzle. */
export function regionIds(puzzle: Puzzle): number[] {
  return [...new Set(puzzle.regions)].sort((a, b) => a - b);
}

/** All cell indices belonging to a row / column / region. */
export function lineMembers(puzzle: Puzzle, kind: LineKind, index: number): number[] {
  const N = puzzle.size;
  const out: number[] = [];
  if (kind === 'row') {
    for (let c = 0; c < N; c++) out.push(index * N + c);
  } else if (kind === 'col') {
    for (let r = 0; r < N; r++) out.push(r * N + index);
  } else {
    for (let i = 0; i < N * N; i++) if (puzzle.regions[i] === index) out.push(i);
  }
  return out;
}

/** Valid indices for a line kind on this puzzle. */
export function lineIndices(puzzle: Puzzle, kind: LineKind): number[] {
  if (kind === 'region') return regionIds(puzzle);
  return Array.from({ length: puzzle.size }, (_, i) => i);
}

/** Human name of a line: "row 3", "column C", "region 2". */
export function lineName(kind: LineKind, index: number): string {
  if (kind === 'row') return `row ${index + 1}`;
  if (kind === 'col') return `column ${colLetter(index)}`;
  return `region ${index + 1}`;
}

/** Display name of a fact — its line name, or the stored label for derived facts. */
export function factName(f: Fact): string {
  return f.label ?? (f.kind === 'derived' ? f.id : lineName(f.kind, f.index));
}
