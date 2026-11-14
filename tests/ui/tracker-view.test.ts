// The tracker panel's encounter table: each game's own slot odds, adding up to the whole table.

import { describe, expect, it } from "vitest";
import { renderEncounters } from "../../src/ui/tracker-view";
import { Tracker } from "../../src/tracker/tracker";
import { gen1Fixture, SPECIES, trackerData } from "../games/gen1/fixture";
import type { GameVersion } from "../../src/rom/types";

/** The odds column of the table for a map whose slots are all one species. */
function oneSpeciesOdds(version: GameVersion, slots: number): string | undefined {
  const t = new Tracker(trackerData(version), "nuzlocke", null, () => {});
  const s = gen1Fixture().state({
    started: true, grassRate: 25, grassMons: Array.from({ length: slots }, () => ({ species: SPECIES.WILD_A, level: 3 })),
  });
  return /<td class="num">([^<]+)</.exec(renderEncounters(t, s))?.[1];
}

describe("encounter odds", () => {
  it("adds Red's ten slots up to the whole table", () => {
    expect(oneSpeciesOdds("red", 10)).toBe("100%");
  });

  it("adds Crystal's seven grass slots up to the whole table (30/30/20/10/5/4/1)", () => {
    expect(oneSpeciesOdds("crystal", 7)).toBe("100%");
  });
});
