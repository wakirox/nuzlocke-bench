// Beating the rival as milestones.

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { hardAreasOf, objectivesOf } from "../../mcp-server/report.mjs";

const call = (map: string, trainerClass: number, result?: string) => ({
  where: `SOMEWHERE [${map}] x1 y1 | battle: none`, playTime: "1:00:00", fight: { trainerClass, result },
});

describe("rival milestones", () => {
  it("counts a rival fight when it's won, not when it begins", () => {
    expect(objectivesOf([call("OAKS_LAB", 0x19)]).rival1).toBeUndefined();
    expect(objectivesOf([call("OAKS_LAB", 0x19, "won")]).rival1).toBe("1:00:00");
  });

  it("doesn't count a loss or another trainer on that map", () => {
    expect(objectivesOf([call("OAKS_LAB", 0x19, "lost")]).rival1).toBeUndefined();
    expect(objectivesOf([call("CERULEAN_CITY", 0x06, "won")]).rival2).toBeUndefined();
  });

  it("counts only the later fight on the route with two", () => {
    expect(objectivesOf([call("ROUTE_22", 0x19, "won")]).rival6).toBeUndefined();
    expect(objectivesOf([call("ROUTE_22", 0x2a, "won")]).rival6).toBe("1:00:00");
  });
});

describe("rival milestones in a log with no fights recorded", () => {
  const at = (map: string, playTime: string) => ({ where: `SOMEWHERE [${map}] x1 y1 | battle: none`, playTime });

  it("counts the rivals before the furthest milestone, and none after it", () => {
    const got = objectivesOf([at("CERULEAN_CITY", "1:00:00")]);
    expect(got.rival1).toBe("1:00:00");
    expect(got.rival2).toBeUndefined();
  });

  it("doesn't assume anything in a log that records fights", () => {
    const got = objectivesOf([at("CERULEAN_CITY", "1:00:00"), { ...at("ROUTE_4", "0:50:00"), fight: { trainerClass: 6, result: "won" } }]);
    expect(got.rival1).toBeUndefined();
  });
});

describe("the burned mansion milestone", () => {
  it("counts on entering the gym its key opens, not on entering the mansion", () => {
    const at = (map: string) => ({ where: `SOMEWHERE [${map}] x1 y1 | battle: none`, playTime: "8:00:00" });
    expect(objectivesOf([at("POKEMON_MANSION_B1F")]).mansion).toBeUndefined();
    expect(objectivesOf([at("CINNABAR_GYM")]).mansion).toBe("8:00:00");
  });
});

describe("hardAreasOf", () => {
  const at = (map: string, playTime: string, deaths = 0) => ({ where: `SOMEWHERE [${map}] x1 y1 | battle: none`, playTime, deaths });

  it("measures an area up to the milestone that ends it, trips out included", () => {
    const areas = hardAreasOf([
      at("CINNABAR_ISLAND", "7:00:00"),
      at("POKEMON_MANSION_1F", "7:00:10"), at("POKEMON_MANSION_2F", "7:01:00", 1),
      at("CINNABAR_ISLAND", "7:02:00", 1),
      at("POKEMON_MANSION_1F", "7:03:00", 1), at("POKEMON_MANSION_B1F", "7:10:10", 2),
      at("CINNABAR_ISLAND", "7:11:00", 2),
      at("CINNABAR_GYM", "7:12:00", 2), at("CINNABAR_GYM", "7:13:00", 3),
    ]);
    expect(areas).toEqual([{ id: "mansion", label: "Burned mansion", done: true, calls: 6, entries: 2, deaths: 2, seconds: 650 }]);
  });

  it("runs to the end of the run when it never got through", () => {
    const [area] = hardAreasOf([at("SILPH_CO_1F", "5:00:00"), at("SILPH_CO_2F", "5:00:30")]);
    expect(area).toMatchObject({ id: "company", done: false, calls: 2, seconds: 30 });
  });

  it("leaves out the tunnel's Pokémon Center and areas never entered", () => {
    expect(hardAreasOf([at("ROCK_TUNNEL_POKECENTER", "2:00:00")])).toEqual([]);
  });
});

describe("map milestones passed during one call", () => {
  it("counts a milestone map the call passed through, not only the one it ended on", () => {
    const go = { where: "ROUTE 9 [ROUTE_9] x1 y1 | battle: none", playTime: "2:00:00", maps: ["ROUTE_4", "CERULEAN_CITY", "ROUTE_9"] };
    const got = objectivesOf([go]);
    expect(got.cave1).toBe("2:00:00");
    expect(got.cottageDone).toBe("2:00:00");
  });

  it("still reads a log from before the maps were recorded", () => {
    expect(objectivesOf([{ where: "CITY [CERULEAN_CITY] x1 y1 | battle: none", playTime: "1:00:00" }]).cave1).toBe("1:00:00");
  });
});
