// The ledges a result lists, for drawing them on the model panel's map picture.

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { compactGrids } from "../../mcp-server/format.mjs";
import { renderView } from "../../src/bridge/overworld";
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

  it("parses compact 5-square-block maps, expanding collapsed rows, bottom rulers and shorter Cliffs", () => {
    const lines = [
      "Map exits: up.",
      "       5     10",
      "y  1   #.@.. I.C",
      "y  2-4 #.... ...",
      "y  5   #S... .D.",
      "       5     10",
      "Cliffs: y2|3 x8–10; x7|8 y3–4.",
      "Points: I (10,1); C (12,1); S (6,5).",
    ];
    const grid = findGrid(lines)!;
    expect(grid.x0).toBe(5);
    expect(grid.ys).toEqual([1, 2, 3, 4, 5]);
    expect(grid.cells).toHaveLength(5);
    expect(grid.cells[0].join("")).toBe("#.@..I.C");
    expect(grid.cells[1].join("")).toBe("#.......");
    expect(grid.cells[3].join("")).toBe("#.......");
    expect(grid.cells[4].join("")).toBe("#S....D.");
    expect(grid.start).toBe(1);
    expect(grid.end).toBe(6); // includes the repeated bottom ruler, stops before Cliffs
    expect(grid.cliffs).toEqual([
      { axis: "y", at: 2, from: 8, to: 10 },
      { axis: "x", at: 7, from: 3, to: 4 },
    ]);

    // Screen crop whose first column isn't labelled directly (x=14 before 15) and negative x.
    const crop = findGrid(["         15    20", "y  4   # ..@.. ...."])!;
    expect(crop.x0).toBe(14);
    expect(crop.cells[0]).toHaveLength(10);
    const neg = findGrid(["       -2 0     5", "y-2--1 ## ..... ."])!;
    expect(neg.x0).toBe(-2);
    expect(neg.ys).toEqual([-2, -1]);

    // Tall routes with y >= 100 collapsed ranges (wider row-tag column) decode back losslessly.
    const route = Array.from({ length: 144 }, (_, r) => {
      if (r === 95) return [..."..@......."];
      if (r >= 96 && r <= 101) return [...'""""......'];
      if (r >= 102) return [...".........."];
      return [..."#........."];
    });
    const compact = compactGrids(renderView({ grid: route, originX: 14, originY: 0, pc: 2, pr: 95 }));
    const parsed = findGrid(compact.split("\n"))!;
    expect(parsed.x0).toBe(14);
    expect(parsed.ys).toEqual(Array.from({ length: 144 }, (_, y) => y));
    expect(parsed.cells).toEqual(route);
  });
});
