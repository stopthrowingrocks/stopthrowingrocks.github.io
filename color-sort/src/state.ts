import { Matrix, solve as solveMatrix } from "ml-matrix";
import { Level, levels, Item, RawVial, itemColors } from "./levels.js";

export type ItemGroup = {
  item: Item,
  count: number,
};
// Add/remove from the start
export type Vial = {
  itemGroups: ItemGroup[],
  height: number,
};
export type GameState = {
  vials: Vial[]
  static: {
    vial_height: number
    num_colors: number
    empty_vials: number
  }
};

export function winCondition(state: GameState): boolean {
  for (let i = 0; i < state.vials.length; i++) {
    if (state.vials[i].itemGroups.length === 1) {
      if (state.vials[i].itemGroups[0].count === state.static.vial_height) {
        continue;
      } else {
        return false;
      }
    } else {
      if (state.vials[i].itemGroups.length === 0) {
        continue;
      } else {
        return false;
      }
    }
  }
  return true;
}

function copyVial(vial: Vial): Vial {
  return {
    itemGroups: vial.itemGroups.map(itemGroup => ({item: itemGroup.item, count: itemGroup.count})),
    height: vial.height,
  };
}

function copyStateWithNewVials(state: GameState, newVials: {idx: number, vial: Vial}[]): GameState {
  return {
    vials: state.vials.map((vial, idx) => {
      const newVial_idx = newVials.findIndex(obj => obj.idx === idx);
      if (newVial_idx === -1) return vial;
      else return newVials[newVial_idx].vial;
    }),
    static: state.static,
  };
}

/**
 * Converts an abstract level description into a playable GameState
 */
export function levelToState(level: Level, addEmpty: boolean = true): GameState {
  const vials: Vial[] = [];
  for (let i = 0; i < level.rawvials.length; i ++) {
    let item: Item | null = null;
    let count: number = 0;
    const vial: Vial = {
      itemGroups: [],
      height: level.rawvials[i].length,
    };
    if (level.rawvials[i].length > level.vial_height) {
      console.error(`Vial ${i} height exceeds maximum vial height ${level.vial_height}`);
    }
    for (let j = 0; j < level.rawvials[i].length; j ++) {
      if (item === level.rawvials[i][j]) {
        count ++;
      } else {
        if (item !== null) {
          // Commit itemGroup
          vial.itemGroups.push({item, count});
        }
        item = level.rawvials[i][j];
        count = 1;
      }
    }
    // Commit itemGroup
    if (item !== null) vial.itemGroups.push({item, count});
    vials.push(vial);
  }
  if (addEmpty) {
    for (let i = 0; i < level.empty_vials; i ++) {
      vials.push({itemGroups: [], height: 0});
    }
  }
  return {vials, static: {
    vial_height: level.vial_height,
    num_colors: level.num_colors,
    empty_vials: level.empty_vials,
  }};
}

function stateToRawVials(state: GameState): RawVial[] {
  return state.vials.map(vial => vial.itemGroups.flatMap(itemGroup =>
    Array.from({length: itemGroup.count}, () => itemGroup.item))
  );
}

const nt_s: unique symbol = Symbol("nt_s");
export type nt<name extends string> = {[nt_s]: {[n in name]: void}}
export function declare<name extends string, v>(v: v): v & nt<name> {
  return v as v & nt<name>;
}
export type StateId = string & nt<"state">
export function getStateId(state: GameState): StateId {
  const rawvials = stateToRawVials(state);
  rawvials.sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  });
  return declare<"state", string>(rawvials.map(rawvial => rawvial.join(",")).join(";"));
}
export function stateIdToState(id: StateId, stat: GameState["static"]): GameState {
  return levelToState({
    rawvials: id.split(";").filter(s => s !== "").map(s => s.split(",").map(Number)),
    ...stat,
  }, false);
}
export function getWinningStateId(stat: GameState["static"]) {
  const vials: Vial[] = [
    ...Array.from({length: stat.num_colors}, (_, i) => ({
      itemGroups: [{
        item: i,
        count: stat.vial_height
      }],
      height: stat.vial_height,
    })),
    ...Array.from({length: stat.empty_vials}, () => ({itemGroups: [], height: 0})),
  ];
  return getStateId({vials, static: stat});
}

