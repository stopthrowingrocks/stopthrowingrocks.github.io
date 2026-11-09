import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import * as Blockly from 'blockly';
import type { Block, BlockResult, BoolExpr, Fact, HypExpr, NumExpr, Puzzle } from './types';
import { posLabel } from './puzzles';
import { printHypothesis, printProof, parseProof } from './proofText';
import { legacyFactIds } from './engine';

interface BlocklyContext {
  puzzle: Puzzle;
  results: Map<string, BlockResult>;
  fallbackFacts: Fact[];
  factLabel: (fact: Fact) => string;
}

let context: BlocklyContext | null = null;
const HYPOTHESIS_OUTPUT_SHAPE = 3; // Zelos' square reporter shape.
const STAR_BATTLE_RENDERER = 'starbattle_zelos';
const START_SCALE = 0.9;
const PROOF_UPDATE_DELAY_MS = 40;
const AUTOSAVE_DELAY_MS = 300;
/** Blocks that, while selected, turn board clicks into cell picks for themselves. */
const CELL_PICKING_TYPES = new Set(['sb_clique', 'sb_at_least_zero', 'sb_at_most', 'sb_bound', 'sb_count', 'sb_is_star', 'sb_is_elim']);
/** Changes that can fill or empty a part socket. */
const PART_EVENT_TYPES = new Set<string>([
  Blockly.Events.BLOCK_MOVE,
  Blockly.Events.BLOCK_CREATE,
  Blockly.Events.BLOCK_DELETE,
]);
const PROOF_EVENT_TYPES = new Set<string>([
  Blockly.Events.BLOCK_CREATE,
  Blockly.Events.BLOCK_DELETE,
  Blockly.Events.BLOCK_CHANGE,
  Blockly.Events.BLOCK_MOVE,
]);

/**
 * A fact-reference dropdown that never rejects its stored value. Stock
 * `FieldDropdown` validates every `setValue` (including during workspace
 * deserialization) against its live `factOptions()` menu, which is scoped to
 * the block's position in the proof and depends on `context.results` — right
 * after a reload, results hasn't been recomputed yet, so a `define:<id>`
 * reference isn't in the menu, validation rejects it, and the value is
 * silently reset to blank. Accepting any value here keeps the reference
 * intact; the existing results-driven effect below already re-renders the
 * field's *display text* once evaluation catches up.
 */
class FactRefField extends Blockly.FieldDropdown {
  protected override doClassValidation_(newValue?: string): string | null {
    return newValue ?? null;
  }

  /**
   * Stock `FieldDropdown` labels itself from an option it cached when the value
   * was set, matched against the menu as it was then. References to facts the
   * proof creates (defined names, assumptions, claims) are always set before
   * evaluation has produced those facts, so the cache kept showing "— fact —"
   * while the stored reference was correct. Label from the current value
   * against a freshly generated menu instead.
   */
  protected override getText_(): string | null {
    const value = this.getValue();
    const option = this.getOptions(false).find(([, optionValue]) => optionValue === value);
    return option && typeof option[0] === 'string' ? option[0] : super.getText_();
  }
}

class StarBattleConstants extends Blockly.zelos.ConstantProvider {
  override shapeFor(connection: Blockly.RenderedConnection) {
    const check = connection.getCheck();
    if (check?.includes('Hypothesis') || check?.includes('HypothesisExpression')) {
      return this.SQUARED ?? super.shapeFor(connection);
    }
    return super.shapeFor(connection);
  }
}

class StarBattleRenderer extends Blockly.zelos.Renderer {
  protected override makeConstants_() {
    return new StarBattleConstants();
  }
}

class BoardDeleteArea extends Blockly.DeleteArea {
  override id = 'starbattle-board-delete-area';
  private readonly element: HTMLElement;

  constructor(element: HTMLElement) {
    super();
    this.element = element;
  }

  override getClientRect() {
    return Blockly.utils.Rect.from(this.element.getBoundingClientRect());
  }

  override onDragEnter(element: Blockly.IDraggable) {
    super.onDragEnter(element);
    this.element.classList.add('block-delete-target');
  }

  override onDragExit(element: Blockly.IDraggable) {
    super.onDragExit(element);
    this.element.classList.remove('block-delete-target');
  }

  override onDrop(element: Blockly.IDraggable) {
    super.onDrop(element);
    this.element.classList.remove('block-delete-target');
  }
}

if (!Blockly.registry.hasItem(Blockly.registry.Type.RENDERER, STAR_BATTLE_RENDERER)) {
  Blockly.registry.register(Blockly.registry.Type.RENDERER, STAR_BATTLE_RENDERER, StarBattleRenderer);
}

function factOptions(this: Blockly.FieldDropdown): Blockly.MenuOption[] {
  const source = this.getSourceBlock();
  let scope = source?.getParent() ?? null;
  while (scope && !context?.results.has(scope.id)) scope = scope.getParent();
  const result = scope ? context?.results.get(scope.id) : undefined;
  const facts = result?.scope?.facts ?? result?.prev.facts ?? context?.fallbackFacts ?? [];
  const options: Blockly.MenuOption[] = [['— fact —', '']];
  for (const fact of facts) options.push([context?.factLabel(fact) ?? fact.id, fact.id]);
  const current = this.getValue();
  if (current && !facts.some(fact => fact.id === current)) options.push([`${current} (unavailable)`, current]);
  return options;
}

/**
 * The suppositions in scope where this `use` sits — the same ancestor walk the fact dropdown
 * does, since a supposition lives on `PState` exactly as facts do and scopes the same way.
 */
function suppositionOptions(this: Blockly.FieldDropdown): Blockly.MenuOption[] {
  const source = this.getSourceBlock();
  let scope = source?.getParent() ?? null;
  while (scope && !context?.results.has(scope.id)) scope = scope.getParent();
  const result = scope ? context?.results.get(scope.id) : undefined;
  const made = result?.scope?.suppositions ?? result?.prev.suppositions ?? [];
  const options: Blockly.MenuOption[] = [['— supposition —', '']];
  for (const sup of made) {
    options.push([sup.contradiction ? `${sup.name} (impossible)` : sup.name, sup.name]);
  }
  const current = this.getValue();
  if (current && !made.some(sup => sup.name === current)) {
    options.push([`${current} (unavailable)`, current]);
  }
  return options;
}

function cellOptions(this: Blockly.FieldDropdown): Blockly.MenuOption[] {
  const size = context?.puzzle.size ?? 1;
  return Array.from({ length: size * size }, (_, index) => [posLabel(index, size), String(index)]);
}

const SPLIT_PART_CHECK = ['Hypothesis', 'HypothesisExpression'];

/**
 * `split` takes however many parts the proof needs, so its part sockets grow and shrink
 * with use: filling the last one adds a spare, and emptying one closes the gap, leaving
 * exactly one spare at the end. The socket count is saved with the block, since Blockly
 * reconnects a saved child only to an input that already exists.
 */
function defineSplitBlock(type: string, named: boolean): void {
  Blockly.Blocks[type] = {
    init() {
      this.appendValueInput('FACT').setCheck(SPLIT_PART_CHECK).appendField('split');
      if (named) this.appendDummyInput().appendField('as').appendField(new Blockly.FieldTextInput('part'), 'NAME');
      this.appendDummyInput().appendField('into');
      this.appendValueInput('PART0').setCheck(SPLIT_PART_CHECK);
      this.setPreviousStatement(true, 'Proof');
      this.setNextStatement(true, 'Proof');
      this.setColour(112);
      this.setTooltip(
        'Prove each part is exactly tight: the parts must be disjoint, cover the hypothesis, ' +
        'and their bounds must total its count',
      );
    },

    partInputs() {
      return this.inputList.filter((input: Blockly.Input) => input.name?.startsWith('PART'));
    },

    setPartCount(count: number) {
      const current = this.partInputs().length;
      for (let index = current; index < count; index++) {
        this.appendValueInput(`PART${index}`).setCheck(SPLIT_PART_CHECK);
      }
      for (let index = current - 1; index >= count; index--) this.removeInput(`PART${index}`, true);
    },

    saveExtraState() {
      return { parts: this.partInputs().length };
    },

    loadExtraState(state: { parts?: number } | null) {
      this.setPartCount(Math.max(1, state?.parts ?? 1));
    },

    /** Compact the filled sockets to the front and leave exactly one spare at the end. */
    reconcileParts(group?: string) {
      if (this.reconcilingParts) return;
      const targets: (Blockly.Block | null)[] = this.partInputs()
        .map((input: Blockly.Input) => input.connection?.targetBlock() ?? null);
      const filled = targets.filter((block): block is Blockly.Block => block !== null);
      const canonical = targets.length === filled.length + 1
        && targets.every((block, index) => (index < filled.length ? block !== null : block === null));
      if (canonical) return;
      this.reconcilingParts = true;
      const previousGroup = Blockly.Events.getGroup();
      Blockly.Events.setGroup(group || previousGroup || true);
      try {
        for (const block of filled) block.outputConnection?.disconnect();
        this.setPartCount(filled.length + 1);
        filled.forEach((block, index) => {
          const connection = this.getInput(`PART${index}`)?.connection;
          if (block.outputConnection) connection?.connect(block.outputConnection);
        });
      } finally {
        Blockly.Events.setGroup(previousGroup);
        this.reconcilingParts = false;
      }
    },

    onchange(event: Blockly.Events.Abstract) {
      if (!this.workspace || this.workspace.isDragging() || this.isInFlyout) return;
      if (!PART_EVENT_TYPES.has(event.type)) return;
      this.reconcileParts(event.group);
    },
  };
}

