// Ice (Crystal's "*"): step on it and you slide until something stops you.

import { describe, expect, it } from "vitest";
import { findPath, type OverworldView } from "../../src/bridge/overworld";

/** A view from rows of text, the player at "@". */
function view(rows: string[]): OverworldView {
  const grid = rows.map((r) => [...r]);
  const pr = grid.findIndex((r) => r.includes("@"));
  return { grid, originX: 0, originY: 0, pc: grid[pr].indexOf("@"), pr };
}

describe("ice", () => {
  it("slides to the floor past the ice, one press a square", () => {
    const v = view([
      "#######",
      "#@***.#",
      "#######",
    ]);
    expect(findPath(v, 5, 1, { avoidSight: false })?.dirs).toEqual(["right", "right", "right", "right"]);
  });

  it("can't stop in the middle of the ice", () => {
    const v = view([
      "#######",
      "#@***.#",
      "#######",
    ]);
    expect(findPath(v, 3, 1, { avoidSight: false })).toBeNull();
  });

  it("stops on the ice against a rock, and plans the turns that get round it", () => {
    // From @ sliding right stops at (3,1) against the rock; then down slides to the floor at (3,4).
    const v = view([
      "######",
      "#@**##",
      "##**.#",
      "##**##",
      "##..##",
      "######",
    ]);
    expect(findPath(v, 3, 4, { avoidSight: false })?.dirs).toEqual(["right", "right", "down", "down", "down"]);
  });
});