export type Move = {
  vialIdx_src: number,
  vialIdx_dst: number,
};
export function getValidMoves(state: GameState): Move[] {
  // Plan of attack: First sort all vials by color of top, including empty
  const emptyVialIdxs: number[] = [];
  const vialIdxss: number[][] = Array.from({length: state.static.num_colors}, () => []);
  for (let i = 0; i < state.vials.length; i ++) {
    const vial = state.vials[i];
    if (vial.height === 0) {
      emptyVialIdxs.push(i);
    } else {
      vialIdxss[vial.itemGroups[0].item].push(i);
    }
  }

  const validMoves: Move[] = [];
  for (let color = 0; color < state.static.num_colors; color ++) {
    const vialIdxs = vialIdxss[color];
    for (let src_i = 0; src_i < vialIdxs.length; src_i ++) {
      for (let dst_i = 0; dst_i < vialIdxs.length; dst_i ++) {
        const vialIdx_src = vialIdxs[src_i];
        const vialIdx_dst = vialIdxs[dst_i];
        if (vialIdx_src === vialIdx_dst) continue;

        // For each vial, if it is already at the maximum height it cannot be a valid destination target
        if (state.vials[vialIdx_dst].height === state.static.vial_height) continue;

        validMoves.push({vialIdx_src, vialIdx_dst});
      }
    }
  }

  // If there is at least one empty vial, pick the first one and generate all moves into it from unsorted vials
  if (emptyVialIdxs.length > 0) {
    for (let color = 0; color < state.static.num_colors; color ++) {
      const vialIdxs = vialIdxss[color];
      for (let src_i = 0; src_i < vialIdxs.length; src_i ++) {
        const vialIdx_src = vialIdxs[src_i];

        // If the vial is already sorted, there's no value in moving it
        if (state.vials[vialIdx_src].itemGroups.length === 1) continue;

        validMoves.push({vialIdx_src, vialIdx_dst: emptyVialIdxs[0]});
      }
    }
  }

  return validMoves;
}

export type MovedState = {
  move: Move
  state: GameState
  id: StateId
};
export function getValidMovedStates(state: GameState): MovedState[] {
  const validMoves = getValidMoves(state);
  return validMoves.map((move: Move): MovedState => {
    const moveResult = calcMove(state, move);
    if (moveResult.type === "error") throw new Error(moveResult.message);
    const {newState} = moveResult;
    const newStateId = getStateId(newState);
    return {
      move,
      state: newState,
      id: newStateId,
    };
  });
}

export type MoveResult = {
  type: "success",
  newState: GameState,
} | {
  type: "error",
  message: string,
};
export function calcMove(state: GameState, move: Move): MoveResult {
  const vial_src = state.vials[move.vialIdx_src];
  const vial_dst = state.vials[move.vialIdx_dst];
  if (vial_src.height === 0) {
    return {
      type: "error",
      message: "Nothing to move!",
    };
  }
  const move_itemGroup = vial_src.itemGroups[0];
  const dst_empty = vial_dst.height === 0;
  if (!dst_empty && vial_dst.itemGroups[0].item !== move_itemGroup.item) {
    return {
      type: "error",
      message: "Wrong color on top of the new vial!",
    };
  }
  const items_to_move = Math.min(state.static.vial_height - vial_dst.height, move_itemGroup.count);
  if (items_to_move === 0) {
    return {
      type: "error",
      message: "No space in vial!",
    };
  }

  const new_vial_src = copyVial(vial_src);
  new_vial_src.height -= items_to_move;
  new_vial_src.itemGroups[0].count -= items_to_move;
  if (new_vial_src.itemGroups[0].count === 0) {
    new_vial_src.itemGroups.shift();
  }

  const new_vial_dst = copyVial(vial_dst);
  new_vial_dst.height += items_to_move;
  if (dst_empty) {
    new_vial_dst.itemGroups = [{
      item: move_itemGroup.item,
      count: items_to_move,
    }];
  } else {
    new_vial_dst.itemGroups[0] = {
      item: move_itemGroup.item,
      count: new_vial_dst.itemGroups[0].count + items_to_move,
    }
  }

  const newState = copyStateWithNewVials(state, [
    {
      idx: move.vialIdx_src,
      vial: new_vial_src,
    },
    {
      idx: move.vialIdx_dst,
      vial: new_vial_dst,
    },
  ]);
  return {
    type: "success",
    newState,
  };
}

