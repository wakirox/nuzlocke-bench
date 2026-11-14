// The model's tools besides the game's, from the transcript (docs/benchmark.md, "Official results").

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { otherToolsOf } from "../../mcp-server/report.mjs";
// @ts-expect-error plain ESM module without type declarations
import { notOfficial } from "../../mcp-server/dashboard.mjs";

const init = (tools: string[], servers: string[] | null = ["nuzlocke-bench"]) =>
  JSON.stringify({ type: "system", subtype: "init", tools, ...(servers ? { mcp_servers: servers.map((name) => ({ name, status: "connected" })) } : {}) });
const turn = JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "\"init\"" }] } });
const game = ["mcp__nuzlocke-bench__get_state", "mcp__nuzlocke-bench__do"];

describe("otherToolsOf", () => {
  it("finds none in a run with the game's tools only", () => {
    expect(otherToolsOf([init(game), turn].join("\n"))).toEqual([]);
  });

  it("names any other tool or MCP server, at any session start", () => {
    const resumed = init([...game, "WebSearch", "mcp__docs__read"], ["nuzlocke-bench", "docs"]);
    expect(otherToolsOf([init(game), turn, resumed].join("\n"))).toEqual(["MCP server docs", "WebSearch", "mcp__docs__read"]);
  });

  it("takes an API run's tools by their own names, any MCP name being another server's", () => {
    expect(otherToolsOf(init(["get_state", "do"], null))).toEqual([]);
    expect(otherToolsOf(init(["get_state", "mcp__web__fetch"], null))).toEqual(["mcp__web__fetch"]);
  });

  it("is null when the transcript lists no tools", () => {
    expect(otherToolsOf(turn)).toBeNull();
    expect(otherToolsOf(null)).toBeNull();
  });
});

describe("official runs and the model's tools", () => {
  const run = { date: "2026-11-14", preset: "hardcore-nuzlocke+firstrival+hardcap", game: "red", outcome: "wipe" };
  const leg = (otherTools: unknown) => ({ preset: run.preset, harness: "0.1.0@abc1234", extras: { otherTools } });

  it("keeps a run with the game's tools official", () => {
    expect(notOfficial({ ...run, first: leg([]), legs: [leg([])] })).toBeNull();
  });

  it("marks a leg with other tools, or none on record", () => {
    expect(notOfficial({ ...run, first: leg([]), legs: [leg([]), leg(["WebSearch"])] })).toBe("other tools");
    expect(notOfficial({ ...run, first: leg(null), legs: [leg(null)] })).toBe("tools not on record");
    expect(notOfficial({ ...run, first: { preset: run.preset }, legs: [{ preset: run.preset, extras: null }] })).toBe("tools not on record");
  });
});