let contextMenuRegistered = false;

/**
 * Adds "Copy as text" to a statement's context menu. Only statements are offered, because
 * only a statement is valid proof text on its own — a bare hypothesis block would copy to
 * something `parseProof` cannot read back.
 */
function registerContextMenu(): void {
  if (contextMenuRegistered) return;
  contextMenuRegistered = true;
  Blockly.ContextMenuRegistry.registry.register({
    id: 'sb_copy_as_text',
    scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
    weight: 2,
    displayText: 'Copy as text',
    preconditionFn: scope =>
      scope.block && context && proofBlock(scope.block, context.puzzle) ? 'enabled' : 'hidden',
    callback: scope => {
      if (!scope.block || !context) return;
      const parsed = proofBlock(scope.block, context.puzzle);
      if (!parsed) return;
      void navigator.clipboard.writeText(`${printProof([parsed], context.puzzle)}\n`);
    },
  });
}

let clipboardShortcutsRegistered = false;

/**
 * Make Ctrl+C put the selection on the system clipboard as proof text.
 *
 * Blockly's copy stores a serialized block in its own clipboard, which pastes faithfully
 * inside the workspace but cannot be sent to anyone. This keeps that behaviour and adds the
 * text, so a statement can be copied straight into a message — and, with the paste
 * shortcut, copied back out of one.
 *
 * A hypothesis block is not a statement and will not parse back as a proof, so copying one
 * writes the expression for a reader's benefit and leaves Ctrl+V to Blockly, which
 * duplicates the block as it always did.
 */
function registerCopyText(): void {
  const registry = Blockly.ShortcutRegistry.registry;
  const blockCopy = registry.getRegistry()[Blockly.ShortcutItems.names.COPY];
  registry.unregister(Blockly.ShortcutItems.names.COPY);
  const key = (modifier: number) =>
    registry.createSerializedKey(Blockly.utils.KeyCodes.C, [modifier]);

  registry.register({
    name: 'sb_copy_proof_text',
    preconditionFn: workspace => !workspace.isDragging() && !Blockly.WidgetDiv.isVisible(),
    callback: (workspace, event, shortcut, scope) => {
      const copied = blockCopy?.callback?.(workspace, event, shortcut, scope) ?? false;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return copied;
      const current = clipboardContext;
      const selected = Blockly.common.getSelected();
      if (current && selected instanceof Blockly.BlockSvg) {
        const statement = proofBlock(selected, current.puzzle);
        const text = statement
          ? printProof([statement], current.puzzle)
          : printHypothesis(factExpression(selected, current.puzzle), current.puzzle);
        void navigator.clipboard.writeText(`${text}\n`).catch(() => {});
      }
      return copied;
    },
    keyCodes: [key(Blockly.utils.KeyCodes.CTRL), key(Blockly.utils.KeyCodes.META)],
  }, true);
}

/**
 * Make Ctrl+V understand proof text.
 *
 * Blockly binds the key to its own clipboard, which holds blocks copied inside the
 * workspace and knows nothing about the system one. So this takes the key, reads what is
 * actually on the clipboard, and splices it in when it parses as a proof. Anything else —
 * including a block copied in the workspace a moment ago — falls through to Blockly's
 * handler untouched, by invoking the shortcut this one displaced.
 */
let clipboardContext: { puzzle: Puzzle; insert: (parsed: Block[]) => void } | null = null;

function registerPasteText(): void {
  if (clipboardShortcutsRegistered) return;
  clipboardShortcutsRegistered = true;
  registerCopyText();
  const registry = Blockly.ShortcutRegistry.registry;
  // Take the binding over rather than adding to it: the registry refuses two shortcuts on
  // one key. The displaced handler is kept so non-proof text still pastes as blocks.
  const blockPaste = registry.getRegistry()[Blockly.ShortcutItems.names.PASTE];
  registry.unregister(Blockly.ShortcutItems.names.PASTE);
  const key = (modifier: number) =>
    registry.createSerializedKey(Blockly.utils.KeyCodes.V, [modifier]);

  registry.register({
    name: 'sb_paste_proof_text',
    preconditionFn: workspace => !workspace.isDragging() && !Blockly.WidgetDiv.isVisible(),
    callback: (workspace, event, shortcut, scope) => {
      const fallback = () => { blockPaste?.callback?.(workspace, event, shortcut, scope); };
      // The shortcut is registered once, but the board it should parse against changes
      // whenever a puzzle is picked — so read both from the context, never from a closure.
      const current = clipboardContext;
      if (!current) return false;
      // Typing into a field or one of the app's own inputs: leave the browser to it.
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return false;
      void navigator.clipboard.readText().then(text => {
        let parsed: Block[];
        try {
          parsed = parseProof(text, current.puzzle);
        } catch {
          fallback();
          return;
        }
        if (parsed.length === 0) fallback();
        else current.insert(parsed);
      }).catch(fallback);
      return true;
    },
    keyCodes: [key(Blockly.utils.KeyCodes.CTRL), key(Blockly.utils.KeyCodes.META)],
  }, true);
}

let registered = false;

