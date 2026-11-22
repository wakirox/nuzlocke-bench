// Each game's milestones for the dashboard and the results: a run is read against its own game's.

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { GEN1, GEN2, objectivesByGame } from "../../mcp-server/games/index.mjs";
// @ts-expect-error plain ESM module without type declarations
import { renderDashboard } from "../../mcp-server/dashboard.mjs";
// @ts-expect-error plain ESM module without type declarations
import { stepCallsOf } from "../../mcp-server/capabilities.mjs";
// @ts-expect-error plain ESM module without type declarations
import { mergeResults } from "../../mcp-server/results.mjs";

const ids = (list: { id: string }[]) => list.map((o) => o.id);

describe("milestones by game", () => {
  it("lists every version's milestones, ids and labels only", () => {
    const by = objectivesByGame();
    for (const v of ["red", "blue", "yellow"]) expect(ids(by[v])).toEqual(ids(GEN1.objectives));
    expect(ids(by.crystal)).toEqual(ids(GEN2.objectives));
    expect(Object.keys(by.red[0])).toEqual(["id", "label"]);
  });

  it("puts them in the page's data and the results index, keeping objectives as Red's", () => {
    const page = renderDashboard("<script>const DATA = /*DATA*/null;</script>", [], "2026-11-22", "0.4.0");
    const data = JSON.parse(/const DATA = (.*);<\/script>/.exec(page)![1]);
    expect(ids(data.objectivesByGame.crystal)).toEqual(ids(GEN2.objectives));
    expect(ids(data.objectives)).toEqual(ids(GEN1.objectives));
    const index = mergeResults(null, "0.4.0", [], [], "2026-11-22");
    expect(ids(index.objectivesByGame.crystal)).toEqual(ids(GEN2.objectives));
  });

  it("orders a run's steps by its own game's story", () => {
    // Two Crystal milestones reached at the same call: story order breaks the tie, Crystal's.
    expect(Object.keys(stepCallsOf({ badge1: 10, rival1: 10 }, ["badge1", "rival1"], "crystal"))).toEqual(["rival1", "badge1"]);
  });
});
