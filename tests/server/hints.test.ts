// The hint tool (preset option "hints"): the next story step from the state and the run log.

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { ITEM, firstRivalFought, hintState, nextHint, visitedMaps } from "../../mcp-server/hints.mjs";
// @ts-expect-error plain ESM module without type declarations
import { OBJECTIVES } from "../../mcp-server/report.mjs";
// @ts-expect-error plain ESM module without type declarations
import { benchmarkPreset } from "../../mcp-server/benchmark.mjs";

const at = (map: string, extra: object = {}) => JSON.stringify({ n: 1, tool: "walk", where: `SOMEWHERE [${map}] x1 y1 facing up | battle: none`, ...extra });
const state = (over: object = {}) => ({ party: [], badges: [], bag: [], location: { id: "PALLET_TOWN" }, ...over });
const mon = { species: "A" };

describe("hints", () => {
  it("reads the maps seen and the first rival fight from the run log", () => {
    const log = [at("PALLET_TOWN"), at("OAKS_LAB", { firstRival: "won" }), "not json"].join("\n");
    expect([...visitedMaps(log)]).toEqual(["PALLET_TOWN", "OAKS_LAB"]);
    expect(firstRivalFought(log)).toBe(true);
    expect(firstRivalFought(at("PALLET_TOWN"))).toBe(false);
  });

  it("walks the early story in order: the grass, the lab, the rival, the parcel, the first gym", () => {
    const hint = (s: object, log = "", bag: number[] = []) => nextHint(hintState(state(s), log, { bag }));
    expect(hint({})).toMatch(/tall grass/);
    expect(hint({}, at("OAKS_LAB"))).toMatch(/balls on the table/);
    expect(hint({ party: [mon] }, at("OAKS_LAB"))).toMatch(/rival challenges you/);
    const afterRival = at("OAKS_LAB", { firstRival: "won" });
    expect(hint({ party: [mon] }, afterRival)).toMatch(/shop: the clerk has a parcel/);
    expect(hint({ party: [mon] }, afterRival, [ITEM.parcel])).toMatch(/parcel back south/);
    const delivered = [afterRival, at("VIRIDIAN_MART")].join("\n");
    expect(hint({ party: [mon] }, delivered)).toMatch(/first gym is in the town past the forest/);
    expect(hint({ party: [mon], badges: ["B1"] }, delivered)).toMatch(/through its cave/);
    expect(hint({ party: [mon], badges: ["B1"], location: { id: "CERULEAN_CITY" } }, delivered)).toMatch(/second gym is in this city/);
    expect(hint({ party: [mon], badges: ["B1", "B2"] }, delivered)).toMatch(/cottage/);
  });

  it("follows the key items through the middle of the story", () => {
    const log = ["OAKS_LAB", "VIRIDIAN_MART", "CERULEAN_CITY", "BILLS_HOUSE", "SS_ANNE_1F"].map((m) => at(m)).join("\n") + "\n" + at("OAKS_LAB", { firstRival: "won" });
    const hint = (badges: number, bag: number[], more: string[] = []) =>
      nextHint(hintState(state({ party: [mon], badges: Array(badges).fill("B") }), log + "\n" + more.map((m) => at(m)).join("\n"), { bag }));
    expect(hint(2, [])).toMatch(/captain's cabin/);
    expect(hint(2, [ITEM.cutHm])).toMatch(/field_move CUT/);
    expect(hint(3, [ITEM.cutHm])).toMatch(/dark tunnel/);
    expect(hint(3, [ITEM.cutHm], ["LAVENDER_TOWN", "CELADON_CITY"])).toMatch(/fourth gym/);
    expect(hint(4, [ITEM.cutHm], ["LAVENDER_TOWN", "CELADON_CITY"])).toMatch(/game corner/);
    expect(hint(4, [ITEM.scope], ["LAVENDER_TOWN", "CELADON_CITY"])).toMatch(/free the old man/);
    expect(hint(5, [ITEM.flute], ["LAVENDER_TOWN", "CELADON_CITY", "FUCHSIA_CITY"])).toMatch(/secret house/);
    expect(hint(5, [ITEM.flute, ITEM.surfHm, ITEM.goldTeeth], ["LAVENDER_TOWN", "CELADON_CITY", "FUCHSIA_CITY"])).toMatch(/warden/);
    expect(hint(6, [ITEM.flute, ITEM.surfHm], ["LAVENDER_TOWN", "CELADON_CITY", "FUCHSIA_CITY", "SAFFRON_CITY"])).toMatch(/burned mansion/);
    expect(hint(7, [ITEM.flute, ITEM.surfHm], ["LAVENDER_TOWN", "CELADON_CITY", "FUCHSIA_CITY", "SAFFRON_CITY"])).toMatch(/last gym/);
  });

  it("sends a player who walked into the lab alone back to the grass: only the professor's escort counts", () => {
    const inLab = at("OAKS_LAB");
    expect(nextHint(hintState(state({ location: { id: "OAKS_LAB" } }), inLab, { ledIntoLab: false }))).toMatch(/tall grass/);
    expect(nextHint(hintState(state({ location: { id: "OAKS_LAB" } }), inLab, { ledIntoLab: true }))).toMatch(/balls on the table/);
  });

  it("works without the early log (a resumed run): the game's rival flag and later progress count", () => {
    const resumed = hintState(state({ party: [mon], badges: Array(6).fill("B"), location: { id: "SOMEWHERE" } }), "",
      { bag: [ITEM.ticket, ITEM.cutHm, ITEM.scope, ITEM.flute, ITEM.cardKey, ITEM.surfHm], rivalFought: true });
    expect(nextHint(resumed)).toMatch(/burned mansion/);
    expect(nextHint(hintState(state({ party: [mon] }), "", { rivalFought: true }))).toMatch(/shop: the clerk/);
  });

  it("names the next milestone once the written steps are done", () => {
    const log = ["OAKS_LAB", "VIRIDIAN_MART", "CERULEAN_CITY", "BILLS_HOUSE", "SS_ANNE_1F", "LAVENDER_TOWN", "CELADON_CITY", "FUCHSIA_CITY", "SAFFRON_CITY", "VICTORY_ROAD_1F"]
      .map((m) => at(m)).join("\n") + "\n" + at("OAKS_LAB", { firstRival: "won" });
    const s = hintState(state({ party: [mon], badges: Array(8).fill("B") }), log, { bag: [ITEM.scope, ITEM.flute, ITEM.surfHm, ITEM.strengthHm] });
    const reached = new Set(OBJECTIVES.map((o: { id: string }) => o.id).filter((id: string) => id !== "elite2"));
    // Past the first elite room the written steps are done: the next milestone is named.
    const inside = hintState(state({ party: [mon], badges: Array(8).fill("B") }), log + "\n" + at("LORELEIS_ROOM"),
      { bag: [ITEM.scope, ITEM.flute, ITEM.surfHm, ITEM.strengthHm] });
    expect(nextHint(inside, OBJECTIVES, reached)).toBe("Next goal: Elite room 2.");
    // Before it, the league's last step: stock up at its shop.
    expect(nextHint(s, OBJECTIVES, reached)).toMatch(/Stock up there before you go in/);
  });

  it("is a preset option that goes into the preset id", () => {
    expect(benchmarkPreset("hardcore-nuzlocke+firstrival+hardcap+hints")).toMatchObject({ hints: true });
    expect(benchmarkPreset("hardcore-nuzlocke+firstrival+hardcap").hints).toBeUndefined();
  });
});
