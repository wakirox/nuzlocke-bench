// What the map says about trainers: never their teams.

import { describe, expect, it } from "vitest";
import { trainerList } from "../../src/bridge/overworld";

describe("trainerList", () => {
  it("gives where they are, their class, and who's beaten", () => {
    expect(trainerList([{ x: 49, y: 10, name: "KEEPER", beaten: false }, { x: 48, y: 10, name: "WALKER", beaten: true }]))
      .toBe("\nTrainers (T): (49,10) KEEPER; (48,10) WALKER [beaten].");
  });

  it("leaves the team out even if one is passed in", () => {
    const withParty = { x: 1, y: 2, name: "KEEPER", beaten: false, party: "SOMEMON Lv29" };
    expect(trainerList([withParty])).not.toContain("SOMEMON");
  });

  it("says nothing when there are none", () => {
    expect(trainerList([])).toBe("");
  });
});
