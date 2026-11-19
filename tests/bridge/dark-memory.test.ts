// Dark memory (NUZLOCKE_DARK_MEMORY): what the dark view showed stays on that map, as a player
// remembers the corridor they just walked through. Still no coordinates; a map lit later is unchanged.

import { describe, expect, it } from "vitest";
import { BridgeCore } from "../../src/bridge/bridge-core";
import { litSquares, renderDarkView } from "../../src/bridge/overworld";
import { SeenMaps } from "../../src/bridge/seen";
import { gen1Adapter } from "../../src/games/gen1";
import { FakeHost, screenRows } from "../harness/fake-bridge";

const MAP = 1;
const layout = gen1Adapter("yellow").screen;

// A dark corridor 2..27 wide along row 4, a ladder at its far end (26,4); rock all around.
const WORLD = Array.from({ length: 9 }, (_, y) => Array.from({ length: 30 }, (_, x) => (y === 4 && x >= 2 && x <= 27 ? "." : "#")).join(""));

/** The screen's pixels in a dark cave: a floor square's pattern shows, rock is black (see litSquares). */
function pixels(host: FakeHost): Uint8ClampedArray {
  const p = host.asHost().position();
  const out = new Uint8ClampedArray(160 * 144 * 4);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 10; c++) {
      if (WORLD[p.y - 4 + r]?.[p.x - 4 + c] !== ".") continue;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) out.fill(255, ((r * 16 + y) * 160 + c * 16 + x) * 4, ((r * 16 + y) * 160 + c * 16 + x) * 4 + 3);
    }
  }
  return out;
}

function darkCave(darkMemory: boolean, seen = new SeenMaps()) {
  const host = new FakeHost(layout, [{ rows: screenRows() }], {
    position: { inWorld: true, map: MAP, x: 5, y: 4 },
    world: WORLD,
    doors: [{ x: 26, y: 4, to: "?", tx: null, ty: null }],
    seen,
  });
  const core = new BridgeCore(host.asHost());
  core.darkMemory = darkMemory;
  core.dark = () => true;
  core.screenPixels = () => pixels(host);
  core.screenText = () => []; // no text box over the cave (the fake's screen has one)
  return { host, core, seen };
}

const rowsOf = (text: string) => text.split("\n").slice(1);

describe("SeenMaps: the dark", () => {
  it("remembers every square the dark view showed but the dark and the player, and shows it where the view is dark", () => {
    const s = new SeenMaps();
    s.sawDark(MAP, [["#", "?"], [".", "@"]], 10, 20);
    expect(s.data.dark).toEqual({ [MAP]: { "10,20": "#", "10,21": "." } });
    // Later the same squares are dark: memory fills them in; what's shown now wins over memory.
    expect(s.darkMap(MAP, [["?", "?"], ["?", "@"]], 10, 20, false)).toEqual([["#", "?"], [".", "@"]]);
    expect(s.darkMap(MAP, [[",", "?"], ["?", "@"]], 10, 20, false)).toEqual([[",", "?"], [".", "@"]]);
    // Nothing remembered on another map.
    expect(s.darkMap(MAP + 1, [["?", "?"], ["?", "@"]], 10, 20, false)).toEqual([["?", "?"], ["?", "@"]]);
  });

  it("shows the whole remembered area with full, a rectangle around the screen and every remembered square", () => {
    const s = new SeenMaps();
    s.sawDark(MAP, [["."]], 7, 18);
    // The screen here is x 10..11 at y 20; the remembered square is (7,18): x 7..11, y 18..20.
    expect(s.darkMap(MAP, [["@", "."]], 10, 20, true)).toEqual([
      [".", "?", "?", "?", "?"],
      ["?", "?", "?", "?", "?"],
      ["?", "?", "?", "@", "."],
    ]);
    // Without full: just the screen.
    expect(s.darkMap(MAP, [["@", "."]], 10, 20, false)).toEqual([["@", "."]]);
  });

  it("is kept with the run's seen data and only flags a change when something new was seen", () => {
    const s = new SeenMaps();
    s.sawDark(MAP, [["."]], 3, 3);
    expect(s.takeChanged()).toBe(true);
    s.sawDark(MAP, [["."]], 3, 3);
    expect(s.takeChanged()).toBe(false);
    const restored = new SeenMaps(structuredClone(s.data));
    expect(restored.darkMap(MAP, [["?"]], 3, 3, false)).toEqual([["."]]);
    // Runs without dark memory save no dark field at all.
    expect(new SeenMaps().data).not.toHaveProperty("dark");
  });
});

describe("BridgeCore: the dark view with dark memory", () => {
  it("is the plain dark view when the option is off, and remembers nothing", () => {
    const { core, seen } = darkCave(false);
    const text = core.mapText(true);
    expect(text).toMatch(/^It's dark: you see only some squares\. /);
    expect(seen.data).not.toHaveProperty("dark");
  });

  it("shows the corridor walked through on the whole map, the square each move ended on included, and no coordinates", () => {
    const { host, core, seen } = darkCave(true);
    core.mapText(); // the end of a move at (5,4): the screen x 1..10
    host.moveTo({ x: 15 });
    core.mapText(); // the next move ends at (15,4): the screen x 11..20
    // The screen: only what's on it now (nothing from x 1..10 fits in it).
    expect(rowsOf(core.mapText())[4]).toBe(". . . . @ . . . . .");
    // The whole remembered area: x 1..20, the first stop (5,4) remembered as floor.
    const whole = core.mapText(true);
    expect(whole).toMatch(/^It's dark: you see only some squares, and remember the ones you saw earlier in the dark\. /);
    expect(rowsOf(whole)[4]).toBe("# . . . . . . . . . . . . . @ . . . . .");
    expect(rowsOf(whole)[3]).toBe("? # # # # # # # # # # # # # # # # # # #");
    expect(whole).not.toMatch(/\d/);
    // Nothing went into the lit memory: a map lit later (Flash) shows what it always did.
    expect(seen.data.squares).toEqual({});
  });

  it("remembers a ladder the player stands on as a ladder", () => {
    const { host, core } = darkCave(true);
    host.moveTo({ x: 26 });
    core.mapText();
    host.moveTo({ x: 15 });
    // x 11..28: the screen now (11..20), nothing seen at 21, then what the ladder's screen showed:
    // the ladder at 26 and the rock lit floor touches at 28 (the dark past it isn't remembered).
    expect(rowsOf(core.mapText(true))[4]).toBe(". . . . @ . . . . . ? . . . . D . #");
  });

  it("the plain dark view is what renderDarkView always showed", () => {
    const { host, core } = darkCave(false);
    expect(core.mapText()).toBe(renderDarkView(core.rawView(false), litSquares(pixels(host))));
  });
});
