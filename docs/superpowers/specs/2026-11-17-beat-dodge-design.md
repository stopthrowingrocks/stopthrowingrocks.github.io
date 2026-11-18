# Beat Dodge — design

A rhythm dodging game. The player is a square on a 3×3 grid of spots and
dodges black squares that slide in from the screen edges. Hazards move on the
beat; the player moves on the off-beat. Spawns are generated so that **every**
survivable path the player could take always has a safe next move.

## Rules

### Space
- Grid of 3×3 cells, cell spacing 1. Cell centers at integer coordinates 0..2.
- Each cell spacing is divided into **N = 4** sub-units.
- A **hazard** is a 0.8 × 0.8 square centered in a row lane (moving left or
  right) or a column lane (moving up or down). Its center position along the
  lane is an integer number of sub-units. Each beat it advances +1 sub-unit.
- Hazards spawn just off-screen at the edge they enter from, in any of the 4
  directions and any of the 3 lanes of that axis, and are removed once fully
  off-screen on the far side.
- The **player** is a square of size `PLAYER_SIZE = 0.8` (tunable constant)
  drawn at its cell's center.

### Blocking
`B(t)` is the set of cells blocked at beat t. Cell c is in `B(t)` if some
hazard in c's lane has its center, along the lane axis, at distance strictly
less than `(0.8 + PLAYER_SIZE) / 2` from c's center. With the defaults
(threshold 0.8), a hazard blocks a given cell for about 1.6·N consecutive
beats, and blocks two neighbouring cells at once while it is between them.

Hazards snap to their new position on each beat (with a short visual tween
only), so the logic only ever sees beat positions.

### Timing and moves
- Hazards move on beats t = 0, 1, 2, …; the player acts on off-beats t + ½.
- On an off-beat the player either **stays** or **steps one cell**
  orthogonally, without leaving the grid.
- A move to cell b at t + ½ is **safe** if `b ∉ B(t) ∪ B(t+1)`. (The player
  occupies b from t + ½ to t + 1½.) This also rules out swapping past a
  hazard.
- **Input window:** a key press counts only if it lands within ±W of the
  off-beat, with W = 20% of the beat length (tunable). If several presses land
  in the window, the last one wins. A press outside every window, or no press,
  means stay.
- **Death:** the player dies at beat t if their cell is in `B(t)`. (A move into
  a cell in `B(t)` at t + ½ also kills them at once.) The score is the number of
  beats survived.

### Fairness invariant
Write a state as (cell, beat). From the player's current state, find every
state reachable by safe moves, considering only hazards that already exist,
out to the horizon H. H is the beat at which the last existing hazard leaves
the grid area. **Every reachable state before H must have at least one safe
move.**

A candidate spawn is accepted only if the invariant still holds with it
added. Why this is enough:
- Adding a hazard only adds blocked cells, so the reachable set can only
  shrink, and every state in it is checked.
- States at or past H have no existing hazards, so they are trivially fine.
  Later spawns are checked when they are proposed.
- So after every accepted spawn, the player's actual state has a safe move,
  and so does every state they could reach through safe moves. The player can
  only die by their own mistake, such as missing a window or stepping into a
  blocked cell.

The state space is 9 cells × about 5N beats, so the check is a cheap
breadth-first pass that runs every beat.

## Difficulty
- N stays fixed at 4.
- The BPM starts at 90 and rises gradually toward a cap of 160.
- The spawner makes K attempts per beat. K and the per-attempt spawn chance
  rise over time.
- Fairness is the hard limit on density, so the game stays survivable at every
  speed.

## Audio
Web Audio scheduling drives the clock, with a click on each beat and a softer
tick on each off-beat. All beat and window timing is measured against
`AudioContext.currentTime`.

## Structure
`content/beat-dodge/` is a new npm workspace (vanilla TypeScript, canvas,
Vite), set up like the other games. It is added to the root `package.json`
workspaces and has an `index.md` so Zola picks it up.

| Module | Responsibility |
|---|---|
| `src/model.ts` | Pure logic with no DOM: hazard type, `blocked(hazards, t)`, `safeMoves(cell, t, hazards)`, and advancing the game state by one beat. |
| `src/fairness.ts` | `isFair(playerState, hazards)`, the forward reachable-set check out to the horizon. |
| `src/spawner.ts` | Proposes random candidates (edge, lane, direction) each beat and accepts those that keep `isFair` true. Takes difficulty parameters and an injectable RNG. |
| `src/clock.ts` | Beat and off-beat scheduling on the audio clock, the metronome sounds, and judging key presses against the window. |
| `src/render.ts` | Canvas drawing of the grid, player, hazards (with tween), and score. |
| `src/main.ts` | Wiring, keyboard input (arrow keys), start, game over and restart. |

## Testing (Vitest)
- **Blocking geometry:** the threshold at its boundaries, a hazard between two
  cells blocking both, and lanes on other rows or columns being unaffected.
- **Safe moves:** the swap case is rejected, and edge cells don't offer moves
  off the grid.
- **Fairness unit cases:** a hand-built trap is rejected, and a near-trap with
  one escape is accepted.
- **Fuzz test:** run the spawner with seeded RNGs over thousands of beats. At
  each beat, walk the full set of states reachable by safe moves from the start
  and assert that none has zero safe moves. Also run random players who only
  pick safe moves and assert that they never die.

## Out of scope
Music tracks, leaderboards, mobile/touch controls, and settings UI. Tunables
are constants in code.
