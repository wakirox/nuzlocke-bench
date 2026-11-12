// The moves each foe has used in the current battle: all a player knows of its moves.

import type { GameState } from "../games/types";

export class FoeMoves {
  private seen = new Map<string, Set<number>>();

  private keyOf(e: NonNullable<GameState["enemy"]>): string {
    return `${e.species}:${e.level}`;
  }

  /** Call on every state: remembers what the foe just used, and forgets it all when the battle's over. */
  note(s: GameState): void {
    if (s.battle === 0 || !s.enemy) {
      this.seen.clear();
      return;
    }
    const used = s.enemyUsedMove;
    // The game can hold a move from an earlier foe for a moment: only this foe's own moves count.
    if (!used || !s.enemy.moves.includes(used)) return;
    const key = this.keyOf(s.enemy);
    const moves = this.seen.get(key) ?? new Set<number>();
    moves.add(used);
    this.seen.set(key, moves);
  }

  /** What this foe has shown so far. */
  movesOf(e: NonNullable<GameState["enemy"]>): number[] {
    const moves = this.seen.get(this.keyOf(e));
    return moves ? e.moves.filter((id) => moves.has(id)) : [];
  }
}