export type TaggedNode = {
  state: GameState
  distanceFromStart: number
  distanceFromWin: number | undefined // If unwinnable, this is null
  parents: {id: StateId, move: Move}[]
  children: {id: StateId, move: Move}[]
};
export type TaggedMap = Map<StateId, TaggedNode>;
export function createTaggedMap(originalState: GameState): TaggedMap {
  const originalStateId = getStateId(originalState);
  const tempArr: {
    id: StateId
    state: GameState
    distanceFromStart: number
    children: {id: StateId, move: Move}[]
  }[] = [];
  const parentsMap: Map<StateId, {id: StateId, move: Move}[]> = new Map();
  const temp_parents_nodes = [{
    id: originalStateId,
    state: originalState,
    distanceFromStart: 0,
  }];
  type temp_parents_node = typeof temp_parents_nodes[number];

  // Compute the parents map
  let maybe_node: typeof temp_parents_nodes[number] | undefined;
  while ((maybe_node = temp_parents_nodes.shift())) {
    const node = maybe_node;
    const validMovedStates = getValidMovedStates(node.state);

    // This will come in handy later
    tempArr.push({
      id: node.id,
      state: node.state,
      distanceFromStart: node.distanceFromStart,
      children: validMovedStates.map(movedState => ({
        id: movedState.id,
        move: movedState.move,
      }))
    });

    temp_parents_nodes.push(...validMovedStates.flatMap((movedState: MovedState): temp_parents_node[] => {
      const parents = parentsMap.get(movedState.id);
      if (parents !== undefined) {
        parents.push({
          id: node.id,
          move: movedState.move,
        });
        return [];
      }
      parentsMap.set(movedState.id, [{
        id: node.id,
        move: movedState.move,
      }]);

      return [{
        state: movedState.state,
        id: movedState.id,
        distanceFromStart: node.distanceFromStart + 1,
      }];
    }));
  }

  // The frontier has now been exhausted
  // It is now time to compute which states are winnable

  const temp_bwnodes = [{
    id: getWinningStateId(originalState.static),
    distanceFromWin: 0,
  }];
  type temp_bwnode = typeof temp_bwnodes[number];
  const distanceFromWinMap: Map<string, number> = new Map();

  let maybe_bwnode: temp_bwnode | undefined;
  while ((maybe_bwnode = temp_bwnodes.shift())) {
    const bwnode = maybe_bwnode;
    if (distanceFromWinMap.has(bwnode.id)) continue;
    distanceFromWinMap.set(bwnode.id, bwnode.distanceFromWin);
    const parents = parentsMap.get(bwnode.id);
    if (parents !== undefined) {
      temp_bwnodes.push(...parents.map(parent => ({
        id: parent.id,
        distanceFromWin: bwnode.distanceFromWin + 1,
      })));
    }
  }

  // Sort tempArr from highest distanceFromStart to lowest
  // Maybe eventually a difficulty calculation would go here
  tempArr.sort((a, b) => b.distanceFromStart - a.distanceFromStart);
  const taggedMap: TaggedMap = new Map();
  for (let i = 0; i < tempArr.length; i++) {
    const {id, state, distanceFromStart, children} = tempArr[i];
    const distanceFromWin = distanceFromWinMap.get(id);
    taggedMap.set(id, {
      state,
      distanceFromStart,
      children,
      parents: parentsMap.get(id) || [],
      distanceFromWin,
    });
  }
  return taggedMap;
}

// Returns toposorted SCCs, with earlier SCCs first
export function get_SCCs(originalStateId: StateId, tm: TaggedMap): StateId[][] {
  const visited: Set<StateId> = new Set();
  const finishOrder: StateId[] = []; // This will have late nodes near the front
  const stack = [{
    id: originalStateId,
    nextChildIdx: 0,
    children: tm.get(originalStateId)?.children ?? [],
  }];
  visited.add(originalStateId);
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];

    if (frame.nextChildIdx < frame.children.length) {
      const childId = frame.children[frame.nextChildIdx].id;
      if (!visited.has(childId)) {
        visited.add(childId);
        stack.push({
          id: childId,
          nextChildIdx: 0,
          children: tm.get(childId)?.children ?? [],
        });
      }
      frame.nextChildIdx++;
    } else {
      // All children processed: this node "finishes" now
      stack.pop();
      finishOrder.push(frame.id);
    }
  }

  const visited2: Set<StateId> = new Set();
  const components: StateId[][] = [];
  for (let i = finishOrder.length - 1; i >= 0; i--) { // Start with the early nodes for reverse direction
    const startId = finishOrder[i];
    if (visited2.has(startId)) continue;
    visited2.add(startId);

    const comp: StateId[] = [];
    const stack: StateId[] = [startId];
    let maybe_id: StateId | undefined;
    while ((maybe_id = stack.pop())) {
      const id = maybe_id;
      comp.push(id);

      const parents = tm.get(id)?.parents ?? [];

      for (const { id: pid } of parents) {
        if (!visited2.has(pid)) { // This prevents you from including nodes in prior components
          visited2.add(pid);
          stack.push(pid);
        }
      }
    }

    components.push(comp);
  }

  return components;
}

type SuccessProbabilityMap = Map<StateId, number>;

/**
 * Compute success probabilities for all nodes in a directed graph with absorbing outcomes.
 *
 * Assumptions:
 *  - Exactly one winning node, identified by `winningStateId`.
 *  - That node has no children.
 *  - Any SCC that has no children and is not the winning SCC is losing.
 *  - Transitions are chosen uniformly at random among outgoing edges.
 *
 * Input:
 *  - tagged: graph representation (TaggedMap)
 *  - sccs: strongly connected components in topological order
 *  - winningStateId: the absorbing success state
 *
 * Output:
 *  - successProbabilityMap: Map<StateId, number> containing success probabilities
 */
