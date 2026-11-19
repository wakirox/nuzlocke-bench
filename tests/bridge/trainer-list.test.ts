// What the map says about trainers: never their teams.

import { describe, expect, it } from "vitest";
import { trainerFacing, trainerList } from "../../src/bridge/overworld";

describe("trainerList", () => {
  it("gives where they are, their class, and who's beaten", () => {
    expect(trainerList([{ x: 49, y: 10, name: "KEEPER", beaten: false }, { x: 48, y: 10, name: "WALKER", beaten: true }]))
      .toBe("\nTrainers (T): (49,10) KEEPER; (48,10) WALKER [beaten].");
  });

  it("includes facing for unbeaten on-screen trainers and omits it for beaten or off-screen ones", () => {
    expect(trainerFacing({ dx: 0, dy: -1, onScreen: true })).toBe("up");
    expect(trainerFacing({ dx: 0, dy: 1, onScreen: true })).toBe("down");
    expect(trainerFacing({ dx: -1, dy: 0, onScreen: true })).toBe("left");
    expect(trainerFacing({ dx: 1, dy: 0, onScreen: true })).toBe("right");
    expect(trainerFacing({ dx: 0, dy: 1, onScreen: false })).toBeUndefined();
    expect(trainerList([
      { x: 14, y: 2, name: "HIKER", beaten: false, facing: "down" },
      { x: 18, y: 4, name: "WALKER", beaten: true, facing: "left" },
      { x: 30, y: 6, name: "SAILOR", beaten: false },
    ])).toBe("\nTrainers (T): (14,2) HIKER facing down; (18,4) WALKER [beaten]; (30,6) SAILOR.");
  });

  it("leaves the team out even if one is passed in", () => {
    const withParty = { x: 1, y: 2, name: "KEEPER", beaten: false, party: "SOMEMON Lv29" };
    expect(trainerList([withParty])).not.toContain("SOMEMON");
  });

  it("says nothing when there are none", () => {
    expect(trainerList([])).toBe("");
  });
});