function registerBlocks() {
  if (registered) return;
  registered = true;

  Blockly.Blocks.sb_stars = {
    init() {
      this.appendValueInput('FACT').setCheck(['Hypothesis', 'HypothesisExpression']).appendField('place forced ★ in');
      this.setPreviousStatement(true, 'Proof');
      this.setNextStatement(true, 'Proof');
      this.setColour(38);
      this.setTooltip('extract_stars: every remaining cell in a tight fact is a star');
    },
  };
  Blockly.Blocks.sb_elims = {
    init() {
      this.appendValueInput('FACT').setCheck(['Hypothesis', 'HypothesisExpression']).appendField('cross out rest of');
      this.setPreviousStatement(true, 'Proof');
      this.setNextStatement(true, 'Proof');
      this.setColour(2);
      this.setTooltip('extract_elims: a saturated fact has no stars left');
    },
  };
  Blockly.Blocks.sb_clear = {
    init() {
      this.appendValueInput('FACT').setCheck('Hypothesis').appendField('delete hypothesis');
      this.setPreviousStatement(true, 'Proof');
      this.setNextStatement(true, 'Proof');
      this.setColour(20);
      this.setTooltip('Remove a hypothesis from this point onward');
    },
  };
  Blockly.Blocks.sb_rename = {
    init() {
      this.appendValueInput('FACT').setCheck('Hypothesis').appendField('rename hypothesis');
      this.appendDummyInput().appendField('to').appendField(new Blockly.FieldTextInput('name'), 'NAME');
      this.setPreviousStatement(true, 'Proof');
      this.setNextStatement(true, 'Proof');
      this.setColour(20);
      this.setTooltip('Give a hypothesis a new display name from this point onward');
    },
  };
  Blockly.Blocks.sb_subsum = {
    init() {
      this.appendValueInput('FROM').setCheck('Hypothesis');
      this.appendDummyInput().appendField('-=');
      this.appendValueInput('SUB').setCheck('Hypothesis');
      this.setInputsInline(true);
      this.setPreviousStatement(true, 'Proof');
      this.setNextStatement(true, 'Proof');
      this.setColour(174);
      this.setTooltip('Subtract the right hypothesis from the left, replacing the left hypothesis');
    },
  };
  Blockly.Blocks.sb_fact_difference = {
    init() {
      this.appendValueInput('FROM').setCheck(['Hypothesis', 'HypothesisExpression']);
      this.appendDummyInput().appendField('-');
      this.appendValueInput('SUB').setCheck(['Hypothesis', 'HypothesisExpression']);
      this.setInputsInline(true);
      this.setOutput(true, 'HypothesisExpression');
      this.setOutputShape(HYPOTHESIS_OUTPUT_SHAPE);
      this.setColour(45);
      this.setTooltip('Subtract two hypotheses without changing either source');
    },
  };
  Blockly.Blocks.sb_fact_sum = {
    init() {
      this.appendValueInput('LEFT').setCheck(['Hypothesis', 'HypothesisExpression']);
      this.appendDummyInput().appendField('+');
      this.appendValueInput('RIGHT').setCheck(['Hypothesis', 'HypothesisExpression']);
      this.setInputsInline(true);
      this.setOutput(true, 'HypothesisExpression');
      this.setOutputShape(HYPOTHESIS_OUTPUT_SHAPE);
      this.setColour(45);
      this.setTooltip('Add two hypotheses without changing either source');
    },
  };
  Blockly.Blocks.sb_define = {
    init() {
      this.appendDummyInput()
        .appendField('define')
        .appendField(new Blockly.FieldTextInput('hyp'), 'NAME')
        .appendField('=');
      this.appendValueInput('VALUE').setCheck(['Hypothesis', 'HypothesisExpression']);
      this.setInputsInline(true);
      this.setPreviousStatement(true, 'Proof');
      this.setNextStatement(true, 'Proof');
      this.setColour(174);
      this.setTooltip('Create a named hypothesis from an expression');
    },
  };
  Blockly.Blocks.sb_replace = {
    init() {
      this.appendValueInput('TARGET').setCheck('Hypothesis').appendField('replace');
      this.appendValueInput('VALUE').setCheck(['Hypothesis', 'HypothesisExpression']).appendField('with');
      this.setPreviousStatement(true, 'Proof');
      this.setNextStatement(true, 'Proof');
      this.setColour(174);
      this.setTooltip('Replace a hypothesis with the result of a hypothesis expression');
    },
  };
  Blockly.Blocks.sb_addsum = {
    init() {
      this.appendValueInput('TO').setCheck('Hypothesis');
      this.appendDummyInput().appendField('+=');
      this.appendValueInput('ADD').setCheck('Hypothesis');
      this.setInputsInline(true);
      this.setPreviousStatement(true, 'Proof');
      this.setNextStatement(true, 'Proof');
      this.setColour(112);
      this.setTooltip('Add the right hypothesis to the left, replacing the left hypothesis');
    },
  };
  Blockly.Blocks.sb_combine = {
    init() {
      this.appendValueInput('LEFT').setCheck(['Hypothesis', 'HypothesisExpression']).appendField('combine');
      this.appendValueInput('RIGHT').setCheck(['Hypothesis', 'HypothesisExpression']).appendField('and');
      this.setOutput(true, 'HypothesisExpression');
      this.setOutputShape(HYPOTHESIS_OUTPUT_SHAPE);
      this.setColour(112);
      this.setTooltip('Combine ≤k with ≥k into =k, or ≤k/≥k with ≠k into a tighter bound; expose contradictory equalities');
    },
  };
  Blockly.Blocks.sb_clique = {
    init() {
      this.appendDummyInput().appendField('adj').appendField(new Blockly.FieldTextInput('pick cells'), 'CELLS');
      this.setOutput(true, 'HypothesisExpression');
      this.setOutputShape(HYPOTHESIS_OUTPUT_SHAPE);
      this.setColour(326);
      this.setTooltip('At most one ★ among pairwise-touching cells. Select this block, then click a pairwise-touching set of board cells');
    },
  };
  Blockly.Blocks.sb_at_least_zero = {
    init() {
      this.appendDummyInput().appendField('at least 0 ★ in').appendField(new Blockly.FieldTextInput('pick cells'), 'CELLS');
      this.setOutput(true, 'HypothesisExpression');
      this.setOutputShape(HYPOTHESIS_OUTPUT_SHAPE);
      this.setColour(326);
      this.setTooltip('Every set of cells contains at least zero stars');
    },
  };
  Blockly.Blocks.sb_at_most = {
    init() {
      this.appendDummyInput()
        .appendField('at most n ★ in')
        .appendField(new Blockly.FieldTextInput('pick cells'), 'CELLS');
      this.setOutput(true, 'HypothesisExpression');
      this.setOutputShape(HYPOTHESIS_OUTPUT_SHAPE);
      this.setColour(326);
      this.setTooltip('For n selected cells, their star count is at most n');
    },
  };
  Blockly.Blocks.sb_bound = {
    init() {
      this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown([['≤', '<='], ['≥', '>=']]), 'OP')
        .appendField(new Blockly.FieldNumber(0, 0), 'TARGET')
        .appendField('★ in')
        .appendField(new Blockly.FieldTextInput('pick cells'), 'CELLS');
      this.setOutput(true, 'HypothesisExpression');
      this.setOutputShape(HYPOTHESIS_OUTPUT_SHAPE);
      this.setColour(326);
      this.setTooltip('Assert a bound directly, for bounds the preset blocks do not cover');
    },
  };
  defineSplitBlock('sb_split', false);
  defineSplitBlock('sb_split_as', true);

  Blockly.Blocks.sb_sorry = {
    init() {
      this.appendDummyInput().appendField('sorry');
      this.setPreviousStatement(true, 'Proof');
      this.setNextStatement(true, 'Proof');
      this.setColour(0);
      this.setTooltip('Admit the enclosing claim without proving it. The proof stays usable, ' +
        'but it is incomplete until this is replaced.');
    },
  };
  Blockly.Blocks.sb_argument = {
    init() {
      this.appendDummyInput().appendField('argument');
      this.appendStatementInput('BODY').setCheck('Proof');
      this.setPreviousStatement(true, 'Proof');
      this.setNextStatement(true, 'Proof');
      this.setColour(230);
      this.setTooltip('Group proof blocks without changing their meaning');
    },
  };
  Blockly.Blocks.sb_suppose = {
    init() {
      this.appendValueInput('PRED').setCheck('Boolean')
        .appendField('suppose')
        .appendField(new Blockly.FieldTextInput('S'), 'NAME')
        .appendField(':');
      this.appendDummyInput().appendField('then');
      this.appendStatementInput('BODY').setCheck('Proof');
      this.setInputsInline(true);
      this.setPreviousStatement(true, 'Proof');
      this.setNextStatement(true, 'Proof');
      this.setColour(160);
      this.setTooltip('Work out what would follow if this were true. Proves nothing on its ' +
        'own — it records the consequences, and "use" brings them in once you have proved it.');
    },
  };
  Blockly.Blocks.sb_use = {
    init() {
      this.appendDummyInput().appendField('use')
        .appendField(new Blockly.FieldDropdown(suppositionOptions), 'NAME');
      this.setPreviousStatement(true, 'Proof');
      this.setNextStatement(true, 'Proof');
      this.setColour(160);
      this.setTooltip('Bring in what a supposition derived. Needs the supposition itself ' +
        'to be established here first.');
    },
  };
  Blockly.Blocks.sb_claim = {
    init() {
      this.appendValueInput('PRED').setCheck('Boolean').appendField('claim');
      this.appendDummyInput().appendField('because');
      this.appendStatementInput('BODY').setCheck('Proof');
      this.setInputsInline(true);
      this.setPreviousStatement(true, 'Proof');
      this.setNextStatement(true, 'Proof');
      this.setColour(210);
      this.setTooltip('Prove the Boolean goal in an isolated proof');
    },
  };
  Blockly.Blocks.sb_by_contradiction = { init() {
    this.appendDummyInput().appendField('by contradiction');
    this.appendStatementInput('BODY').setCheck('Proof');
    this.appendValueInput('CONTRADICTION')
      .setCheck(['Hypothesis', 'HypothesisExpression'])
      .appendField('contradiction');
    this.setPreviousStatement(true, 'Proof'); this.setColour(285);
    this.setTooltip('Closes a goal when the supplied hypothesis expression contradicts itself');
  } };
  Blockly.Blocks.sb_constructor = { init() {
    this.appendDummyInput().appendField('constructor');
    this.appendStatementInput('LEFT').setCheck('Proof').appendField('prove left');
    this.appendStatementInput('RIGHT').setCheck('Proof').appendField('prove right');
    this.setPreviousStatement(true, 'Proof'); this.setColour(285);
    this.setTooltip('Closes an AND goal by proving both sides independently');
  } };
  Blockly.Blocks.sb_by_cases = { init() {
    this.appendDummyInput().appendField('by cases on').appendField(new Blockly.FieldDropdown([['left side', 'left'], ['right side', 'right']]), 'SPLIT');
    this.appendStatementInput('POS').setCheck('Proof').appendField('positive case');
    this.appendStatementInput('NEG').setCheck('Proof').appendField('negative case');
    this.setPreviousStatement(true, 'Proof'); this.setColour(285);
    this.setTooltip('Closes an OR goal by splitting on either disjunct');
  } };
  Blockly.Blocks.sb_count = {
    init() {
      this.appendDummyInput().appendField('★ count of').appendField(new Blockly.FieldTextInput('pick cells'), 'CELLS');
      this.setOutput(true, 'Number');
      this.setColour(210);
      this.setTooltip('Select this block, then click cells on the board');
    },
  };
  Blockly.Blocks.sb_start = {
    init() {
      this.appendDummyInput().appendField('Start of proof');
      this.setNextStatement(true, 'Proof');
      this.setColour(45);
      this.setMovable(false);
      this.setDeletable(false);
      this.setTooltip('Every proof begins here');
    },
  };
  Blockly.Blocks.sb_fact = {
    init() {
      this.appendDummyInput().appendField(new FactRefField(factOptions), 'FACT');
      this.setOutput(true, 'Hypothesis');
      this.setOutputShape(HYPOTHESIS_OUTPUT_SHAPE);
      this.setColour(55);
      this.setTooltip('Drag this known fact into a hypothesis socket');
    },
  };
  Blockly.Blocks.sb_compare = {
    init() {
      this.appendValueInput('A').setCheck('Number');
      this.appendDummyInput().appendField(new Blockly.FieldDropdown([
        ['=', '='], ['≠', '!='], ['<', '<'], ['>', '>'], ['≤', '<='], ['≥', '>='],
      ]), 'OP');
      this.appendValueInput('B').setCheck('Number');
      this.setInputsInline(true);
      this.setOutput(true, 'Boolean');
      this.setColour(210);
      this.setTooltip('Compare two star-count arithmetic expressions');
    },
  };
  Blockly.Blocks.sb_and = { init() {
    this.appendValueInput('A').setCheck('Boolean'); this.appendDummyInput().appendField('AND'); this.appendValueInput('B').setCheck('Boolean');
    this.setInputsInline(true); this.setOutput(true, 'Boolean'); this.setColour(210);
    this.setTooltip('Logical conjunction; matching lower and upper bounds normalize to equality');
  } };
  Blockly.Blocks.sb_or = { init() {
    this.appendValueInput('A').setCheck('Boolean'); this.appendDummyInput().appendField('OR'); this.appendValueInput('B').setCheck('Boolean');
    this.setInputsInline(true); this.setOutput(true, 'Boolean'); this.setColour(210);
    this.setTooltip('Logical disjunction; bounds below and above one value normalize to not-equal');
  } };
  Blockly.Blocks.sb_not = { init() {
    this.appendValueInput('A').setCheck('Boolean').appendField('NOT'); this.setOutput(true, 'Boolean'); this.setColour(210);
    this.setTooltip('Logical negation; use by contradiction to close a NOT goal');
  } };
  Blockly.Blocks.sb_is_star = { init() {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(cellOptions), 'CELL')
      .appendField('is ★');
    this.setOutput(true, 'Boolean'); this.setColour(210);
    this.setTooltip('The selected cell contains a star. Select this block, then click a board cell.');
  } };
  Blockly.Blocks.sb_is_elim = { init() {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(cellOptions), 'CELL')
      .appendField('is ✕');
    this.setOutput(true, 'Boolean'); this.setColour(210);
    this.setTooltip('The selected cell is eliminated. Select this block, then click a board cell.');
  } };
}

