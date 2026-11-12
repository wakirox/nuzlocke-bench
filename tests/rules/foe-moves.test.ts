// What a player knows of a foe's moves: only the ones it has used.

import { describe, expect, it } from "vitest";
import { FoeMoves } from "../../src/tracker/foe-moves";
import type { GameState } from "../../src/games/types";

const state = (battle: number, species: number, used: number, moves = [1, 2, 3, 0]) =>
  ({ battle, enemyUsedMove: used, enemy: { species, level: 10, moves } }) as unknown as GameState;
const foe = (species: number) => state(1, species, 0).enemy!;

describe("FoeMoves", () => {
  it("knows nothing before the foe has moved", () => {
    const f = new FoeMoves();
    f.note(state(1, 5, 0));
    expect(f.movesOf(foe(5))).toEqual([]);
  });

  it("adds each move as it's used, in the foe's own order", () => {
    const f = new FoeMoves();
    f.note(state(1, 5, 3));
    f.note(state(1, 5, 1));
    f.note(state(1, 5, 1));
    expect(f.movesOf(foe(5))).toEqual([1, 3]);
  });

  it("keeps each foe's moves apart, across a switch and back", () => {
    const f = new FoeMoves();
    f.note(state(2, 5, 1));
    f.note(state(2, 6, 2));
    expect(f.movesOf(foe(5))).toEqual([1]);
    expect(f.movesOf(foe(6))).toEqual([2]);
  });

  it("ignores a move the foe doesn't have, left from the last one", () => {
    const f = new FoeMoves();
    f.note(state(2, 6, 9));
    expect(f.movesOf(foe(6))).toEqual([]);
  });

  it("forgets everything when the battle ends", () => {
    const f = new FoeMoves();
    f.note(state(1, 5, 1));
    f.note({ battle: 0, enemy: null, enemyUsedMove: 0 } as unknown as GameState);
    expect(f.movesOf(foe(5))).toEqual([]);
  });
});
