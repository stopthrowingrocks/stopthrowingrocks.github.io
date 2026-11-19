import { useEffect, useMemo, useRef, useState } from 'react';
import type { Block, Fact, HypExpr, PState, Puzzle, RawLevel } from './types';
import { parseLevels, groupPuzzles, factName, posLabel, REGION_COLORS } from './puzzles';
import { childContainers, containsSorry, evaluate, hypothesisForm, isSolved, opSymbol, predicateText } from './engine';
import { Board, type Coverage } from './Board';
import { BlocklyProof, type ProofWorkspaceHandle } from './BlocklyProof';
import levelsData from './levels.json';
import testLevels from './test-levels.json';
import './App.css';

/*
 * Test boards join the list while developing and never ship. `import.meta.env.DEV` is a
 * literal in a build, so the branch folds away and `test-levels.json` is dropped entirely
 * — which is what makes it safe to keep scratch puzzles there instead of splicing them into
 * the shipped list and having to remember to take them out again.
 */
const allLevels = import.meta.env.DEV
  ? [...(levelsData as RawLevel[]), ...(testLevels as RawLevel[])]
  : (levelsData as RawLevel[]);
const allPuzzles = parseLevels(allLevels);
const groups = groupPuzzles(allPuzzles);

function factText(fact: Fact, size: number): string {
  return `★{${fact.cells.map(cell => posLabel(cell, size)).join(' ')}} ${opSymbol(fact.op)} ${fact.target}`;
}

