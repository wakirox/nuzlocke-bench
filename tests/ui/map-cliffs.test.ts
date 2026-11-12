// The ledges a result lists, for drawing them on the model panel's map picture.

import { describe, expect, it } from "vitest";
import { cliffsOf, findGrid } from "../../src/ui/map-image";

describe("cliffsOf", () => {
  it("reads ranges and single squares on both axes", () => {
    expect(cliffsOf(["Cliff edges (both sides look walkable, but you can't step across): y8|y9 at x5–7; x27|x28 at y22."])).toEqual([
      { axis: "y", at: 8, from: 5, to: 7 },
      { axis: "x", at: 27, from: 22, to: 22 },
    ]);
  });

  it("is empty with no such line", () => {
    expect(cliffsOf(["Map:", "Screen: no text"])).toEqual([]);
  });

  it("comes with the grid, in the map's coordinates", () => {
    const grid = findGrid(["      1 1", "      0 1", "y  8  . .", "y  9  . @", "Cliff edges (x): y8|y9 at x10–11."]);
    expect(grid?.cliffs).toEqual([{ axis: "y", at: 8, from: 10, to: 11 }]);
    expect(grid?.x0).toBe(10);
  });
});