function makeToolbox(facts: Fact[]): Blockly.utils.toolbox.ToolboxDefinition {
  return {
  kind: 'flyoutToolbox',
  contents: [
    { kind: 'label', text: 'PROOF' },
    { kind: 'block', type: 'sb_stars' },
    { kind: 'block', type: 'sb_elims' },
    { kind: 'block', type: 'sb_subsum' },
    { kind: 'block', type: 'sb_define' },
    { kind: 'block', type: 'sb_replace' },
    { kind: 'block', type: 'sb_fact_difference' },
    { kind: 'block', type: 'sb_fact_sum' },
    { kind: 'block', type: 'sb_addsum' },
    { kind: 'block', type: 'sb_split' },
    { kind: 'block', type: 'sb_split_as' },
    { kind: 'block', type: 'sb_combine' },
    { kind: 'block', type: 'sb_clique' },
    { kind: 'block', type: 'sb_at_least_zero' },
    { kind: 'block', type: 'sb_at_most' },
    { kind: 'block', type: 'sb_bound' },
    { kind: 'block', type: 'sb_argument' },
    { kind: 'block', type: 'sb_claim' },
    { kind: 'block', type: 'sb_suppose' },
    { kind: 'block', type: 'sb_use' },
    { kind: 'block', type: 'sb_by_contradiction' },
    { kind: 'block', type: 'sb_constructor' },
    { kind: 'block', type: 'sb_by_cases' },
    { kind: 'block', type: 'sb_sorry' },
    { kind: 'label', text: 'CLAIMS' },
    { kind: 'block', type: 'sb_compare' },
    { kind: 'block', type: 'sb_and' },
    { kind: 'block', type: 'sb_or' },
    { kind: 'block', type: 'sb_not' },
    { kind: 'block', type: 'sb_is_star' },
    { kind: 'block', type: 'sb_is_elim' },
    { kind: 'block', type: 'sb_count' },
    { kind: 'block', type: 'math_number' },
    { kind: 'block', type: 'math_arithmetic', fields: { OP: 'ADD' } },
    { kind: 'block', type: 'math_arithmetic', fields: { OP: 'MINUS' } },
    { kind: 'label', text: 'HYPOTHESES' },
    { kind: 'block', type: 'sb_rename' },
    { kind: 'block', type: 'sb_clear' },
    ...facts.map(fact => ({ kind: 'block' as const, type: 'sb_fact', fields: { FACT: fact.id } })),
  ],
  };
}

function cellsFromText(text: string, puzzle: Puzzle): number[] {
  const labels = new Map(Array.from(
    { length: puzzle.size * puzzle.size },
    (_, index) => [posLabel(index, puzzle.size).toUpperCase(), index],
  ));
  const cells = text.toUpperCase().split(/[^A-Z0-9]+/).map(part => labels.get(part)).filter((cell): cell is number => cell !== undefined);
  return [...new Set(cells)].sort((a, b) => a - b);
}

function cellsText(cells: number[], puzzle: Puzzle): string {
  return cells.map(cell => posLabel(cell, puzzle.size)).join(' ') || 'pick cells';
}

function numExpr(block: Blockly.Block | null, puzzle: Puzzle): NumExpr | null {
  if (!block) return null;
  if (block.type === 'sb_count') {
    return { eid: block.id, kind: 'count', cells: cellsFromText(block.getFieldValue('CELLS'), puzzle) };
  }
  if (block.type === 'math_number') {
    return { eid: block.id, kind: 'lit', value: Math.floor(Number(block.getFieldValue('NUM')) || 0) };
  }
  if (block.type === 'math_arithmetic') {
    const op = block.getFieldValue('OP');
    if (op !== 'ADD' && op !== 'MINUS') return null;
    return {
      eid: block.id,
      kind: op === 'ADD' ? 'add' : 'sub',
      a: numExpr(block.getInputTargetBlock('A'), puzzle),
      b: numExpr(block.getInputTargetBlock('B'), puzzle),
    };
  }
  return null;
}

function boolExpr(block: Blockly.Block | null, puzzle: Puzzle): BoolExpr | null {
  if (!block) return null;
  if (block.type === 'sb_compare') return { eid: block.id, kind: 'cmp', op: block.getFieldValue('OP'), a: numExpr(block.getInputTargetBlock('A'), puzzle), b: numExpr(block.getInputTargetBlock('B'), puzzle) };
  if (block.type === 'sb_and' || block.type === 'sb_or') return { eid: block.id, kind: block.type === 'sb_and' ? 'and' : 'or', a: boolExpr(block.getInputTargetBlock('A'), puzzle), b: boolExpr(block.getInputTargetBlock('B'), puzzle) };
  if (block.type === 'sb_not') return { eid: block.id, kind: 'not', a: boolExpr(block.getInputTargetBlock('A'), puzzle) };
  if (block.type === 'sb_is_star' || block.type === 'sb_is_elim') {
    return { eid: block.id, kind: block.type === 'sb_is_star' ? 'is_star' : 'is_elim', cell: Number(block.getFieldValue('CELL')) };
  }
  return null;
}

function factInput(block: Blockly.Block, input: string): string | null {
  const fact = block.getInputTargetBlock(input);
  return fact?.type === 'sb_fact' ? fact.getFieldValue('FACT') || null : null;
}

function factExpression(block: Blockly.Block | null, puzzle: Puzzle): HypExpr | null {
  if (block?.type === 'sb_fact') {
    return { eid: block.id, kind: 'ref', factId: block.getFieldValue('FACT') || null };
  }
  if (block?.type === 'sb_fact_difference') {
    return { eid: block.id, kind: 'sub', left: factExpression(block.getInputTargetBlock('FROM'), puzzle), right: factExpression(block.getInputTargetBlock('SUB'), puzzle) };
  }
  if (block?.type === 'sb_fact_sum') {
    return { eid: block.id, kind: 'add', left: factExpression(block.getInputTargetBlock('LEFT'), puzzle), right: factExpression(block.getInputTargetBlock('RIGHT'), puzzle) };
  }
  if (block?.type === 'sb_combine') {
    return { eid: block.id, kind: 'combine', left: factExpression(block.getInputTargetBlock('LEFT'), puzzle), right: factExpression(block.getInputTargetBlock('RIGHT'), puzzle) };
  }
  if (block?.type === 'sb_clique') {
    return { eid: block.id, kind: 'clique', cells: cellsFromText(block.getFieldValue('CELLS'), puzzle) };
  }
  if (block?.type === 'sb_at_least_zero' || block?.type === 'sb_at_most') {
    const cells = cellsFromText(block.getFieldValue('CELLS'), puzzle);
    return {
      eid: block.id,
      kind: 'bound',
      op: block.type === 'sb_at_least_zero' ? '>=' : '<=',
      cells,
      target: block.type === 'sb_at_least_zero' ? 0 : cells.length,
    };
  }
  if (block?.type === 'sb_bound') {
    const op = block.getFieldValue('OP');
    return {
      eid: block.id,
      kind: 'bound',
      op: op === '>=' ? '>=' : '<=',
      cells: cellsFromText(block.getFieldValue('CELLS'), puzzle),
      target: Math.max(0, Math.floor(Number(block.getFieldValue('TARGET')) || 0)),
    };
  }
  return null;
}

function proofBlock(block: Blockly.Block, puzzle: Puzzle): Block | null {
  switch (block.type) {
    case 'sb_stars': return { id: block.id, type: 'stars', expr: factExpression(block.getInputTargetBlock('FACT'), puzzle) };
    case 'sb_elims': return { id: block.id, type: 'elims', expr: factExpression(block.getInputTargetBlock('FACT'), puzzle) };
    case 'sb_clear': return { id: block.id, type: 'clear', factId: factInput(block, 'FACT') };
    case 'sb_rename': return { id: block.id, type: 'rename', factId: factInput(block, 'FACT'), name: block.getFieldValue('NAME') };
    case 'sb_subsum': return { id: block.id, type: 'subsum', subFactId: factInput(block, 'SUB'), fromFactId: factInput(block, 'FROM') };
    case 'sb_define': return { id: block.id, type: 'define', name: block.getFieldValue('NAME'), expr: factExpression(block.getInputTargetBlock('VALUE'), puzzle) };
    case 'sb_replace': return { id: block.id, type: 'replace', targetFactId: factInput(block, 'TARGET'), expr: factExpression(block.getInputTargetBlock('VALUE'), puzzle) };
    case 'sb_addsum': return { id: block.id, type: 'addsum', addFactId: factInput(block, 'ADD'), toFactId: factInput(block, 'TO') };
    case 'sb_split':
    case 'sb_split_as': {
      const parts: HypExpr[] = [];
      for (const input of block.inputList) {
        if (!input.name?.startsWith('PART')) continue;
        const part = factExpression(input.connection?.targetBlock() ?? null, puzzle);
        if (part) parts.push(part);
      }
      return {
        id: block.id,
        type: 'split',
        name: block.type === 'sb_split_as' ? block.getFieldValue('NAME') : '',
        expr: factExpression(block.getInputTargetBlock('FACT'), puzzle),
        parts,
      };
    }
    case 'sb_sorry': return { id: block.id, type: 'sorry' };
    case 'sb_argument': return { id: block.id, type: 'argument', body: proofSequence(block.getInputTargetBlock('BODY'), puzzle) };
    case 'sb_suppose': return {
      id: block.id,
      type: 'suppose',
      name: block.getFieldValue('NAME') ?? '',
      pred: boolExpr(block.getInputTargetBlock('PRED'), puzzle),
      body: proofSequence(block.getInputTargetBlock('BODY'), puzzle),
    };
    case 'sb_use': return { id: block.id, type: 'use', name: block.getFieldValue('NAME') ?? '' };
    case 'sb_claim': return {
      id: block.id,
      type: 'claim',
      pred: boolExpr(block.getInputTargetBlock('PRED'), puzzle),
      body: proofSequence(block.getInputTargetBlock('BODY'), puzzle),
    };
    case 'sb_by_contradiction': return {
      id: block.id,
      type: 'by_contradiction',
      body: proofSequence(block.getInputTargetBlock('BODY'), puzzle),
      contradiction: factExpression(block.getInputTargetBlock('CONTRADICTION'), puzzle),
    };
    case 'sb_constructor': return { id: block.id, type: 'constructor', left: proofSequence(block.getInputTargetBlock('LEFT'), puzzle), right: proofSequence(block.getInputTargetBlock('RIGHT'), puzzle) };
    case 'sb_by_cases': return { id: block.id, type: 'by_cases', split: block.getFieldValue('SPLIT'), positive: proofSequence(block.getInputTargetBlock('POS'), puzzle), negative: proofSequence(block.getInputTargetBlock('NEG'), puzzle) };
    default: return null;
  }
}