/** A step anywhere in the proof, including inside claim bodies and case arms. */
function findBlock(blocks: Block[], id: string): Block | undefined {
  for (const block of blocks) {
    if (block.id === id) return block;
    for (const [, children] of childContainers(block)) {
      const found = findBlock(children, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** Does this expression contain the node with `eid` — i.e. is it the part being edited? */
function containsExpr(expr: HypExpr | null, eid: string): boolean {
  if (!expr) return false;
  if (expr.eid === eid) return true;
  if (expr.kind === 'add' || expr.kind === 'sub' || expr.kind === 'combine') {
    return containsExpr(expr.left, eid) || containsExpr(expr.right, eid);
  }
  return false;
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
  /** True while a hypothesis is in hand, so wheel and edge scrolling are live. */
  const [dragging, setDragging] = useState(false);
  const factsRef = useRef<HTMLDivElement>(null);
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [editingFact, setEditingFact] = useState<string | null>(null);
  const workspaceRef = useRef<ProofWorkspaceHandle>(null);
  const clearContextRef = useRef<() => void>(() => {});

  const puzzle: Puzzle = groups[category][1][level];
  const evaluation = useMemo(() => evaluate(puzzle, blocks), [puzzle, blocks]);
  const selected = selectedId ? evaluation.results.get(selectedId) : undefined;
  const liveScope = selected
    ? (selected.scope ?? (selected.status === 'ok' ? selected.state : selected.prev))
    : undefined;
  // While the scoped step is out of the proof (mid-drag, or set aside), keep
  // showing the facts from where it last was, until something is clicked.
  const [lastScope, setLastScope] = useState<{ id: string; state: PState } | null>(null);
  if (selectedId && liveScope && (lastScope?.id !== selectedId || lastScope.state !== liveScope)) {
    setLastScope({ id: selectedId, state: liveScope });
  }
  const displayState: PState = liveScope
    ?? (selectedId && lastScope?.id === selectedId ? lastScope.state : evaluation.final);
  const solved = isSolved(evaluation.final);
  const admitted = useMemo(() => containsSorry(blocks), [blocks]);
  const displayName = (fact: Fact) => renames[fact.id] ?? factName(fact);
  const selectedHypothesisForm = selectedHypothesis
    ? hypothesisForm(selected?.scope ?? selected?.prev ?? displayState, puzzle, selectedHypothesis)
    : null;
  const selectedFact = selectedHypothesisForm && 'fact' in selectedHypothesisForm
    ? selectedHypothesisForm.fact
    : undefined;
  const splitCoverage = useMemo<Coverage | null>(() => {
    if (searchActive || !selectedId) return null;
    const step = findBlock(blocks, selectedId);
    if (step?.type !== 'split') return null;
    const state = selected?.prev ?? displayState;
    const whole = step.expr ? hypothesisForm(state, puzzle, step.expr) : { error: 'no hypothesis' };
    if ('error' in whole) return null;

    const counts = new Map<number, number>();
    const editing = new Set<number>();
    for (const part of step.parts) {
      const form = hypothesisForm(state, puzzle, part);
      const cells = 'fact' in form ? form.fact.cells : [];
      for (const cell of cells) counts.set(cell, (counts.get(cell) ?? 0) + 1);
      // The part being edited is the one holding the selected expression.
      if (selectedHypothesis && containsExpr(part, selectedHypothesis.eid)) {
        for (const cell of cells) editing.add(cell);
      }
    }
    // Mid-pick a clique may not evaluate yet; show what has been clicked so far.
    if (picking && pickedCells.length > 0) {
      editing.clear();
      for (const cell of pickedCells) editing.add(cell);
    }
    const wholeCells = new Set(whole.fact.cells);
    const conflicting = new Set<number>();
    const covered = new Set<number>();
    for (const [cell, times] of counts) {
      if (times > 1 || !wholeCells.has(cell)) conflicting.add(cell);
      else covered.add(cell);
    }
    for (const cell of editing) {
      if (!wholeCells.has(cell)) conflicting.add(cell);
      covered.delete(cell);
    }
    const remaining = new Set([...wholeCells].filter(cell =>
      !covered.has(cell) && !editing.has(cell) && !conflicting.has(cell)));
    return { total: wholeCells.size, remaining, editing, covered, conflicting };
  }, [blocks, selectedId, selected, displayState, puzzle, selectedHypothesis, searchActive, picking, pickedCells]);

  const coverageNote = splitCoverage && (() => {
    const { total, remaining, editing, covered, conflicting } = splitCoverage;
    const accounted = covered.size + editing.size;
    const trouble = conflicting.size > 0
      ? ` — ${conflicting.size} cell${conflicting.size === 1 ? '' : 's'} counted twice or outside it`
      : '';
    return `${accounted} of ${total} cells accounted for, ${remaining.size} remaining${trouble}`;
  })();

  const highlighted = searchActive
    ? new Set(searchCells)
    : pickedCells.length > 0
      ? new Set(pickedCells)
      : selectedFact
        ? new Set(selectedFact.cells)
        : null;
  /*
   * The hovered hypothesis gets its own channel rather than the tail of that chain. It used to
   * be the last fallback, so picking cells or holding a split -- exactly when you most want to
   * ask what a hypothesis covers -- outranked it and the hover showed nothing.
   */
  const hoveredCells = hoverFact
    ? new Set(displayState.facts.find(fact => fact.id === hoverFact)?.cells ?? [])
    : null;
  const visibleFacts = searchActive && searchCells.length > 0
    ? displayState.facts.filter(fact => fact.cells.some(cell => searchCells.includes(cell)))
    : displayState.facts;

  /*
   * Scrolling while a hypothesis is in hand.
   *
   * A native HTML5 drag swallows wheel events in most browsers, so a drag that starts in the
   * facts list cannot otherwise reach a drop target below the fold. `dragover` does keep
   * firing, with coordinates, so the pointer nearing an edge scrolls whatever is under it --
   * the facts list by `scrollTop`, the workspace through Blockly, which scrolls its own canvas
   * rather than a DOM element. A `wheel` listener is registered too, for browsers that do
   * deliver it: it costs nothing where they don't.
   */
  const pointerIn = (el: HTMLElement, x: number, y: number) => {
    const b = el.getBoundingClientRect();
    return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
  };
  const EDGE = 48;      // how close to an edge starts scrolling
  const EDGE_STEP = 14; // pixels per dragover tick

  function scrollUnderPointer(clientX: number, clientY: number, dy: number) {
    if (dy === 0) return;
    const list = factsRef.current;
    if (list) {
      const box = list.getBoundingClientRect();
      if (clientX >= box.left && clientX <= box.right && clientY >= box.top && clientY <= box.bottom) {
        list.scrollTop += dy;
        return;
      }
    }
    workspaceRef.current?.scrollWorkspaceBy(0, dy);
  }

  function autoScrollOnDrag(event: React.DragEvent) {
    const list = factsRef.current;
    const host = event.currentTarget as HTMLElement;
    const box = (list && pointerIn(list, event.clientX, event.clientY))
      ? list.getBoundingClientRect()
      : host.getBoundingClientRect();
    if (event.clientY - box.top < EDGE) scrollUnderPointer(event.clientX, event.clientY, -EDGE_STEP);
    else if (box.bottom - event.clientY < EDGE) scrollUnderPointer(event.clientX, event.clientY, EDGE_STEP);
  }

  useEffect(() => {
    if (!dragging) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      scrollUnderPointer(event.clientX, event.clientY, event.deltaY);
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [dragging]);

  /** A click on neutral space drops the whole working context: search and scope. */
  function clearContext() {
    setSearchActive(false);
    setSearchCells([]);
    workspaceRef.current?.resetScope();
  }
  // The document listener below is installed once, so route through a ref to
  // reach the current closure.
  useEffect(() => { clearContextRef.current = clearContext; });

  // Neutral space is anything that isn't interactive. Active board cells and
  // fact rows stop their pointerdown from bubbling, so they never get here; the
  // Blockly canvas is excluded and reports its own background clicks instead.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(
        'button, select, input, textarea, a, .blockly-host, .zoom-controls, ' +
        '.blocklyWidgetDiv, .blocklyDropDownDiv, .blocklyTooltipDiv',
      )) return;
      clearContextRef.current();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

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
    if (searchActive) {
      setSearchActive(false);
      setSearchCells([]);
      return;
    }
    // Search and cell picking both claim board clicks: starting a search ends picking.
    workspaceRef.current?.stopPicking();
    setSearchActive(true);
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
        <button
          className="hdr-btn"
          title="Add proof text from the clipboard after the selected step, keeping the rest"
          onClick={() => workspaceRef.current?.insertProofText().catch(error => window.alert(error.message))}
        >insert from text</button>
        <span className="header-help">Drag proof blocks together. Select a cell-set block, then click the board.</span>
      </section>

      <section id="content">
        <div id="content-board">
          {solved && (
            <div className="banner solved">
              {admitted
                ? 'Solved — but the proof admits a step with sorry, so it is incomplete.'
                : 'Solved! Every cell is proven. ★'}
            </div>
          )}
          {!solved && admitted && (
            <div className="banner admitted">This proof admits a step with sorry.</div>
          )}
          {/*
            Read from the board actually on screen, not from the proof's end state. Selecting
            a step shows that step's state, and a contradictory one is the whole point of a
            `suppose` body or a by-contradiction arm — so it is worth saying which board is
            the contradictory one rather than going quiet as soon as anything is selected.
          */}
          {displayState.contradiction && (
            <div className="banner contra">
              {selected ? "This step's state is contradictory." : 'The proof state is contradictory.'}
            </div>
          )}
          {searchActive
            ? <div className="pick-hint">Hypothesis search — click board cells to filter ({searchCells.length} selected)</div>
            : coverageNote
              ? <div className="pick-hint">Split — {coverageNote}</div>
              : picking && <div className="pick-hint">Cell picking active — click the board</div>}
          <Board
            puzzle={puzzle}
            cells={displayState.cells}
            highlight={highlighted}
            hover={hoveredCells}
            coverage={splitCoverage}
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
          <div className="facts" ref={factsRef}>
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
                  setDragging(true);
                }}
                onDragEnd={() => { setHoverFact(null); setDragging(false); }}
                onDragOver={event => autoScrollOnDrag(event)}
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
            {/*
              Proven propositions, which are knowledge too.
              A claim whose conclusion is not a single count — `(not (and ...))` becomes an OR
              under De Morgan — cannot become a `Fact`, so the engine records it in
              `propositions` instead. Nothing rendered that list, so proving one looked like it
              produced nothing at all. They are not draggable: there is no hypothesis slot that
              takes a proposition, and `or-elim` reaches them by predicate rather than by name.
            */}
            {displayState.propositions.length > 0 && (
              <div className="propositions">
                <div className="facts-title"><span>Proven propositions</span></div>
                {displayState.propositions.map((prop, i) => (
                  <div className="fact proposition" key={`${i}-${prop.eid}`}>
                    <span className="fact-eq">{predicateText(prop, puzzle)}</span>
                  </div>
                ))}
              </div>
            )}
            {/*
              Suppositions in scope. They assert nothing, which is exactly why they are worth
              listing: the board does not show them, so without this the only trace of one is
              the `suppose` block itself, and `use` offers a name with nothing to read it
              against. Each row says what was supposed and what discharging it would buy —
              either the cells it would settle here, or that its body died, which makes the
              supposition's predicate false rather than useful. Not draggable: `use` takes a
              name from a dropdown, not a hypothesis.
            */}
            {displayState.suppositions.length > 0 && (
              <div className="suppositions">
                <div className="facts-title"><span>Suppositions</span></div>
                {displayState.suppositions.map(sup => {
                  const gain = sup.cells.filter(
                    (cell, i) => cell !== null && displayState.cells[i] === null).length;
                  return (
                    <div
                      className={`fact supposition${sup.contradiction ? ' impossible' : ''}`}
                      key={sup.name}
                      title={sup.contradiction
                        ? 'Its body reached a contradiction, so what it supposes is false'
                        : 'Use it once you have proved what it supposes'}
                    >
                      <span className="fact-name">{sup.name}</span>
                      <span className="fact-eq">{predicateText(sup.pred, puzzle)}</span>
                      <span className="sup-note">
                        {sup.contradiction
                          ? 'impossible'
                          : `${gain} cell${gain === 1 ? '' : 's'}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {/*
              Inside the scrolling facts list rather than beside it: what a step is working
              under belongs with what it knows, and reads at the end of that list.
            */}
            {selected && (
              <div className="context">
                <div className="context-title">Working under</div>
                {/*
                  Assumptions first: they are the ground the goal is being proved on, and
                  reading the goal before them says what is being shown without saying where.
                */}
                {(selected.assumed?.length ?? 0) === 0 ? (
                  <div className="context-row none">
                    <span className="context-label">assumed</span>
                    <span className="context-val">none</span>
                  </div>
                ) : (
                  (selected.assumed ?? []).map((pred, depth, all) => (
                    <div className="context-row assumed" key={`${depth}-${pred.eid}`}>
                      <span className="context-label">
                        assumed{all.length > 1 ? ` ${depth + 1}` : ''}
                      </span>
                      <span className="context-val">{predicateText(pred, puzzle)}</span>
                    </div>
                  ))
                )}
                <div className={`context-row${selected.goal ? '' : ' none'}`}>
                  <span className="context-label">goal</span>
                  <span className="context-val">
                    {selected.goal ? predicateText(selected.goal, puzzle) : 'none'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div
          id="content-workspace"
          onDragOver={event => {
            if (event.dataTransfer.types.includes('application/x-starbattle-hypothesis')) {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
              autoScrollOnDrag(event);
            }
          }}
          onDrop={event => {
            const factId = event.dataTransfer.getData('application/x-starbattle-hypothesis');
            if (!factId) return;
            event.preventDefault();
            workspaceRef.current?.dropHypothesis(factId, event.clientX, event.clientY);
            setHoverFact(null);
            setDragging(false);
          }}
        >
          <BlocklyProof
            key={proofKey}
            ref={workspaceRef}
            puzzle={puzzle}
            results={evaluation.results}
            fallbackFacts={displayState.facts}
            factLabel={displayName}
            onNeutralClick={clearContext}
            onChange={setBlocks}
            onSelection={(proofId, isPicking, cells, hypothesis, startedPicking) => {
              setSelectedId(proofId);
              setSelectedHypothesis(hypothesis);
              setPicking(isPicking);
              setPickedCells(cells);
              // Clicking into a pick-cells block ends any search-by-cell.
              if (startedPicking) {
                setSearchActive(false);
                setSearchCells([]);
              }
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
