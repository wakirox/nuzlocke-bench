// Closed patches of a cave's lower floor: drawn as rock on a whole map, kept everywhere else.

import { describe, expect, it } from "vitest";
import { renderView, sealedLowerFloor, type OverworldView } from "../../src/bridge/overworld";

// Tile 5 is the lower floor (as lowerCaveFloor says), tile 9 the upper floor; a step between 5 and 9 is a cliff.
const cliff = (a: number, b: number) => (a === 5 && b === 9) || (a === 9 && b === 5);
function view(rows: string[], tiles: number[][], whole = true): OverworldView {
  const grid = rows.map((r) => r.split(""));
  const pr = grid.findIndex((r) => r.includes("@"));
  return {
    grid, tiles, originX: 0, originY: 0, pc: grid[pr].indexOf("@"), pr,
    stepBlocked: cliff, lowerFloor: (t: number) => t === 5,
    ...(whole ? { beyond: () => "#" } : {}),
  } as OverworldView;
}
const rows = (text: string) => text.split("\n").filter((l) => /^y/.test(l)).map((l) => l.slice(5).trim());

describe("closed patches of a cave's lower floor", () => {
  // A strip of lower floor along the wall (x1), cut off from the upper floor by a cliff edge.
  const grid = ["#.#..", "#.#@.", "#.#.."];
  const tiles = [[1, 5, 1, 9, 9], [1, 5, 1, 9, 9], [1, 5, 1, 9, 9]];

  it("draws a patch closed by rock and cliffs as rock on the whole map", () => {
    expect(rows(renderView(view(grid, tiles)))).toEqual(["#  #  #  .  .", "#  #  #  @  .", "#  #  #  .  ."]);
  });

  it("keeps a patch a player can step onto (no cliff between it and the upper floor)", () => {
    const g = ["#.#..", "#..@.", "#.#.."];
    const t = [[1, 5, 1, 9, 9], [1, 5, 5, 9, 9], [1, 5, 1, 9, 9]];  // (2,1) lower floor too, then a cliff to @: closed
    expect(sealedLowerFloor(view(g, t)).size).toBe(4);
    const t2 = [[1, 5, 1, 9, 9], [1, 5, 7, 9, 9], [1, 5, 1, 9, 9]];  // (2,1) is plain floor (tile 7): no cliff, a way in
    expect(sealedLowerFloor(view(g, t2)).size).toBe(0);
  });

  it("keeps a patch with a ladder or a person beside it", () => {
    const g = ["#.#..", "#D#@.", "#.#.."];
    expect(sealedLowerFloor(view(g, tiles)).size).toBe(0);
    const p = ["#.#..", "#N#@.", "#.#.."];
    expect(sealedLowerFloor(view(p, tiles)).size).toBe(0);
  });

  it("leaves a screen's view alone: the patch may go on past its edge", () => {
    expect(sealedLowerFloor(view(grid, tiles, false)).size).toBe(0);
    expect(rows(renderView(view(grid, tiles, false)))[0]).toBe("#  ,  #  .  .");
  });

  it("drops the sealed squares' cliff edges from the edges list", () => {
    const g = ["#....", "#..@.", "#...."];
    const t = [[1, 5, 9, 9, 9], [1, 5, 9, 9, 9], [1, 5, 9, 9, 9]];  // lower strip at x1, cliff to x2
    expect(renderView(view(g, t, false))).toMatch(/x1\|x2 at y0–2/);  // a screen's view still lists the edge
    const text = renderView(view(g, t));
    expect(rows(text)[0]).toBe("#  #  .  .  .");
    expect(text).not.toMatch(/x1\|x2/);
  });
});
