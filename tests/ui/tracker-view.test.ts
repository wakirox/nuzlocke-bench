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

describe("encounters where the player is", () => {
  const slots = (species: number) => Array.from({ length: 10 }, () => ({ species, level: 20 }));
  const render = (over: object) => renderEncounters(new Tracker(trackerData("red"), "nuzlocke", null, () => {}), gen1Fixture().state({ started: true, ...over }));
  const shore = { grassRate: 25, grassMons: slots(SPECIES.WILD_A), waterRate: 5, waterMons: slots(SPECIES.WILD_B) };

  it("shows the surfing table while surfing, with its rate", () => {
    const html = render({ ...shore, surfing: true });
    expect(html).toContain("OTHERMON");
    expect(html).not.toContain("WILDMON");
    expect(html).toContain("· surfing</span>");
    expect(html).toContain("Encounter chance per step while surfing: 2.0%");
  });

  it("shows the grass table on land, even where the map has water too", () => {
    const html = render({ ...shore, surfing: false });
    expect(html).toContain("WILDMON");
    expect(html).not.toContain("OTHERMON");
    expect(html).toContain("Encounter chance per step in grass/caves: 10%");
  });

  it("shows nothing on the land of a map that only has water encounters", () => {
    expect(render({ waterRate: 5, waterMons: slots(SPECIES.WILD_B), surfing: false })).toBe("");
    expect(render({ waterRate: 5, waterMons: slots(SPECIES.WILD_B), surfing: true })).toContain("OTHERMON");
  });

  it("shows nothing on a map with no wild Pokémon", () => {
    expect(render({})).toBe("");
  });
});