export function computeSuccessProbabilities(
  tagged: TaggedMap,
  sccs: StateId[][],
  winningStateId: StateId
): SuccessProbabilityMap {
  const successProbabilityMap: SuccessProbabilityMap = new Map();

  // ------------------------------------------------------------
  // Step 1: Map each state → its SCC index
  // ------------------------------------------------------------
  const stateToScc = new Map<StateId, number>();
  for (let i = 0; i < sccs.length; i++) {
    for (const id of sccs[i]) stateToScc.set(id, i);
  }

  // ------------------------------------------------------------
  // Step 2: Compute sink SCC flags with Array.map
  // (A sink SCC has no outgoing edges to other SCCs)
  // ------------------------------------------------------------
  const isSink: boolean[] = sccs.map((component, i) => {
    for (const id of component) {
      const node = tagged.get(id)!;
      for (const { id: childId } of node.children) {
        const j = stateToScc.get(childId)!;
        if (j !== i) return false;
      }
    }
    return true;
  });

  // ------------------------------------------------------------
  // Step 3: Identify the winning SCC
  // ------------------------------------------------------------
  const winningScc = stateToScc.get(winningStateId)!;

  // ------------------------------------------------------------
  // Step 4: Process SCCs in reverse topological order
  // ------------------------------------------------------------
  for (let i = sccs.length - 1; i >= 0; i--) {
    const nodes = sccs[i];

    // Case 1: The winning SCC
    if (i === winningScc) {
      successProbabilityMap.set(winningStateId, 1);
      continue;
    }

    // Case 2: Sink SCC and not winning ⇒ losing
    if (isSink[i]) {
      for (const id of nodes) successProbabilityMap.set(id, 0);
      continue;
    }

    // ------------------------------------------------------------
    // Case 3: Internal SCC (non-sink, non-winning)
    // Solve (I - Q)p = b
    // ------------------------------------------------------------
    const m = nodes.length;
    if (m === 0) continue;

    const localIndex = new Map<StateId, number>();
    for (let k = 0; k < m; k++) localIndex.set(nodes[k], k);

    const Q = Matrix.zeros(m, m);
    const b = Matrix.zeros(m, 1);

    for (let row = 0; row < m; row++) {
      const id = nodes[row];
      const node = tagged.get(id)!;
      const outs = node.children;
      const deg = outs.length;
      if (deg === 0) continue;

      const pEdge = 1 / deg;

      for (const { id: childId } of outs) {
        const jScc = stateToScc.get(childId)!;
        if (jScc === i) {
          // Internal transition
          const col = localIndex.get(childId)!;
          Q.set(row, col, pEdge);
        } else {
          // External transition: use known probability
          const childProb = successProbabilityMap.get(childId);
          if (childProb !== undefined) {
            b.set(row, 0, b.get(row, 0) + pEdge * childProb);
          }
        }
      }
    }

    const IminusQ = Matrix.eye(m).sub(Q);
    const pVec = solveMatrix(IminusQ, b);

    for (let k = 0; k < m; k++) {
      successProbabilityMap.set(nodes[k], pVec.get(k, 0));
    }
  }

  return successProbabilityMap;
}

/**
 * Fisher-Yates (Knuth) Algorithm
 */
export function generateRandomPermutation(n: number) {
  const permutation = Array.from({ length: n }, (_, i) => i);

  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
  }

  return permutation;
}

export function estimateDifficulty(state: GameState, seen_ids: Set<string> = new Set()): {difficulty: number, success: boolean} {
  if (winCondition(state)) {
    return {
      success: true,
      difficulty: 0, // Whatever value we put here will always adjust the estimate by an equal amount
    };
  }
  const id = getStateId(state);
  if (seen_ids.has(id)) {
    // This must be a dead or recurrent node, it would've returned success if it could have
    return {
      success: false, // Make sure to backtrack here
      difficulty: 1, // We should still penalize the lookup
    };
  }
  seen_ids.add(id);
  const validMoves = getValidMoves(state);
  const permutation = generateRandomPermutation(validMoves.length);
  let difficulty = 1;
  for (let i = 0; i < permutation.length; i++) {
    const moveResult = calcMove(state, validMoves[permutation[i]]);
    if (moveResult.type === "error") throw new Error(moveResult.message);
    const {newState} = moveResult;
    const difficultyResult = estimateDifficulty(newState, seen_ids);
    difficulty += difficultyResult.difficulty;
    if (difficultyResult.success) {
      return {
        success: true,
        difficulty,
      };
    }
  }
  return {
    success: false,
    difficulty,
  };
}
