import type { Puzzle, RawLevel } from './types';

export function parseLevels(data: RawLevel[]): Puzzle[] {
  const countByName: Record<string, number> = {};
  return data.map((lvl, i) => {
    const name = lvl.name ?? `Puzzle ${i + 1}`;
    countByName[name] = (countByName[name] ?? 0) + 1;
    return {
      name,
      categoryIndex: countByName[name],
      stars:   lvl.stars,
      size:    lvl.size,
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