function proofSequence(first: Blockly.Block | null, puzzle: Puzzle): Block[] {
  const blocks: Block[] = [];
  for (let cursor = first; cursor; cursor = cursor.getNextBlock()) {
    const parsed = proofBlock(cursor, puzzle);
    if (parsed) blocks.push(parsed);
  }
  return blocks;
}

function workspaceProof(workspace: Blockly.WorkspaceSvg, puzzle: Puzzle): Block[] {
  const start = workspace.getTopBlocks(false).find(block => block.type === 'sb_start');
  return proofSequence(start?.getNextBlock() ?? null, puzzle);
}

/**
 * Put a parsed fragment into the proof, after `anchor` or at the end, reconnecting
 * whatever followed so the splice is one undoable step.
 */
function spliceAfter(
  workspace: Blockly.WorkspaceSvg,
  anchor: Blockly.Block,
  parsed: Block[],
  puzzle: Puzzle,
): void {
  Blockly.Events.setGroup(Blockly.utils.idGenerator.genUid());
  try {
    const first = buildSequence(workspace, parsed, puzzle);
    if (!first) return;
    let last = first;
    while (last.getNextBlock()) last = last.getNextBlock()!;
    const following = anchor.getNextBlock();
    if (following?.previousConnection) following.previousConnection.disconnect();
    anchor.nextConnection?.connect(first.previousConnection!);
    if (following?.previousConnection) last.nextConnection?.connect(following.previousConnection);
  } finally {
    Blockly.Events.setGroup(false);
  }
}

/** The proof statement a block belongs to (itself, for a statement block). */
function enclosingStep(block: Blockly.Block | null): Blockly.Block | null {
  let step = block;
  while (step && (
    !step.type.startsWith('sb_') ||
    ['sb_fact', 'sb_fact_difference', 'sb_fact_sum', 'sb_combine', 'sb_clique', 'sb_at_least_zero', 'sb_at_most', 'sb_bound', 'sb_count', 'sb_compare', 'sb_and', 'sb_or', 'sb_not', 'sb_is_star', 'sb_is_elim'].includes(step.type)
  )) step = step.getParent();
  return step;
}

/**
 * Rewrite references saved by older builds, whose fact ids embedded block ids,
 * in the proof and in any floating stacks alike.
 */
/**
 * Renumber line references saved before rows, columns and regions were named as the GUI
 * names them: `row0` was the first row, and columns were numbered rather than lettered.
 *
 * This must run exactly once per saved proof. Running it twice would turn `row1` into `row2`
 * and quietly change which row the proof is about, so saves carry a marker and only those
 * without one are touched — the shift is not the kind of mistake that announces itself.
 */
function migrateLineIds(workspace: Blockly.WorkspaceSvg): void {
  let upgraded = 0;
  for (const ref of workspace.getBlocksByType('sb_fact', false)) {
    const old = ref.getFieldValue('FACT');
    const parsed = /^(row|col|region)(\d+)$/.exec(old ?? '');
    if (!parsed) continue;
    const index = Number(parsed[2]);
    const current = parsed[1] === 'col'
      ? `col${String.fromCharCode(65 + index)}`
      : `${parsed[1]}${index + 1}`;
    ref.setFieldValue(current, 'FACT');
    upgraded++;
  }
  if (upgraded > 0) {
    console.info(`Renamed ${upgraded} line reference${upgraded === 1 ? '' : 's'} to match the ` +
      'board: rows and regions now count from one, and columns are lettered.');
  }
}

function migrateLegacyReferences(workspace: Blockly.WorkspaceSvg, puzzle: Puzzle): void {
  const stacks = workspace.getTopBlocks(false).flatMap(top =>
    proofSequence(top.type === 'sb_start' ? top.getNextBlock() : top, puzzle));
  const ids = legacyFactIds(stacks);
  let upgraded = 0;
  for (const ref of workspace.getBlocksByType('sb_fact', false)) {
    const current = ids.get(ref.getFieldValue('FACT'));
    if (!current) continue;
    ref.setFieldValue(current, 'FACT');
    upgraded++;
  }
  if (upgraded > 0) console.info(`Upgraded ${upgraded} hypothesis reference${upgraded === 1 ? '' : 's'} saved by an older version.`);
}

/**
 * A define's name is its fact's id, so renaming it must carry along the
 * references that resolve to it: everything after it in its statement list,
 * nested bodies included, up to where `from` is defined again.
 */
function renameReferences(first: Blockly.Block | null, from: string, to: string): void {
  for (let stmt = first; stmt; stmt = stmt.getNextBlock()) {
    for (const input of stmt.inputList) {
      const child = input.connection?.targetBlock() ?? null;
      if (!child) continue;
      if (input instanceof Blockly.inputs.StatementInput) {
        renameReferences(child, from, to);
        continue;
      }
      for (const ref of child.getDescendants(false)) {
        if (ref.type === 'sb_fact' && ref.getFieldValue('FACT') === from) ref.setFieldValue(to, 'FACT');
      }
    }
    if (stmt.type === 'sb_define' && stmt.getFieldValue('NAME').trim() === from) return;
  }
}

// ── Block[] -> Blockly blocks (the inverse of proofBlock/factExpression/numExpr/boolExpr) ──
// Used to load a text-parsed proof (see proofText.ts) into the visual editor.

function newBuiltBlock(workspace: Blockly.WorkspaceSvg, type: string): Blockly.Block {
  const block = workspace.newBlock(type);
  block.initSvg();
  block.render();
  return block;
}

function connectValue(parent: Blockly.Block, inputName: string, child: Blockly.Block | null): void {
  if (!child?.outputConnection) return;
  parent.getInput(inputName)?.connection?.connect(child.outputConnection);
}

function connectStatement(parent: Blockly.Block, inputName: string, first: Blockly.Block | null): void {
  if (!first?.previousConnection) return;
  parent.getInput(inputName)?.connection?.connect(first.previousConnection);
}

function buildFactRef(workspace: Blockly.WorkspaceSvg, factId: string | null): Blockly.Block | null {
  if (!factId) return null;
  const block = newBuiltBlock(workspace, 'sb_fact');
  block.setFieldValue(factId, 'FACT');
  return block;
}

function buildHyp(workspace: Blockly.WorkspaceSvg, expr: HypExpr | null, puzzle: Puzzle): Blockly.Block | null {
  if (!expr) return null;
  if (expr.kind === 'ref') return buildFactRef(workspace, expr.factId);
  if (expr.kind === 'clique') {
    const block = newBuiltBlock(workspace, 'sb_clique');
    block.setFieldValue(cellsText(expr.cells, puzzle), 'CELLS');
    return block;
  }
  if (expr.kind === 'bound') {
    const block = newBuiltBlock(workspace, 'sb_bound');
    block.setFieldValue(expr.op, 'OP');
    block.setFieldValue(String(expr.target), 'TARGET');
    block.setFieldValue(cellsText(expr.cells, puzzle), 'CELLS');
    return block;
  }
  if (expr.kind === 'sub') {
    const block = newBuiltBlock(workspace, 'sb_fact_difference');
    connectValue(block, 'FROM', buildHyp(workspace, expr.left, puzzle));
    connectValue(block, 'SUB', buildHyp(workspace, expr.right, puzzle));
    return block;
  }
  const block = newBuiltBlock(workspace, expr.kind === 'add' ? 'sb_fact_sum' : 'sb_combine');
  connectValue(block, 'LEFT', buildHyp(workspace, expr.left, puzzle));
  connectValue(block, 'RIGHT', buildHyp(workspace, expr.right, puzzle));
  return block;
}

