// The game's story data on the Node side (mcp-server/games/): picked by the run's version, and the
// report follows whichever game it's given, so another generation is one more module.

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { GEN1, gameData, isExperimental, romVersion } from "../../mcp-server/games/index.mjs";
// @ts-expect-error plain ESM module without type declarations
import { firstRivalFromCalls, hardAreasOf, objectivesOf } from "../../mcp-server/report.mjs";
// @ts-expect-error plain ESM module without type declarations
import { hintState, nextHint } from "../../mcp-server/hints.mjs";

const at = (n: number, map: string, extra: object = {}) => ({ n, tool: "walk", where: `X [${map}] x1 y1`, playTime: `0:00:${String(n).padStart(2, "0")}`, ...extra });

describe("game data", () => {
  it("marks Crystal experimental, and only Crystal", () => {
    expect(isExperimental("crystal")).toBe(true);
    expect(isExperimental("Crystal")).toBe(true);
    for (const v of ["red", "blue", "yellow", null, undefined, "gold"]) expect(isExperimental(v)).toBe(false);
  });

  it("reads the game version from a ROM's header title", () => {
    const rom = (title: string) => { const b = new Uint8Array(0x150); b.set(new TextEncoder().encode(title), 0x134); return b; };
    expect(romVersion(rom("PM_CRYSTAL\0BYTE"))).toBe("crystal");
    expect(romVersion(rom("POKEMON RED"))).toBe("red");
    expect(romVersion(rom("POKEMON BLUE"))).toBe("blue");
    expect(romVersion(rom("POKEMON YELLOW"))).toBe("yellow");
    expect(romVersion(rom("TETRIS"))).toBeNull();
  });

  it("is Gen 1's for every Gen 1 version, and for runs that don't say", () => {
    for (const v of ["red", "Blue", "YELLOW", undefined, "unknown"]) expect(gameData(v)).toBe(GEN1);
  });

  it("drives the report: another game's milestones, home and hard areas are used as given", () => {
    const other = {
      ...GEN1,
      versions: ["gold"],
      home: new Set(["HOME_A"]),
      objectives: [{ id: "town2", label: "Second town", maps: ["TOWN_2"] }, { id: "badge1", label: "Badge 1", badges: 1 }],
      hardAreas: [{ id: "woods", label: "Woods", prefix: "WOODS_", done: "badge1" }],
    };
    const calls = [at(1, "HOME_A"), at(2, "WOODS_1"), at(3, "TOWN_2"), at(4, "TOWN_2", { badges: 1 })];
    expect(Object.keys(objectivesOf(calls, other))).toEqual(["town2", "badge1"]);
    expect(Object.keys(objectivesOf(calls))).not.toContain("town2"); // Gen 1 knows no TOWN_2
    expect(hardAreasOf(calls, other).map((a: { id: string; done: boolean }) => [a.id, a.done])).toEqual([["woods", true]]);
    expect(firstRivalFromCalls(calls, null, other)).toBe("won"); // left another game's home
  });

  it("drives the hints: another game's steps are used as given", () => {
    const other = { ...GEN1, hintSteps: [{ when: () => true, text: "Go to the second town." }] };
    const s = hintState({ party: [], badges: [], bag: [], location: { id: "HOME_A" } }, "", {});
    expect(nextHint(s, [], new Set(), other)).toBe("Go to the second town.");
    expect(nextHint(s)).toMatch(/tall grass/); // Gen 1 by default
  });
});
