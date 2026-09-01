/**
 * Headless CLI for the proof engine — no browser, no Blockly. Meant to be
 * driven by an AI agent (or a human) writing proof text and reading back
 * structured feedback, iterating until the puzzle is solved.
 *
 *   npx tsx scripts/solve.ts list [nameFilter]
 *   npx tsx scripts/solve.ts grammar
 *   npx tsx scripts/solve.ts describe <index>
 *   npx tsx scripts/solve.ts run <index> [proofFile]     (reads stdin if no file given)
 */
import { readFileSync } from 'node:fs';
import { parseLevels } from '../src/puzzles';
import { describePuzzle, runProof, formatReport } from '../src/agentTool';
import { PROOF_GRAMMAR } from '../src/proofText';
import levelsData from '../src/levels.json';
import type { Puzzle } from '../src/types';

const puzzles: Puzzle[] = parseLevels(levelsData);

function usage(): never {
  console.error(`Usage:
  solve list [nameFilter]        list puzzles with their index
  solve grammar                  print the proof-text language reference
  solve describe <index>         print a puzzle's board + starting facts
  solve run <index> [proofFile]  evaluate a proof (reads stdin if no file given)

<index> is the number shown by "list".`);
  process.exit(1);
}

function requirePuzzle(indexArg: string | undefined): Puzzle {
  const index = Number(indexArg);
  if (!Number.isInteger(index) || index < 0 || index >= puzzles.length) {
    console.error(`"${indexArg}" is not a valid puzzle index (0..${puzzles.length - 1}). Run "solve list" to see them.`);
    process.exit(1);
  }
  return puzzles[index];
}

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case 'list': {
    const filter = args[0]?.toLowerCase();
    puzzles.forEach((p, i) => {
      const label = `${p.name} #${p.categoryIndex}`;
      if (!filter || label.toLowerCase().includes(filter)) {
        console.log(`${i}\t${label}\t${p.size}x${p.size}\t${p.stars}★`);
      }
    });
    break;
  }
  case 'grammar':
    console.log(PROOF_GRAMMAR);
    break;
  case 'describe':
    console.log(describePuzzle(requirePuzzle(args[0])));
    break;
  case 'run': {
    const puzzle = requirePuzzle(args[0]);
    const text = args[1] ? readFileSync(args[1], 'utf8') : readFileSync(0, 'utf8');
    console.log(formatReport(runProof(puzzle, text)));
    break;
  }
  default:
    usage();
}