function buildNum(workspace: Blockly.WorkspaceSvg, expr: NumExpr | null, puzzle: Puzzle): Blockly.Block | null {
  if (!expr) return null;
  if (expr.kind === 'lit') {
    const block = newBuiltBlock(workspace, 'math_number');
    block.setFieldValue(String(expr.value), 'NUM');
    return block;
  }
  if (expr.kind === 'count') {
    const block = newBuiltBlock(workspace, 'sb_count');
    block.setFieldValue(cellsText(expr.cells, puzzle), 'CELLS');
    return block;
  }
  const block = newBuiltBlock(workspace, 'math_arithmetic');
  block.setFieldValue(expr.kind === 'add' ? 'ADD' : 'MINUS', 'OP');
  connectValue(block, 'A', buildNum(workspace, expr.a, puzzle));
  connectValue(block, 'B', buildNum(workspace, expr.b, puzzle));
  return block;
}

function buildBool(workspace: Blockly.WorkspaceSvg, expr: BoolExpr | null, puzzle: Puzzle): Blockly.Block | null {
  if (!expr) return null;
  switch (expr.kind) {
    case 'is_star':
    case 'is_elim': {
      const block = newBuiltBlock(workspace, expr.kind === 'is_star' ? 'sb_is_star' : 'sb_is_elim');
      block.setFieldValue(String(expr.cell), 'CELL');
      return block;
    }
    case 'cmp': {
      const block = newBuiltBlock(workspace, 'sb_compare');
      block.setFieldValue(expr.op, 'OP');
      connectValue(block, 'A', buildNum(workspace, expr.a, puzzle));
      connectValue(block, 'B', buildNum(workspace, expr.b, puzzle));
      return block;
    }
    case 'not': {
      const block = newBuiltBlock(workspace, 'sb_not');
      connectValue(block, 'A', buildBool(workspace, expr.a, puzzle));
      return block;
    }
    case 'and':
    case 'or': {
      const block = newBuiltBlock(workspace, expr.kind === 'and' ? 'sb_and' : 'sb_or');
      connectValue(block, 'A', buildBool(workspace, expr.a, puzzle));
      connectValue(block, 'B', buildBool(workspace, expr.b, puzzle));
      return block;
    }
  }
}

function buildStmt(workspace: Blockly.WorkspaceSvg, b: Block, puzzle: Puzzle): Blockly.Block {
  switch (b.type) {
    case 'stars': {
      const block = newBuiltBlock(workspace, 'sb_stars');
      connectValue(block, 'FACT', buildHyp(workspace, b.expr, puzzle));
      return block;
    }
    case 'elims': {
      const block = newBuiltBlock(workspace, 'sb_elims');
      connectValue(block, 'FACT', buildHyp(workspace, b.expr, puzzle));
      return block;
    }
    case 'clear': {
      const block = newBuiltBlock(workspace, 'sb_clear');
      connectValue(block, 'FACT', buildFactRef(workspace, b.factId));
      return block;
    }
    case 'rename': {
      const block = newBuiltBlock(workspace, 'sb_rename');
      connectValue(block, 'FACT', buildFactRef(workspace, b.factId));
      block.setFieldValue(b.name, 'NAME');
      return block;
    }
    case 'subsum': {
      const block = newBuiltBlock(workspace, 'sb_subsum');
      connectValue(block, 'FROM', buildFactRef(workspace, b.fromFactId));
      connectValue(block, 'SUB', buildFactRef(workspace, b.subFactId));
      return block;
    }
    case 'addsum': {
      const block = newBuiltBlock(workspace, 'sb_addsum');
      connectValue(block, 'TO', buildFactRef(workspace, b.toFactId));
      connectValue(block, 'ADD', buildFactRef(workspace, b.addFactId));
      return block;
    }
    case 'split': {
      const block = newBuiltBlock(workspace, b.name ? 'sb_split_as' : 'sb_split');
      if (b.name) block.setFieldValue(b.name, 'NAME');
      connectValue(block, 'FACT', buildHyp(workspace, b.expr, puzzle));
      (block as Blockly.Block & { setPartCount(count: number): void }).setPartCount(b.parts.length + 1);
      b.parts.forEach((part, index) => connectValue(block, `PART${index}`, buildHyp(workspace, part, puzzle)));
      return block;
    }
    case 'define': {
      const block = newBuiltBlock(workspace, 'sb_define');
      block.setFieldValue(b.name || 'hyp', 'NAME');
      connectValue(block, 'VALUE', buildHyp(workspace, b.expr, puzzle));
      return block;
    }
    case 'replace': {
      const block = newBuiltBlock(workspace, 'sb_replace');
      connectValue(block, 'TARGET', buildFactRef(workspace, b.targetFactId));
      connectValue(block, 'VALUE', buildHyp(workspace, b.expr, puzzle));
      return block;
    }
    case 'sorry': return newBuiltBlock(workspace, 'sb_sorry');
    case 'argument': {
      const block = newBuiltBlock(workspace, 'sb_argument');
      connectStatement(block, 'BODY', buildSequence(workspace, b.body, puzzle));
      return block;
    }
    case 'suppose': {
      const block = newBuiltBlock(workspace, 'sb_suppose');
      block.setFieldValue(b.name, 'NAME');
      connectValue(block, 'PRED', buildBool(workspace, b.pred, puzzle));
      connectStatement(block, 'BODY', buildSequence(workspace, b.body, puzzle));
      return block;
    }
    case 'use': {
      const block = newBuiltBlock(workspace, 'sb_use');
      block.setFieldValue(b.name, 'NAME');
      return block;
    }
    case 'claim': {
      const block = newBuiltBlock(workspace, 'sb_claim');
      connectValue(block, 'PRED', buildBool(workspace, b.pred, puzzle));
      connectStatement(block, 'BODY', buildSequence(workspace, b.body, puzzle));
      return block;
    }
    case 'by_contradiction': {
      const block = newBuiltBlock(workspace, 'sb_by_contradiction');
      connectStatement(block, 'BODY', buildSequence(workspace, b.body, puzzle));
      connectValue(block, 'CONTRADICTION', buildHyp(workspace, b.contradiction, puzzle));
      return block;
    }
    case 'constructor': {
      const block = newBuiltBlock(workspace, 'sb_constructor');
      connectStatement(block, 'LEFT', buildSequence(workspace, b.left, puzzle));
      connectStatement(block, 'RIGHT', buildSequence(workspace, b.right, puzzle));
      return block;
    }
    case 'by_cases': {
      const block = newBuiltBlock(workspace, 'sb_by_cases');
      block.setFieldValue(b.split, 'SPLIT');
      connectStatement(block, 'POS', buildSequence(workspace, b.positive, puzzle));
      connectStatement(block, 'NEG', buildSequence(workspace, b.negative, puzzle));
      return block;
    }
  }
}

/** Build a chain of sibling statement blocks; returns the first (for connecting to its container). */
function buildSequence(workspace: Blockly.WorkspaceSvg, blocks: Block[], puzzle: Puzzle): Blockly.Block | null {
  let first: Blockly.Block | null = null;
  let prev: Blockly.Block | null = null;
  for (const b of blocks) {
    const built = buildStmt(workspace, b, puzzle);
    first ??= built;
    if (prev?.nextConnection && built.previousConnection) prev.nextConnection.connect(built.previousConnection);
    prev = built;
  }
  return first;
}

export interface ProofWorkspaceHandle {
  editSelectedCell: (cell: number) => void;
  dropHypothesis: (factId: string, clientX: number, clientY: number) => void;
  clearProof: () => void;
  copyProof: () => Promise<void>;
  pasteProof: () => Promise<void>;
  /** Print the current proof as lispy text (see proofText.ts) and copy it to the clipboard. */
  copyProofText: () => Promise<void>;
  /** Parse lispy proof text from the clipboard and replace the workspace with it. */
  pasteProofText: () => Promise<void>;
  /** Parse lispy proof text and splice it into the proof without disturbing the rest. */
  insertProofText: () => Promise<void>;
  /** End cell picking: forget a selected pick-cells block, keeping its proof step as context. */
  stopPicking: () => void;
  /** Scope back to the end of the proof (a click on dead space). */
  resetScope: () => void;
}

interface ProofWorkspaceProps extends BlocklyContext {
  onChange: (blocks: Block[]) => void;
  /** A click on the workspace background — neutral space inside the editor. */
  onNeutralClick: () => void;
  /** `startedPicking` is true only when the user has just selected a pick-cells block. */
  onSelection: (proofId: string | null, picking: boolean, cells: number[], hypothesis: HypExpr | null, startedPicking: boolean) => void;
}

