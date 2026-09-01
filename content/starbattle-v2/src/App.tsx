import { useMemo, useRef, useState } from 'react';
import type { Fact, HypExpr, PState, Puzzle } from './types';
import { parseLevels, groupPuzzles, factName, posLabel, REGION_COLORS } from './puzzles';
import { evaluate, hypothesisForm, isSolved, opSymbol } from './engine';
import { Board } from './Board';
import { BlocklyProof, type ProofWorkspaceHandle } from './BlocklyProof';
import levelsData from './levels.json';
import './App.css';

const allPuzzles = parseLevels(levelsData);
const groups = groupPuzzles(allPuzzles);

function factText(fact: Fact, size: number): string {
  return `★{${fact.cells.map(cell => posLabel(cell, size)).join(' ')}} ${opSymbol(fact.op)} ${fact.target}`;
}

function App() {
  const [category, setCategory] = useState(0);
  const [level, setLevel] = useState(0);
  const [proofKey, setProofKey] = useState(0);
  const [blocks, setBlocks] = useState<import('./types').Block[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedHypothesis, setSelectedHypothesis] = useState<HypExpr | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickedCells, setPickedCells] = useState<number[]>([]);
  const [searchActive, setSearchActive] = useState(false);
  const [searchCells, setSearchCells] = useState<number[]>([]);
  const [hoverFact, setHoverFact] = useState<string | null>(null);
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [editingFact, setEditingFact] = useState<string | null>(null);
  const workspaceRef = useRef<ProofWorkspaceHandle>(null);

  const puzzle: Puzzle = groups[category][1][level];
  const evaluation = useMemo(() => evaluate(puzzle, blocks), [puzzle, blocks]);
  const selected = selectedId ? evaluation.results.get(selectedId) : undefined;
  const displayState: PState = selected
    ? (selected.scope ?? (selected.status === 'ok' ? selected.state : selected.prev))
    : evaluation.final;
  const solved = isSolved(evaluation.final);
  const displayName = (fact: Fact) => renames[fact.id] ?? factName(fact);
  const selectedHypothesisForm = selectedHypothesis
    ? hypothesisForm(selected?.scope ?? selected?.prev ?? evaluation.final, puzzle, selectedHypothesis)
    : null;
  const selectedFact = selectedHypothesisForm && 'fact' in selectedHypothesisForm
    ? selectedHypothesisForm.fact
    : undefined;
  const highlighted = searchActive
    ? new Set(searchCells)
    : pickedCells.length > 0
      ? new Set(pickedCells)
      : selectedFact
        ? new Set(selectedFact.cells)
        : hoverFact
          ? new Set(displayState.facts.find(fact => fact.id === hoverFact)?.cells ?? [])
          : null;
  const visibleFacts = searchActive && searchCells.length > 0
    ? displayState.facts.filter(fact => fact.cells.some(cell => searchCells.includes(cell)))
    : displayState.facts;

  function resetView() {
    setBlocks([]);
    setSelectedId(null);
    setSelectedHypothesis(null);
    setPicking(false);
    setPickedCells([]);
    setSearchActive(false);
    setSearchCells([]);
    setRenames({});
    setEditingFact(null);
    setProofKey(key => key + 1);
  }

  function clearProof() {
    workspaceRef.current?.clearProof();
    setSelectedId(null);
    setSelectedHypothesis(null);
    setPicking(false);
    setPickedCells([]);
    setSearchActive(false);
    setSearchCells([]);
    setRenames({});
    setEditingFact(null);
  }

  function toggleSearch() {
    setSearchActive(active => {
      const next = !active;
      if (!next) setSearchCells([]);
      return next;
    });
  }

  function toggleSearchCell(idx: number) {
    setSearchCells(cells => (
      cells.includes(idx) ? cells.filter(cell => cell !== idx) : [...cells, idx].sort((a, b) => a - b)
    ));
  }

  function switchPuzzle(nextCategory: number, nextLevel: number) {
    setCategory(nextCategory);
    setLevel(nextLevel);
    resetView();
  }

  function commitRename(fact: Fact, raw: string) {
    const name = raw.trim();
    setRenames(current => {
      const next = { ...current };
      if (!name || name === factName(fact)) delete next[fact.id];
      else next[fact.id] = name;
      return next;
    });
    setEditingFact(null);
  }

  return (
    <div id="app">
      <section id="header">
        <span className="title">Star Battle — Proof Builder</span>
        <select value={category} onChange={event => switchPuzzle(Number(event.target.value), 0)}>
          {groups.map(([name], index) => <option key={name} value={index}>{name}</option>)}
        </select>
        <select value={level} onChange={event => switchPuzzle(category, Number(event.target.value))}>
          {groups[category][1].map((item, index) => <option key={index} value={index}>#{item.categoryIndex}</option>)}
        </select>
        <button className="hdr-btn" onClick={clearProof}>clear proof</button>
        <button className="hdr-btn" onClick={() => workspaceRef.current?.copyProof().catch(error => window.alert(error.message))}>copy proof</button>
        <button className="hdr-btn" onClick={() => workspaceRef.current?.pasteProof().catch(error => window.alert(error.message))}>paste proof</button>
        <button className="hdr-btn" onClick={() => workspaceRef.current?.copyProofText().catch(error => window.alert(error.message))}>copy as text</button>
        <button className="hdr-btn" onClick={() => workspaceRef.current?.pasteProofText().catch(error => window.alert(error.message))}>load from text</button>
        <span className="header-help">Drag proof blocks together. Select a cell-set block, then click the board.</span>
      </section>

      <section id="content">
        <div id="content-board">
          {solved && <div className="banner solved">Solved! Every cell is proven. ★</div>}
          {evaluation.final.contradiction && !selected && <div className="banner contra">The proof state is contradictory.</div>}
          {searchActive
            ? <div className="pick-hint">Hypothesis search — click board cells to filter ({searchCells.length} selected)</div>
            : picking && <div className="pick-hint">Cell picking active — click the board</div>}
          <Board
            puzzle={puzzle}
            cells={displayState.cells}
            highlight={highlighted}
            picking={picking || searchActive}
            onCell={
              searchActive ? cell => toggleSearchCell(cell)
                : picking ? cell => workspaceRef.current?.editSelectedCell(cell)
                : undefined
            }
          />
          {selectedFact && (
            <div className="board-caption">
              {selectedHypothesis?.kind === 'ref' ? displayName(selectedFact) : 'hypothesis'}: {factText(selectedFact, puzzle.size)}
            </div>
          )}
          {selectedHypothesisForm && 'error' in selectedHypothesisForm && (
            <div className="board-caption">Hypothesis: {selectedHypothesisForm.error}</div>
          )}
          <div className="facts">
            <div className="facts-title">
              <span>Known facts</span>
              <button
                type="button"
                className={`fact-search-btn${searchActive ? ' active' : ''}`}
                title="Search hypotheses by board cell"
                onClick={toggleSearch}
              >
                <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                  <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {searchActive && searchCells.length > 0 && visibleFacts.length === 0 && (
              <div className="fact-empty">No hypotheses reference those cells.</div>
            )}
            {visibleFacts.map(fact => (
              <div
                key={fact.id}
                className={`fact${fact.impossible ? ' impossible' : ''}`}
                draggable
                title="Drag this hypothesis into the proof"
                onPointerDown={event => event.stopPropagation()}
                onMouseDown={event => event.stopPropagation()}
                onClick={event => event.stopPropagation()}
                onMouseEnter={() => setHoverFact(fact.id)}
                onMouseLeave={() => setHoverFact(null)}
                onDragStart={event => {
                  event.dataTransfer.effectAllowed = 'copy';
                  event.dataTransfer.setData('application/x-starbattle-hypothesis', fact.id);
                  // Native HTML5 drag defaults to a screenshot of the row being dragged;
                  // swap in a chip styled like a Blockly hypothesis block so this reads as
                  // "dragging a block" the same as pulling one out of the flyout.
                  const ghost = document.createElement('div');
                  ghost.className = 'fact-drag-ghost';
                  ghost.textContent = displayName(fact);
                  document.body.appendChild(ghost);
                  event.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
                  requestAnimationFrame(() => ghost.remove());
                  setHoverFact(fact.id);
                }}
                onDragEnd={() => setHoverFact(null)}
              >
                {fact.kind === 'region' && <span className="fact-chip" style={{ background: REGION_COLORS[fact.index] ?? '#ddd' }} />}
                {editingFact === fact.id ? (
                  <input
                    className="fact-rename"
                    autoFocus
                    defaultValue={displayName(fact)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') commitRename(fact, event.currentTarget.value);
                      if (event.key === 'Escape') setEditingFact(null);
                    }}
                    onBlur={event => commitRename(fact, event.currentTarget.value)}
                  />
                ) : (
                  <span className="fact-name" title="Double-click to rename" onDoubleClick={() => setEditingFact(fact.id)}>
                    {displayName(fact)}
                  </span>
                )}
                <span className="fact-eq">{factText(fact, puzzle.size)}</span>
                {fact.impossible && <span>impossible!</span>}
              </div>
            ))}
          </div>
        </div>

        <div
          id="content-workspace"
          onDragOver={event => {
            if (event.dataTransfer.types.includes('application/x-starbattle-hypothesis')) {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDrop={event => {
            const factId = event.dataTransfer.getData('application/x-starbattle-hypothesis');
            if (!factId) return;
            event.preventDefault();
            workspaceRef.current?.dropHypothesis(factId, event.clientX, event.clientY);
            setHoverFact(null);
          }}
        >
          <BlocklyProof
            key={proofKey}
            ref={workspaceRef}
            puzzle={puzzle}
            results={evaluation.results}
            fallbackFacts={displayState.facts}
            factLabel={displayName}
            onChange={setBlocks}
            onSelection={(proofId, isPicking, cells, hypothesis) => {
              setSelectedId(proofId);
              setSelectedHypothesis(hypothesis);
              setPicking(isPicking);
              setPickedCells(cells);
            }}
          />
        </div>
      </section>

      <section id="footer">
        {solved
          ? `Solved ${puzzle.name} #${puzzle.categoryIndex}! 🎉`
          : `${puzzle.name} #${puzzle.categoryIndex} — ${puzzle.stars}★ per row, column, and region — ${evaluation.final.cells.filter(cell => cell !== null).length}/${evaluation.final.cells.length} cells proven`}
      </section>
    </div>
  );
}

export default App;
