// Beating the rival as milestones.

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { hardAreasOf, objectivesOf } from "../../mcp-server/report.mjs";
// @ts-expect-error plain ESM module without type declarations
import { GEN2 } from "../../mcp-server/games/gen2.mjs";

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

  it("counts a win whose call walked on to another map, by the fight's own map", () => {
    // 2026-11-22: the call that won the first rival fight ended in the next town; its passed maps don't hold the
    // map it started on, the fight record does.
    const walkedOn = (map: string, fightMap: string, trainerClass: number) =>
      ({ ...call(map, trainerClass, "won"), maps: ["ROUTE_29", map], fight: { trainerClass, result: "won", map: fightMap } });
    expect(objectivesOf([walkedOn("NEW_BARK_TOWN", "CHERRYGROVE CITY", 9)], GEN2).rival1).toBe("1:00:00");
    expect(objectivesOf([walkedOn("ROUTE_25", "CERULEAN CITY", 0x19)]).rival2).toBe("1:00:00");
    // Another trainer's win on that map still isn't the rival's.
    expect(objectivesOf([walkedOn("NEW_BARK_TOWN", "CHERRYGROVE CITY", 0x06)], GEN2).rival1).toBeUndefined();
  });

  it("counts only the later fight on the route with two", () => {
    expect(objectivesOf([call("ROUTE_22", 0x19, "won")]).rival6).toBeUndefined();
    expect(objectivesOf([call("ROUTE_22", 0x2a, "won")]).rival6).toBe("1:00:00");
  });
});

describe("Crystal's rival milestones", () => {
  // RIVAL1 = class 9 (pokecrystal trainer_constants).
  it("counts the fight where the floor gives way, on either floor (the win's call can end below)", () => {
    expect(objectivesOf([call("BURNED_TOWER_B1F", 9, "won")], GEN2).rival3).toBe("1:00:00");
    expect(objectivesOf([call("BURNED_TOWER_1F", 9, "won")], GEN2).rival3).toBe("1:00:00");
  });

  it("counts the underground fight in the switch room's entrances, where it is", () => {
    expect(objectivesOf([call("GOLDENROD_UNDERGROUND_SWITCH_ROOM_ENTRANCES", 9, "won")], GEN2).rival4).toBe("1:00:00");
    expect(objectivesOf([call("GOLDENROD_UNDERGROUND", 9, "won")], GEN2).rival4).toBeUndefined();
  });

  it("doesn't count a won fight on a call with no map", () => {
    expect(objectivesOf([{ where: "", playTime: "1:00:00", fight: { trainerClass: 9, result: "won" } }], GEN2).rival1).toBeUndefined();
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

  it("ends the area at a milestone map passed mid-call, and counts an entry made mid-call", () => {
    const via = (map: string, playTime: string, maps: string[]) => ({ ...at(map, playTime), maps });
    const areas = hardAreasOf([
      at("ROUTE_10", "3:00:00"),
      via("ROCK_TUNNEL_1F", "3:00:10", ["ROCK_TUNNEL_1F"]),
      at("ROCK_TUNNEL_B1F", "3:05:00"),
      via("ROUTE_8", "3:09:00", ["ROCK_TUNNEL_1F", "LAVENDER_TOWN", "ROUTE_8"]),
      at("ROUTE_8", "3:20:00"), at("ROUTE_8", "3:30:00"),
    ]);
    expect(areas).toEqual([{ id: "tunnel", label: "Dark tunnel", done: true, calls: 2, entries: 1, deaths: 0, seconds: 290 }]);
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
