// bench:report's milestone table: a table per game, each on its own milestones.

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { objectivesTable } from "../../mcp-server/report.mjs";

const agent = { model: "claude-sonnet-5-5", effort: "medium" };

describe("the milestone table by game", () => {
  it("gives a Crystal run Crystal's milestones, in a table of its own beside Red's", () => {
    const table = objectivesTable([
      { name: "a", preset: "p", agent, game: "red", objectives: { rival1: "0:10:00" } },
      { name: "b", preset: "p", agent, game: "crystal", objectives: { rival1: "0:12:00" } },
    ]);
    const [red, crystal] = table.split("**Crystal**");
    expect(red).toMatch(/^\*\*Red\*\*/);
    expect(red).toContain("| Cottage past the bridge |");
    expect(crystal).toContain("| Past the roadblock tree |");
    expect(crystal).not.toContain("Cottage past the bridge");
    expect(crystal).toMatch(/stopped before: Badge 1 1/);
  });

  it("is one table with no heading for one game, as before", () => {
    const table = objectivesTable([{ name: "b", preset: "p", agent, game: "crystal", objectives: {} }]);
    expect(table).toMatch(/^\| Objective \|/);
    expect(table).toContain("| The well's gang cleared |");
  });
});
