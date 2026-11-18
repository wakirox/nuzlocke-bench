// What the tools show in the dark tunnel: only what a player can see there.

import { describe, expect, it } from "vitest";
import { boxedSquares, litSquares, renderDarkView, type OverworldView } from "../../src/bridge/overworld";
import { hideCoords } from "../../src/bridge/summary";
import { gameFor } from "../../src/games";
import { findGrid } from "../../src/ui/map-image";

function view(rows: string[], pc: number, pr: number): OverworldView {
  return { grid: rows, pc, pr, originX: 40, originY: 20 } as unknown as OverworldView;
}

const on = (rows: string[]) => rows.map((r) => [...r].map((ch) => ch === "x"));

describe("renderDarkView", () => {
  it("shows a lit square as what it is, black walls next to lit squares as rock, and the rest as black", () => {
    const v = view(["#.T", ".@D", "#D#"], 1, 1);
    // (0,0) and (2,0) are walls beside lit squares: edges a player can tell; the person at (0,2) is a black sprite.
    expect(renderDarkView(v, on(["..x", "xx.", ".xx"])).split("\n").slice(1)).toEqual(["# ? ?", ". @ ?", "# D #"]);
  });

  it("marks a cave's lit lower floor as on the lit map, so a cliff between the levels isn't taken for a way", () => {
    // Two floor squares lit: one on the cave's lower floor (tile 5, as lowerCaveFloor says), one on the upper floor.
    const v = { grid: ["#..", "#@.", "###"], pc: 1, pr: 1, originX: 0, originY: 0, tiles: [[1, 5, 9], [1, 9, 9], [1, 1, 1]], lowerFloor: (t: number) => t === 5 } as unknown as OverworldView;
    const text = renderDarkView(v, on(["xxx", "..x", "..."]));
    expect(text.split("\n").slice(1)).toEqual(["# , .", "# @ .", "? ? #"]);  // walls touching nothing lit stay unknown
    expect(text).toMatch(/, lower floor/);
  });

  it("keeps a black wall deep in the dark unknown", () => {
    const v = view(["###", "#@.", "..."], 1, 1);
    expect(renderDarkView(v, on(["...", "...", "..."])).split("\n").slice(1)).toEqual(["? ? ?", "? @ ?", "? ? ?"]);
  });

  it("doesn't call lit floor rock or a black wall open (the dark tunnel, 1F, where a model walked into a wall)", () => {
    // The real map around the player, and which squares were lit on that screen (rebuilt from a run's call).
    const real = ["##########", "##########", "#..##...#.", "#..######.", "#..#@...#.", "#..#.D..#.", "#..#....#.", "####....##", "#........."];
    const lit = on(["..........", "..........", "xxx.xxxxxx", "xxx.xxxxxx", "xxx.....xx", "xxx..x..xx", "xxx.....xx", "xxxx....xx", "xx........"]);
    const rows = renderDarkView(view(real, 4, 4), lit).split("\n").slice(1);
    expect(rows[4]).toBe("# . . # @ ? ? ? # .");  // (no tiles here: plain floor) floor at x1-2 shows; the black wall left of @ is the cliff's edge
    expect(rows[2]).toBe("# . . # # . . . # .");
    expect(rows.join(" ")).not.toMatch(/T/);
  });

  it("gives no coordinates", () => {
    const text = renderDarkView(view(["##", "#@"], 1, 1), on(["xx", "xx"]));
    expect(text).not.toMatch(/\b(40|41|20|21)\b/);
    expect(text).not.toMatch(/\by\s*\d/);
  });
});

describe("litSquares", () => {
  const screen = (lit: [number, number][]) => {
    const px = new Uint8ClampedArray(160 * 144 * 4);
    for (let i = 0; i < 160 * 144; i++) px[i * 4] = 0x1e;
    for (const [x, y] of lit) px[(y * 160 + x) * 4] = 0x9e;
    return px;
  };

  it("an all-black screen has nothing lit", () => {
    expect(litSquares(screen([])).flat().some(Boolean)).toBe(false);
  });

  it("ignores a floor's stray dots and finds a square with a pattern", () => {
    const dots: [number, number][] = [[0, 0], [5, 5]];
    const pattern: [number, number][] = [...Array(8).keys()].map((i) => [32 + i, 16 + i]);
    const lit = litSquares(screen([...dots, ...pattern]));
    expect(lit[0][0]).toBe(false);
    expect(lit[1][2]).toBe(true);
    expect(lit.flat().filter(Boolean).length).toBe(1);
  });
});

