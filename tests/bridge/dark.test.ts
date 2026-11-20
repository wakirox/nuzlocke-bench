// What the tools show in the dark tunnel: only what a player can see there.

import { describe, expect, it } from "vitest";
import { DARK_HEADER, boxedSquares, darkSquares, litSquares, windowSquares, type OverworldView } from "../../src/bridge/overworld";
import { hideCoords } from "../../src/bridge/summary";
import { gameFor } from "../../src/games";
import { findGrid } from "../../src/ui/map-image";

function view(rows: string[], pc: number, pr: number): OverworldView {
  return { grid: rows, pc, pr, originX: 40, originY: 20 } as unknown as OverworldView;
}

const on = (rows: string[]) => rows.map((r) => [...r].map((ch) => ch === "x"));
/** The dark screen's squares, a row a line. */
const dark = (v: OverworldView, lit: boolean[][], covered?: boolean[][]) => darkSquares(v, lit, covered).map((row) => row.join(" "));

describe("darkSquares", () => {
  it("shows a lit square as what it is, black walls next to lit squares as rock, and the rest as black", () => {
    const v = view(["#.T", ".@D", "#D#"], 1, 1);
    // (0,0) and (2,0) are walls beside lit squares: edges a player can tell; the person at (0,2) is a black sprite.
    expect(dark(v, on(["..x", "xx.", ".xx"]))).toEqual(["# ? ?", ". @ ?", "# D #"]);
  });

  it("marks a cave's lit lower floor as on the lit map, so a cliff between the levels isn't taken for a way", () => {
    // Two floor squares lit: one on the cave's lower floor (tile 5, as lowerCaveFloor says), one on the upper floor.
    const v = { grid: ["#..", "#@.", "###"], pc: 1, pr: 1, originX: 0, originY: 0, tiles: [[1, 5, 9], [1, 9, 9], [1, 1, 1]], lowerFloor: (t: number) => t === 5 } as unknown as OverworldView;
    expect(dark(v, on(["xxx", "..x", "..."]))).toEqual(["# , .", "# @ .", "? ? #"]);  // walls touching nothing lit stay unknown
    expect(DARK_HEADER).toMatch(/, lower floor/);
  });

  it("keeps a black wall deep in the dark unknown", () => {
    const v = view(["###", "#@.", "..."], 1, 1);
    expect(dark(v, on(["...", "...", "..."]))).toEqual(["? ? ?", "? @ ?", "? ? ?"]);
  });

  it("doesn't call lit floor rock or a black wall open (the dark tunnel, 1F, where a model walked into a wall)", () => {
    // The real map around the player, and which squares were lit on that screen (rebuilt from a run's call).
    const real = ["##########", "##########", "#..##...#.", "#..######.", "#..#@...#.", "#..#.D..#.", "#..#....#.", "####....##", "#........."];
    const lit = on(["..........", "..........", "xxx.xxxxxx", "xxx.xxxxxx", "xxx.....xx", "xxx..x..xx", "xxx.....xx", "xxxx....xx", "xx........"]);
    const rows = dark(view(real, 4, 4), lit);
    expect(rows[4]).toBe("# . . # @ ? ? ? # .");  // (no tiles here: plain floor) floor at x1-2 shows; the black wall left of @ is the cliff's edge
    expect(rows[2]).toBe("# . . # # . . . # .");
    expect(rows.join(" ")).not.toMatch(/T/);
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

  it("covers what the window layer covers: Crystal's place-name sign over the bottom two rows", () => {
    // As read in Crystal on arriving in a dark cave: LCDC e3 (screen and window on), WY 0x70, WX 7.
    expect(shown(windowSquares(0xe3, 0x70, 7))).toEqual([...Array(7).fill(".........."), ...Array(2).fill("xxxxxxxxxx")]);
    // Sliding in: a square partly under it is covered too.
    expect(shown(windowSquares(0xe3, 0x78, 7)).slice(6)).toEqual(["..........", "xxxxxxxxxx", "xxxxxxxxxx"]);
    // Hidden below the screen (WY 0x90), window off (bit 5) or screen off (bit 7): nothing covered.
    for (const [lcdc, wy] of [[0xe3, 0x90], [0xc3, 0x70], [0x63, 0x70]]) expect(shown(windowSquares(lcdc, wy, 7))).toEqual(Array(9).fill(".........."));
    // Squares under the sign stay dark although the sign lights them.
    const lit = Array.from({ length: 9 }, (_, r) => Array.from({ length: 10 }, (_, c) => r >= 7 || (r === 4 && c === 4)));
    const v = { grid: Array.from({ length: 9 }, () => Array<string>(10).fill(".")), pr: 4, pc: 4 } as unknown as OverworldView;
    expect(darkSquares(v, lit, windowSquares(0xe3, 0x70, 7)).slice(7).map((row) => row.join(""))).toEqual(["??????????", "??????????"]);
  });

  it("covers only the squares of a small menu box", () => {
    // Tile rows 0-7, columns 10-19: square rows 0-3, square columns 5-9.
    expect(shown(boxedSquares(boxScreen(0, 10, 7, 19)))).toEqual([...Array(4).fill(".....xxxxx"), ...Array(5).fill("..........")]);
  });

  it("prints a covered square as ? even when it's lit", () => {
    const v = view(["#.", ".@"], 1, 1);
    expect(dark(v, on(["xx", "xx"]), [[false, true], [false, false]])).toEqual(["# ?", ". @"]);
  });

  it("prints a covered wall that touches a lit square as ?, not as rock", () => {
    const v = view(["#.", ".@"], 1, 1);
    expect(dark(v, on([".x", "xx"]))).toEqual(["# .", ". @"]);
    expect(dark(v, on([".x", "xx"]), [[true, false], [false, false]])).toEqual(["? .", ". @"]);
  });

  it("doesn't light the wall beside a covered square", () => {
    // The wall at (0,0) is only drawn as rock because the square beside it is lit; covered, that square is dark.
    const v = view(["#.", "#@"], 1, 1);
    expect(dark(v, on([".x", ".x"]), [[false, true], [false, false]])).toEqual(["? ?", "# @"]);
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
  it("hides them in any battle, and shows them otherwise, the dark included (0.3.0: they count from where the run arrived)", () => {
    expect(hideCoords({ battle: 1 })).toBe(true);
    expect(hideCoords({ battle: 2 })).toBe(true);
    expect(hideCoords({ battle: 0 })).toBe(false);
  });
});

describe("the model panel's picture of a dark map", () => {
  it("finds a dark map with coordinates, in the dark's colours", () => {
    const text = [DARK_HEADER, "     -1 0", "y -1  # ?", "y  0  ? @"];
    const lines = ["📍 somewhere", "Map:", ...text, "Screen: no text"];
    const grid = findGrid(lines);
    expect(grid?.dark).toBe(true);
    expect(grid?.cells).toEqual([["#", "?"], ["?", "@"]]);
    expect(grid?.x0).toBe(-1);
    expect(grid?.ys).toEqual([-1, 0]);
  });

  it("still finds a dark grid from before 0.3.0, which had no coordinates", () => {
    const text = ["It's dark: you see only some squares. You are at @.", "# ?", "? @"];
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

  it("reads a narrow header with a sign row (x below -9), and with a hundreds row", () => {
    expect(findGrid(["      - -", "      1 1", "      2 1", "y  5  # .", "y  6  . @"])?.x0).toBe(-12);
    expect(findGrid(["       - -", "       1 1", "       0 0", "       1 0", "y-100  # .", "y -99  . @"])?.x0).toBe(-101);
    expect(findGrid(["      - -", "      3 2", "y  5  # .", "y  6  . @"])?.x0).toBe(-3);
  });

  it("reads a wide header whose columns widened for -10 and beyond", () => {
    const grid = findGrid(["      -12 -11 -10  -9", "y -1    #   .   @   .", "y  0    .   .   .   ."]);
    expect(grid?.x0).toBe(-12);
    expect(grid?.ys).toEqual([-1, 0]);
    expect(grid?.cells[0]).toEqual(["#", ".", "@", "."]);
  });
});
