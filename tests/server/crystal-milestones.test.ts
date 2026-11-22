// Crystal's story milestones from issue #85: a step a fight ends, steps by first visit, a step that
// needs another one before it, and the last cave.

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { objectivesOf } from "../../mcp-server/report.mjs";
// @ts-expect-error plain ESM module without type declarations
import { GEN2 } from "../../mcp-server/games/gen2.mjs";

let t = 0;
const at = (map: string, extra: object = {}) => ({ where: `SOMEWHERE [${map}] x1 y1 | battle: none`, playTime: `1:00:${String(++t).padStart(2, "0")}`, ...extra });
const won = (trainerClass: number, number: number) => ({ fight: { trainerClass, number, result: "won" } });
const reached = (calls: object[]) => Object.keys(objectivesOf(calls, GEN2));

describe("Crystal's story milestones", () => {
  it("counts the well cleared when its last grunt is beaten there, not on entering it", () => {
    expect(reached([at("SLOWPOKE_WELL_B1F")])).not.toContain("well");
    expect(reached([at("SLOWPOKE_WELL_B1F", won(0x1f, 2))])).not.toContain("well"); // another grunt
    expect(reached([at("SLOWPOKE_WELL_B1F", { fight: { trainerClass: 0x1f, number: 1, result: "lost" } })])).not.toContain("well");
    expect(reached([at("ROUTE_32", won(0x1f, 1))])).not.toContain("well"); // the same grunt elsewhere
    expect(reached([at("SLOWPOKE_WELL_B1F", won(0x1f, 1))])).toContain("well");
    // The win's script warps the player to the house in town: the call ends there.
    expect(reached([at("KURTS_HOUSE", won(0x1f, 1))])).toContain("well");
  });

  it("counts the roadblock passed on reaching the fourth gym's town", () => {
    expect(reached([at("ROUTE_36")])).not.toContain("roadblock");
    expect(reached([at("ECRUTEAK_CITY")])).toContain("roadblock");
  });

  it("counts the medicine taken up only at the lighthouse top after the island", () => {
    const first = [at("OLIVINE_LIGHTHOUSE_6F")];
    expect(reached(first)).toEqual(expect.arrayContaining(["lighthouse"]));
    expect(reached(first)).not.toContain("medicine");
    // On the island, then up again.
    const back = [...first, at("CIANWOOD_CITY"), at("OLIVINE_LIGHTHOUSE_6F")];
    expect(reached(back)).toEqual(expect.arrayContaining(["lighthouse", "island", "medicine"]));
    // The island first, the lighthouse once: up there with the medicine, both at that call.
    expect(reached([at("CIANWOOD_CITY"), at("OLIVINE_LIGHTHOUSE_6F")])).toEqual(expect.arrayContaining(["lighthouse", "island", "medicine"]));
  });

  it("counts the medicine from one call when the island was reached before it (the server checks one call at a time; review of #107)", () => {
    const up = [at("OLIVINE_LIGHTHOUSE_6F")];
    expect(Object.keys(objectivesOf(up, GEN2, new Set(["lighthouse"])))).not.toContain("medicine");
    expect(Object.keys(objectivesOf(up, GEN2, new Set(["lighthouse", "island"])))).toContain("medicine");
  });

  it("counts the last cave on first entering it", () => {
    expect(reached([at("VICTORY_ROAD")])).toContain("lastCave");
  });

  it("has 30 milestones, 8 of them badges, ending at the Champion", () => {
    expect(GEN2.objectives).toHaveLength(30);
    expect(GEN2.objectives.filter((o: { badges?: number }) => o.badges)).toHaveLength(8);
    expect(GEN2.objectives.at(-1).id).toBe("champion");
  });
});