describe("text boxes and menus over the dark view", () => {
  /** 18 rows of 20 tiles, blank, with a box framed from tile (left, top) to tile (right, bottom). */
  function boxScreen(top: number, left: number, bottom: number, right: number): string[] {
    const mid = right - left - 1;
    return Array.from({ length: 18 }, (_, y) => {
      if (y < top || y > bottom) return " ".repeat(20);
      const row = y === top ? "┌" + "─".repeat(mid) + "┐" : y === bottom ? "└" + "─".repeat(mid) + "┘" : "│" + " ".repeat(mid) + "│";
      return " ".repeat(left) + row + " ".repeat(19 - right);
    });
  }
  const shown = (sq: boolean[][]) => sq.map((row) => row.map((on) => (on ? "x" : ".")).join(""));

  it("covers the 9 rows of squares a text box's tile rows fall in, all columns", () => {
    // Tile rows 12-17 are square rows 6-8: the box's squares, and no others.
    expect(shown(boxedSquares(boxScreen(12, 0, 17, 19)))).toEqual([...Array(6).fill(".........."), ...Array(3).fill("xxxxxxxxxx")]);
  });

  it("covers a menu whose bottom border a box over it has drawn over (the bag over the start menu)", () => {
    // The start menu at tile columns 10-19, rows 0-15; a text box at rows 12-17 over its bottom.
    const menu = boxScreen(0, 10, 15, 19);
    const box = boxScreen(12, 0, 17, 19);
    const both = menu.map((row, y) => (y >= 12 ? box[y] : row));
    expect(shown(boxedSquares(both))).toEqual([...Array(6).fill(".....xxxxx"), ...Array(3).fill("xxxxxxxxxx")]);
  });

  it("counts a two-character tile (PK, 's) as one column", () => {
    // A box at tile columns 2-11 titled PKMN: written out, PK, MN and 's take two characters each.
    const screen = boxScreen(0, 2, 3, 11);
    screen[0] = "  ┌─PKMN─────┐" + " ".repeat(8);
    screen[1] = "  │PKMN's      │" + " ".repeat(8);
    expect(shown(boxedSquares(screen)).slice(0, 3)).toEqual([".xxxxx....", ".xxxxx....", ".........."]);
  });

  it("where map tiles read as ·, covers any square showing other tiles (a full-screen menu with no frame)", () => {
    const party = Array.from({ length: 18 }, (_, y) => (y < 12 ? (y === 1 ? "  NOVA    Lv23      " : " ".repeat(20)) : "·".repeat(20)));
    expect(shown(boxedSquares(party, true))).toEqual([...Array(6).fill("xxxxxxxxxx"), ...Array(3).fill("..........")]);
    // Not where map tiles can read as letters (Crystal): there only framed boxes count.
    expect(shown(boxedSquares(party))).toEqual(Array(9).fill(".........."));
  });

  it("covers only the squares of a small menu box", () => {
    // Tile rows 0-7, columns 10-19: square rows 0-3, square columns 5-9.
    expect(shown(boxedSquares(boxScreen(0, 10, 7, 19)))).toEqual([...Array(4).fill(".....xxxxx"), ...Array(5).fill("..........")]);
  });

  it("prints a covered square as ? even when it's lit", () => {
    const v = view(["#.", ".@"], 1, 1);
    expect(renderDarkView(v, on(["xx", "xx"]), [[false, true], [false, false]]).split("\n").slice(1)).toEqual(["# ?", ". @"]);
  });

  it("prints a covered wall that touches a lit square as ?, not as rock", () => {
    const v = view(["#.", ".@"], 1, 1);
    expect(renderDarkView(v, on([".x", "xx"])).split("\n").slice(1)).toEqual(["# .", ". @"]);
    expect(renderDarkView(v, on([".x", "xx"]), [[true, false], [false, false]]).split("\n").slice(1)).toEqual(["? .", ". @"]);
  });

  it("doesn't light the wall beside a covered square", () => {
    // The wall at (0,0) is only drawn as rock because the square beside it is lit; covered, that square is dark.
    const v = view(["#.", "#@"], 1, 1);
    expect(renderDarkView(v, on([".x", ".x"]), [[false, true], [false, false]]).split("\n").slice(1)).toEqual(["? ?", "# @"]);
  });
});

describe("isDark", () => {
  const mem = (addr: number, value: number) => ({ read8: (a: number) => (a === addr ? value : 0) }) as never;

  it("reads wMapPalOffset at each game's own address", () => {
    expect(gameFor("red").isDark(mem(0xd35d, 6))).toBe(true);
    expect(gameFor("yellow").isDark(mem(0xd35c, 6))).toBe(true);
    expect(gameFor("red").isDark(mem(0xd35c, 6))).toBe(false);
    expect(gameFor("yellow").isDark(mem(0xd35d, 6))).toBe(false);
  });
});

describe("hideCoords", () => {
  it("hides them in the dark and in any battle, and shows them otherwise", () => {
    expect(hideCoords({ dark: true, battle: 0 })).toBe(true);
    expect(hideCoords({ dark: false, battle: 1 })).toBe(true);
    expect(hideCoords({ dark: false, battle: 2 })).toBe(true);
    expect(hideCoords({ dark: false, battle: 0 })).toBe(false);
  });
});

describe("the model panel's picture of a dark map", () => {
  it("finds the dark grid, with no coordinates", () => {
    const text = renderDarkView(view(["#.", ".@"], 1, 1), on(["x.", ".x"])).split("\n");
    const lines = ["📍 somewhere", "Map:", ...text, "Screen: no text"];
    const grid = findGrid(lines);
    expect(grid?.dark).toBe(true);
    expect(grid?.cells).toEqual([["#", "?"], ["?", "@"]]);
    expect(lines.slice(grid!.start, grid!.end)).toEqual(text.slice(1));
  });

  it("leaves a normal map as it was", () => {
    const grid = findGrid(["      1 1", "      0 1", "y  5  # .", "y  6  . @"]);
    expect(grid?.dark).toBeUndefined();
    expect(grid?.x0).toBe(10);
    expect(grid?.ys).toEqual([5, 6]);
  });
});
