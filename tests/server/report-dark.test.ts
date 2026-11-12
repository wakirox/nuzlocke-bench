// The report's dark tunnel milestone.

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { darkTunnelOf, darkTunnelTable } from "../../mcp-server/report.mjs";

const at = (map: string, extra: Record<string, unknown> = {}, coords = "") => ({
  tool: "walk", args: {}, where: `SOMEWHERE [${map}]${coords} | battle: none`, deaths: 0, ...extra,
});
const OUTSIDE = at("ROUTE_10", {}, " x8 y18");
const DARK = at("ROCK_TUNNEL_1F");
const PAST = at("LAVENDER_TOWN", {}, " x1 y1");

describe("darkTunnelOf", () => {
  it("is null for a run that never got there", () => {
    expect(darkTunnelOf([OUTSIDE])).toBeNull();
  });

  it("counts a crossing in the dark, with trips out and deaths inside", () => {
    const calls = [OUTSIDE, DARK, OUTSIDE, at("ROCK_TUNNEL_B1F", { deaths: 2 }), { ...PAST, deaths: 2 }, OUTSIDE];
    expect(darkTunnelOf(calls)).toEqual({ result: "crossed in the dark", calls: 3, deaths: 2, flashAt: null });
  });

  it("says when light was used, counted from the first call inside", () => {
    const flash = at("ROCK_TUNNEL_1F", { tool: "field_move", args: { move: "FLASH" } }, " x15 y3");
    expect(darkTunnelOf([OUTSIDE, DARK, DARK, flash, PAST])).toMatchObject({ result: "crossed with light", flashAt: 3 });
  });

  it("doesn't count a failed Flash", () => {
    const failed = at("ROCK_TUNNEL_1F", { tool: "field_move", args: { move: "FLASH" }, error: "Nobody can" });
    expect(darkTunnelOf([DARK, failed, PAST])).toMatchObject({ result: "crossed in the dark", flashAt: null });
  });

  it("reports a run that ended inside", () => {
    expect(darkTunnelOf([DARK, DARK])).toMatchObject({ result: "not crossed", calls: 2 });
  });

  it("marks runs whose tools ignored the dark", () => {
    const lit = at("ROCK_TUNNEL_1F", {}, " x15 y3");
    expect(darkTunnelOf([lit, PAST])).toMatchObject({ result: "lit tools" });
  });
});

describe("darkTunnelTable", () => {
  it("lists only the runs that reached it", () => {
    const text = darkTunnelTable([
      { name: "a", darkTunnel: { result: "crossed in the dark", calls: 90, deaths: 1, flashAt: null } },
      { name: "b", darkTunnel: null },
    ]);
    expect(text).toContain("| a | crossed in the dark | 90 | 1 |  |");
    expect(text).not.toContain("| b |");
  });

  it("is empty when no run did", () => {
    expect(darkTunnelTable([{ name: "b", darkTunnel: null }])).toBe("");
  });
});
