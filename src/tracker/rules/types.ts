// A ruleset's rules engine plugs into the Tracker through these hooks. The Tracker does what
// every ruleset shares — diffing polls, battle start/end, catches and gifts, wipes and victory,
// Pokémon Center heals, the event log — and calls the ruleset at fixed points of each poll.

import type { GameState } from "../../games/types";
import type { Catch } from "../tracker";

/** Item id → change in count since the last poll. */
export type ItemDeltas = Map<number, number>;

export interface RuleModule {
  /** First poll of a started game. */
  begin?(s: GameState): void;
  /** A battle just started (p.battle 0 → s.battle > 0). */
  battleStart?(s: GameState, p: GameState): void;
  /** Every poll, right after battle start/end bookkeeping. */
  battlePoll?(s: GameState, p: GameState): void;
  /** The text box changed. */
  boxText?(s: GameState, text: string): void;
  /** Every poll, for the party: moves learned, who battles, faints. */
  partyPoll?(s: GameState, p: GameState): void;
  /** In battle, the player's last-used move changed to `move`. */
  moveUsed?(s: GameState, p: GameState, move: number): void;
  /** After the wipe check (a wipe ends the poll before this); may end the run. */
  afterWipeCheck?(s: GameState, p: GameState): void;
  /** A catch or gift was recorded. */
  caught(s: GameState, p: GameState, c: Catch): void;
  /** Every poll, after catches are counted. */
  afterCatches?(s: GameState, p: GameState): void;
  /** Bag changes since the last poll. */
  items?(s: GameState, p: GameState, deltas: ItemDeltas): void;
  /** Last, every poll. */
  end?(s: GameState, p: GameState): void;

  /** Battle style Set is a rule (a violation if Shift), not just advice. */
  readonly setStyleRequired?: boolean;
}