export const BlocklyProof = forwardRef<ProofWorkspaceHandle, ProofWorkspaceProps>(function BlocklyProof({
  puzzle, results, fallbackFacts, factLabel, onChange, onSelection, onNeutralClick,
}, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const zoomControlsRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const selectedRef = useRef<Blockly.Block | null>(null);
  const proofContextRef = useRef<Blockly.Block | null>(null);
  const initialFactsRef = useRef(fallbackFacts);
  const toolboxFactsRef = useRef(fallbackFacts);
  const warningTextRef = useRef(new Map<string, string | null>());
  const factTextRef = useRef(new WeakMap<Blockly.FieldDropdown, string>());
  const callbacksRef = useRef({ onChange, onSelection, onNeutralClick });
  callbacksRef.current = { onChange, onSelection, onNeutralClick };
  toolboxFactsRef.current = fallbackFacts;
  context = { puzzle, results, fallbackFacts, factLabel };
  const toolboxFactsKey = fallbackFacts.map(fact => `${fact.id}:${factLabel(fact)}`).join('|');
  const storageKey = `starbattle-proof:${puzzle.name}:${puzzle.categoryIndex}`;

  const addStartBlock = useCallback((workspace: Blockly.WorkspaceSvg) => {
    const start = workspace.newBlock('sb_start');
    start.initSvg();
    start.render();
    start.moveBy(32, 32);
  }, []);

  const saveWorkspace = useCallback((workspace: Blockly.WorkspaceSvg) => {
    const saved = {
      puzzle: storageKey,
      // Marks the proof as using board-matching line names, so the one-time renumbering in
      // `migrateLineIds` never runs over it a second time.
      lineIds: 'named',
      workspace: Blockly.serialization.workspaces.save(workspace),
    };
    window.localStorage.setItem(storageKey, JSON.stringify(saved));
    return saved;
  }, [storageKey]);

  const loadWorkspace = useCallback((
    workspace: Blockly.WorkspaceSvg,
    saved: { puzzle?: string; lineIds?: string; workspace?: object },
  ) => {
    if (saved.puzzle && saved.puzzle !== storageKey) throw new Error('That proof belongs to a different puzzle.');
    if (!saved.workspace) throw new Error('The clipboard does not contain a Star Battle proof.');
    Blockly.Events.disable();
    try {
      workspace.clear();
      Blockly.serialization.workspaces.load(saved.workspace, workspace);
      if (!workspace.getTopBlocks(false).some(block => block.type === 'sb_start')) addStartBlock(workspace);
      migrateLegacyReferences(workspace, puzzle);
      if (saved.lineIds !== 'named') migrateLineIds(workspace);
    } finally {
      Blockly.Events.enable();
    }
    callbacksRef.current.onChange(workspaceProof(workspace, puzzle));
    saveWorkspace(workspace);
  }, [addStartBlock, puzzle, saveWorkspace, storageKey]);

  /** Splice a fragment after the scoped step, or at the end of the proof. */
  const insertParsed = useCallback((workspace: Blockly.WorkspaceSvg, parsed: Block[]) => {
    const start = workspace.getTopBlocks(false).find(block => block.type === 'sb_start');
    if (!start) throw new Error('This workspace has no proof to insert into.');
    let anchor: Blockly.Block = start;
    const scoped = proofContextRef.current;
    if (scoped && !scoped.disposed && scoped.getRootBlock().type === 'sb_start') anchor = scoped;
    else while (anchor.getNextBlock()) anchor = anchor.getNextBlock()!;
    spliceAfter(workspace, anchor, parsed, puzzle);
    callbacksRef.current.onChange(workspaceProof(workspace, puzzle));
    saveWorkspace(workspace);
  }, [puzzle, saveWorkspace]);

  useEffect(() => {
    clipboardContext = {
      puzzle,
      insert: parsed => {
        const workspace = workspaceRef.current;
        if (workspace) insertParsed(workspace, parsed);
      },
    };
    return () => { clipboardContext = null; };
  }, [puzzle, insertParsed]);

  const reportSelection = useCallback((selected: Blockly.Block | null, fromSelectEvent = false) => {
    // Blockly clears its selection from a document-level pointer handler before
    // a board click or external hypothesis drag arrives. Keep the selected block
    // through that transient deselection so cell picking keeps working.
    const transientDeselection = selected === null;
    if (!selected && selectedRef.current) selected = selectedRef.current;
    selectedRef.current = selected;
    // Selection no longer decides the scope; see `commitScope`.
    const proof = proofContextRef.current;
    const picking = !!selected && CELL_PICKING_TYPES.has(selected.type);
    const cells = selected && (selected.type === 'sb_clique' || selected.type === 'sb_at_least_zero' || selected.type === 'sb_at_most' || selected.type === 'sb_bound' || selected.type === 'sb_count')
      ? cellsFromText(selected.getFieldValue('CELLS'), puzzle)
      : selected && (selected.type === 'sb_is_star' || selected.type === 'sb_is_elim')
        ? [Number(selected.getFieldValue('CELL'))]
        : [];
    const hypothesis = factExpression(selected, puzzle);
    // A replayed selection (transient deselection, post-edit re-report) is not a new pick.
    const startedPicking = fromSelectEvent && !transientDeselection && picking;
    callbacksRef.current.onSelection(proof?.id ?? null, picking, cells, hypothesis, startedPicking);
  }, [puzzle]);

  useImperativeHandle(ref, () => ({
    clearProof() {
      const workspace = workspaceRef.current;
      if (!workspace) return;
      Blockly.Events.disable();
      try {
        workspace.clear();
        addStartBlock(workspace);
      } finally {
        Blockly.Events.enable();
      }
      selectedRef.current = null;
      proofContextRef.current = null;
      callbacksRef.current.onSelection(null, false, [], null, false);
      callbacksRef.current.onChange([]);
      saveWorkspace(workspace);
    },
    resetScope() {
      proofContextRef.current = null;
      reportSelection(null);
    },
    stopPicking() {
      const workspace = workspaceRef.current;
      const selected = selectedRef.current;
      if (!workspace || !selected || !CELL_PICKING_TYPES.has(selected.type)) return;
      // Forget the pick block so a later transient deselection cannot replay it.
      selectedRef.current = null;
      const current = Blockly.common.getSelected();
      if (current instanceof Blockly.BlockSvg && current === selected) Blockly.getFocusManager().focusNode(workspace);
      reportSelection(null);
    },
    async copyProof() {
      const workspace = workspaceRef.current;
      if (!workspace) return;
      await navigator.clipboard.writeText(JSON.stringify(saveWorkspace(workspace), null, 2));
    },
    async pasteProof() {
      const workspace = workspaceRef.current;
      if (!workspace) return;
      const text = await navigator.clipboard.readText();
      let saved: { puzzle?: string; workspace?: object };
      try {
        saved = JSON.parse(text);
      } catch {
        throw new Error('The clipboard does not contain valid proof data.');
      }
      loadWorkspace(workspace, saved);
    },
    /**
     * Splice a fragment in after the scoped step, or onto the end of the proof when
     * nothing is scoped. Unlike `pasteProofText` this keeps what is already there, which
     * is what makes a fragment from someone else usable.
     */
    async insertProofText() {
      const workspace = workspaceRef.current;
      if (!workspace) return;
      const parsed = parseProof(await navigator.clipboard.readText(), puzzle);
      if (parsed.length === 0) throw new Error('That text contains no proof statements.');
      insertParsed(workspace, parsed);
    },
    async copyProofText() {
      const workspace = workspaceRef.current;
      if (!workspace) return;
      const currentBlocks = workspaceProof(workspace, puzzle);
      await navigator.clipboard.writeText(printProof(currentBlocks, puzzle, results));
    },
    async pasteProofText() {
      const workspace = workspaceRef.current;
      if (!workspace) return;
      const text = await navigator.clipboard.readText();
      const parsed = parseProof(text, puzzle); // throws with a readable message on bad syntax
      Blockly.Events.disable();
      try {
        workspace.clear();
        addStartBlock(workspace);
        const start = workspace.getTopBlocks(false).find(block => block.type === 'sb_start');
        const first = buildSequence(workspace, parsed, puzzle);
        if (start?.nextConnection && first?.previousConnection) start.nextConnection.connect(first.previousConnection);
      } finally {
        Blockly.Events.enable();
      }
      selectedRef.current = null;
      proofContextRef.current = null;
      callbacksRef.current.onSelection(null, false, [], null, false);
      callbacksRef.current.onChange(workspaceProof(workspace, puzzle));
      saveWorkspace(workspace);
    },
    editSelectedCell(cell: number) {
      const block = selectedRef.current;
      if (!block) return;
      if (block.type === 'sb_is_star' || block.type === 'sb_is_elim') {
        block.setFieldValue(String(cell), 'CELL');
      } else if (block.type === 'sb_clique' || block.type === 'sb_at_least_zero' || block.type === 'sb_at_most' || block.type === 'sb_bound' || block.type === 'sb_count') {
        const cells = cellsFromText(block.getFieldValue('CELLS'), puzzle);
        const next = cells.includes(cell) ? cells.filter(value => value !== cell) : [...cells, cell].sort((a, b) => a - b);
        block.setFieldValue(cellsText(next, puzzle), 'CELLS');
      }
      if (block instanceof Blockly.BlockSvg) Blockly.common.setSelected(block);
      reportSelection(block);
    },
    dropHypothesis(factId: string, clientX: number, clientY: number) {
      const workspace = workspaceRef.current;
      if (!workspace || !fallbackFacts.some(fact => fact.id === factId)) return;

      const factBlock = workspace.newBlock('sb_fact');
      factBlock.setFieldValue(factId, 'FACT');
      factBlock.initSvg();
      factBlock.render();

      const point = Blockly.utils.svgMath.screenToWsCoordinates(
        workspace,
        new Blockly.utils.Coordinate(clientX, clientY),
      );
      const bounds = factBlock.getBoundingRectangle();
      factBlock.moveBy(point.x - (bounds.right - bounds.left) / 2, point.y - (bounds.bottom - bounds.top) / 2);

      let nearest: Blockly.Connection | null = null;
      let nearestDistance = 90;
      for (const block of workspace.getAllBlocks(false)) {
        if (block === factBlock) continue;
        for (const input of block.inputList) {
          const connection = input.connection;
          if (!connection || connection.targetConnection || !connection.getCheck()?.includes('Hypothesis')) continue;
          const distance = Math.hypot(connection.x - point.x, connection.y - point.y);
          if (distance < nearestDistance) {
            nearest = connection;
            nearestDistance = distance;
          }
        }
      }
      if (nearest && factBlock.outputConnection) factBlock.outputConnection.connect(nearest);
      Blockly.common.setSelected(factBlock);
      reportSelection(factBlock);
    },
  }));

  useLayoutEffect(() => {
    registerBlocks();
    registerContextMenu();
    registerPasteText();
    if (!hostRef.current) return;
    const workspace = Blockly.inject(hostRef.current, {
      toolbox: makeToolbox(initialFactsRef.current),
      toolboxPosition: 'end',
      renderer: STAR_BATTLE_RENDERER,
      trashcan: true,
      move: { scrollbars: true, drag: true, wheel: true },
      // Blockly's own zoom control is positioned in the corner opposite the toolbox
      // (governed internally, not configurable) and its icons don't reliably contrast
      // against a dark workspace. We render our own instead — see the zoom-controls div.
      zoom: { controls: false, wheel: true, startScale: START_SCALE, maxScale: 1.4, minScale: 0.45, scaleSpeed: 1.1 },
      grid: { spacing: 24, length: 3, colour: '#d8d5df', snap: false },
    });
    workspaceRef.current = workspace;
    // The 'end'-positioned flyout toolbox is a permanently-open panel occupying the
    // same right edge as our zoom controls; its width isn't fixed (it depends on the
    // widest block label), so pin the controls just to its left rather than a fixed
    // right offset, recomputing whenever the workspace (and therefore the flyout) resizes.
    const positionZoomControls = () => {
      const flyoutWidth = workspace.getFlyout()?.getWidth() ?? 0;
      if (zoomControlsRef.current) zoomControlsRef.current.style.right = `${flyoutWidth + 10}px`;
    };
    positionZoomControls();
    const zoomControlsResizeObserver = new ResizeObserver(positionZoomControls);
    zoomControlsResizeObserver.observe(hostRef.current);
    const boardPane = document.getElementById('content-board');
    const boardDeleteArea = boardPane ? new BoardDeleteArea(boardPane) : null;
    if (boardDeleteArea) {
      workspace.getComponentManager().addComponent({
        component: boardDeleteArea,
        capabilities: [
          Blockly.ComponentManager.Capability.DRAG_TARGET,
          Blockly.ComponentManager.Capability.DELETE_AREA,
        ],
        weight: Blockly.ComponentManager.ComponentWeight.TRASHCAN_WEIGHT,
      });
    }
    const rawSaved = window.localStorage.getItem(storageKey);
    if (rawSaved) {
      try {
        loadWorkspace(workspace, JSON.parse(rawSaved));
      } catch (error) {
        console.warn('Could not restore saved Star Battle proof:', error);
        workspace.clear();
        addStartBlock(workspace);
      }
    } else {
      addStartBlock(workspace);
    }
    let proofUpdateTimer: ReturnType<typeof setTimeout> | null = null;
    let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
    const publishProof = () => {
      proofUpdateTimer = null;
      // Resolve selection once after Blockly's create/move event group settles.
      // During a flyout drag, earlier events may still point at its template.
      const selected = Blockly.common.getSelected();
      if (selected instanceof Blockly.BlockSvg && selected.workspace === workspace) reportSelection(selected);
      callbacksRef.current.onChange(workspaceProof(workspace, puzzle));
    };
    const scheduleProofUpdate = () => {
      if (proofUpdateTimer !== null) clearTimeout(proofUpdateTimer);
      proofUpdateTimer = setTimeout(publishProof, PROOF_UPDATE_DELAY_MS);
    };
    const scheduleAutosave = () => {
      if (autosaveTimer !== null) clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(() => {
        autosaveTimer = null;
        saveWorkspace(workspace);
      }, AUTOSAVE_DELAY_MS);
    };
    // Scope moves only when a proof block is clicked: a mouse selection inside
    // the workspace becomes a candidate, a drag cancels it, and releasing the
    // pointer commits it if the block's step is attached to the proof. Field
    // clicks select the block without a Blockly click event, so the pointer
    // release, not the click event, is what commits. Programmatic selections
    // (picking a board cell, dropping a hypothesis) happen outside a press.
    let pointerDownInWorkspace = false;
    let pendingScope: Blockly.Block | null = null;
    const commitScope = () => {
      const step = enclosingStep(pendingScope);
      pendingScope = null;
      pointerDownInWorkspace = false;
      if (!step || step.getRootBlock().type !== 'sb_start') return;
      proofContextRef.current = step;
      reportSelection(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      pointerDownInWorkspace = event.target instanceof Node && hostRef.current?.contains(event.target) === true;
      pendingScope = null;
    };
    // Blockly stops pointerup from propagating, so listen in the capture phase.
    // That runs before Blockly handles the release and queues its events (the
    // selection, a drag start) on a 0 ms timer; committing two ticks later lets
    // them land first, and the press stays open until the commit.
    const onPointerUp = () => {
      if (pointerDownInWorkspace) setTimeout(() => setTimeout(commitScope, 0), 0);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerUp, true);
    const followScope = (event: Blockly.Events.Abstract) => {
      if (event.type === Blockly.Events.SELECTED) {
        const selectedId = (event as Blockly.Events.Selected).newElementId;
        if (pointerDownInWorkspace && selectedId) pendingScope = workspace.getBlockById(selectedId);
      } else if (event.type === Blockly.Events.BLOCK_DRAG && (event as Blockly.Events.BlockDrag).isStart) {
        pendingScope = null;
      } else if (event.type === Blockly.Events.CLICK && (event as Blockly.Events.Click).targetType === 'workspace') {
        pendingScope = null;
        callbacksRef.current.onNeutralClick();
      }
    };
    // While a define's name is cleared mid-edit, its references stay on the
    // last real name so the next keystroke can carry them over.
    const lastDefineNames = new WeakMap<Blockly.Block, string>();
    const followDefineRename = (change: Blockly.Events.BlockChange) => {
      const define = change.blockId ? workspace.getBlockById(change.blockId) : null;
      if (define?.type !== 'sb_define' || change.element !== 'field' || change.name !== 'NAME') return;
      const from = String(change.oldValue ?? '').trim() || lastDefineNames.get(define) || '';
      const to = String(change.newValue ?? '').trim();
      if (!to) {
        if (from) lastDefineNames.set(define, from);
        return;
      }
      lastDefineNames.delete(define);
      if (!from || from === to) return;
      const group = Blockly.Events.getGroup();
      Blockly.Events.setGroup(change.group || true);
      try {
        renameReferences(define.getNextBlock(), from, to);
      } finally {
        Blockly.Events.setGroup(group);
      }
    };
    const listener = (event: Blockly.Events.Abstract) => {
      followScope(event);
      if (event.type === Blockly.Events.BLOCK_CHANGE) followDefineRename(event as Blockly.Events.BlockChange);
      if (event.type === Blockly.Events.SELECTED) {
        const selectedId = (event as Blockly.Events.Selected).newElementId;
        reportSelection(selectedId ? workspace.getBlockById(selectedId) : null, true);
      }
      if (PROOF_EVENT_TYPES.has(event.type)) {
        scheduleProofUpdate();
        scheduleAutosave();
      }
    };
    workspace.addChangeListener(listener);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      if (proofUpdateTimer !== null) clearTimeout(proofUpdateTimer);
      if (autosaveTimer !== null) {
        clearTimeout(autosaveTimer);
        saveWorkspace(workspace);
      }
      boardPane?.classList.remove('block-delete-target');
      zoomControlsResizeObserver.disconnect();
      workspace.removeChangeListener(listener);
      workspace.dispose();
      workspaceRef.current = null;
    };
  }, [addStartBlock, loadWorkspace, puzzle, reportSelection, saveWorkspace, storageKey]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const currentBlocks = new Set<string>();
    for (const block of workspace.getAllBlocks(false)) {
      currentBlocks.add(block.id);
      const result = results.get(block.id);
      // A `sorry` always carries its warning: it is valid, but the proof is not finished,
      // and that should be visible on the block rather than only in the banner.
      const warning = result?.status === 'error'
        ? result.error ?? 'This step is invalid'
        : block.type === 'sb_sorry'
          ? 'Admitted without proof — replace this to finish the proof.'
          : null;
      if (warningTextRef.current.get(block.id) !== warning) {
        block.setWarningText(warning, 'proof');
        warningTextRef.current.set(block.id, warning);
      }
    }
    for (const id of warningTextRef.current.keys()) {
      if (!currentBlocks.has(id)) warningTextRef.current.delete(id);
    }
  }, [results]);

  useEffect(() => {
    workspaceRef.current?.updateToolbox(makeToolbox(toolboxFactsRef.current));
  }, [toolboxFactsKey]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    for (const block of workspace.getAllBlocks(false)) {
      if (block.type !== 'sb_fact') continue;
      const field = block.getField('FACT');
      if (!(field instanceof Blockly.FieldDropdown)) continue;
      const text = field.getText();
      const previousText = factTextRef.current.get(field);
      factTextRef.current.set(field, text);
      if (previousText !== undefined && previousText !== text) field.forceRerender();
    }
  }, [results, toolboxFactsKey]);

  return (
    <>
      <div className="blockly-host" ref={hostRef} />
      <div className="zoom-controls" ref={zoomControlsRef}>
        <button
          type="button"
          title="Zoom in"
          onClick={() => workspaceRef.current?.zoomCenter(1)}
        >+</button>
        <button
          type="button"
          title="Zoom out"
          onClick={() => workspaceRef.current?.zoomCenter(-1)}
        >−</button>
        <button
          type="button"
          title="Reset zoom"
          onClick={() => {
            const workspace = workspaceRef.current;
            if (!workspace) return;
            workspace.setScale(START_SCALE);
            workspace.scrollCenter();
          }}
        >⌾</button>
      </div>
    </>
  );
});
