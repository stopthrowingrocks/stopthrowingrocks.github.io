// What a page refresh does to a stored proof.
//
// The proof lives in localStorage as Blockly's own serialization and is loaded back into a
// fresh workspace. A dropdown whose options are generated — `use`, which lists the
// suppositions in scope — is loaded before anything has evaluated the proof, so the list is
// empty at that moment. Blockly drops a dropdown value that is not among the current
// options, which is how a reload could quietly empty every `use` in a proof.
//
// Headless: these are core workspaces with no SVG, which is all the serialization needs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Blockly from 'blockly';
import { registerBlocks } from '../src/BlocklyProof.tsx';

registerBlocks();

/** A stored proof, shaped as Blockly stores one. */
const saved = (blocks: object[]) => ({
  blocks: { languageVersion: 0, blocks },
});

function reload(stored: object): Blockly.Workspace {
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(stored, workspace);
  return workspace;
}

test('a stored `use` keeps the supposition it names', () => {
  const workspace = reload(saved([
    {
      type: 'sb_suppose',
      fields: { NAME: 'S' },
      inputs: { BODY: { block: { type: 'sb_use', fields: { NAME: 'S' } } } },
    },
  ]));
  const use = workspace.getBlocksByType('sb_use', false)[0];
  assert.ok(use, 'the use block is restored');
  assert.equal(use.getFieldValue('NAME'), 'S', 'and it still points at S');
});

test('a `use` naming a supposition that no longer exists keeps the name too', () => {
  // Better a step the engine can report as unavailable than a silently blank one: the name
  // is the only record of what the proof meant, and renaming a suppose should break loudly.
  const workspace = reload(saved([{ type: 'sb_use', fields: { NAME: 'gone' } }]));
  assert.equal(workspace.getBlocksByType('sb_use', false)[0].getFieldValue('NAME'), 'gone');
});

test('a stored fact reference keeps the name it points at', () => {
  // The same hazard, fixed earlier for facts: `define`d names do not exist until the proof
  // has been evaluated either. Both dropdowns now share one field class, so this is what
  // stops the two from drifting apart again.
  const workspace = reload(saved([{ type: 'sb_fact', fields: { FACT: 'define:abc' } }]));
  assert.equal(workspace.getBlocksByType('sb_fact', false)[0].getFieldValue('FACT'), 'define:abc');
});
