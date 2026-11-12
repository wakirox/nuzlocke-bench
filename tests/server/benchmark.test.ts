// Benchmark presets and the results report.

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { PRESETS, applyPreset, benchmarkPreset, presetId, withDefaultOptions } from "../../mcp-server/benchmark.mjs";
// @ts-expect-error plain ESM module without type declarations
import { attempts, capsFromTranscript, capsTable, contextStats, firstRivalFromCalls, details, parseLog, playStats, playTable, runExtras, splitsTable, summarize, table } from "../../mcp-server/report.mjs";
// @ts-expect-error plain ESM module without type declarations
import { logEntry } from "../../mcp-server/run-log.mjs";

describe("benchmark presets", () => {
  it("are all Hardcore Nuzlocke", () => {
    for (const p of Object.values(PRESETS) as { ruleset: string }[]) expect(p.ruleset).toBe("nuzlocke");
  });

  it("fix new_run's ruleset and options", () => {
    const p = benchmarkPreset("hardcore-nuzlocke+hardcap");
    expect(applyPreset(p, {})).toMatchObject({ mode: "nuzlocke", rare_candies: true, hard_level_caps: true, end_on_violation: true });
    expect(applyPreset(p, { mode: "nuzlocke", hard_level_caps: true })).toMatchObject({ hard_level_caps: true });
  });

  it("refuse a run that would leave the benchmark's conditions", () => {
    const p = benchmarkPreset("hardcore-nuzlocke");
    expect(() => applyPreset(p, { mode: "other" })).toThrow(/fixes mode = nuzlocke/);
    expect(() => applyPreset(p, { rare_candies: false })).toThrow(/fixes rare_candies/);
    expect(() => applyPreset(p, { lenient_rules: ["nickname"] })).toThrow(/fixes lenient_rules/);
    expect(applyPreset(p, { lenient_rules: [] })).toMatchObject({ lenient_rules: [] });
    expect(() => applyPreset(p, { goal_badges: 1 })).toThrow(/fixes goal_badges/);
  });

  it("include a short run won by the first badge, under the same rules", () => {
    const short = applyPreset(benchmarkPreset("hardcore-nuzlocke-badge1"), {});
    const full = applyPreset(benchmarkPreset("hardcore-nuzlocke"), {});
    expect(short.goal_badges).toBe(1);
    expect(full.goal_badges).toBeNull();
    expect({ ...short, goal_badges: null }).toEqual(full);
  });

  it("take options on top, named in the preset id", () => {
    expect(presetId("hardcore-nuzlocke", ["hardcap"])).toBe("hardcore-nuzlocke+hardcap");
    expect(presetId("hardcore-nuzlocke+hardcap", ["firstrival", "hardcap"])).toBe("hardcore-nuzlocke+firstrival+hardcap");
    const p = benchmarkPreset("hardcore-nuzlocke+hardcap+firstrival");
    expect(p.id).toBe("hardcore-nuzlocke+firstrival+hardcap");
    expect(applyPreset(p, {})).toMatchObject({ hard_level_caps: true, first_rival_free: true, goal_badges: null });
    expect(applyPreset(benchmarkPreset("hardcore-nuzlocke-badge1+hardcap"), {})).toMatchObject({ hard_level_caps: true, goal_badges: 1 });
    expect(() => benchmarkPreset("hardcore-nuzlocke+fast")).toThrow(/Unknown preset option "fast"/);
    expect(presetId("hardcore-nuzlocke+locked", ["locked"])).toBe("hardcore-nuzlocke+locked"); // once
  });

  it("get hard caps and a free first rival battle by default, each turned off with no<option>", () => {
    expect(presetId("hardcore-nuzlocke", withDefaultOptions([]))).toBe("hardcore-nuzlocke+firstrival+hardcap");
    expect(presetId("hardcore-nuzlocke", withDefaultOptions(["hardcap"]))).toBe("hardcore-nuzlocke+firstrival+hardcap");
    expect(presetId("hardcore-nuzlocke", withDefaultOptions(["nohardcap"]))).toBe("hardcore-nuzlocke+firstrival");
    expect(presetId("hardcore-nuzlocke-badge1", withDefaultOptions([" nohardcap", "nofirstrival"]))).toBe("hardcore-nuzlocke-badge1");
    expect(() => withDefaultOptions(["nofast"])).toThrow(/Unknown preset option "nofast"/);
  });

  it("change nothing without a preset, and reject unknown ones", () => {
    expect(applyPreset(null, { mode: "nuzlocke", goal_badges: 2 })).toEqual({ mode: "nuzlocke", goal_badges: 2 });
    expect(benchmarkPreset(undefined)).toBeNull();
    expect(() => benchmarkPreset("nope")).toThrow(/Unknown benchmark preset/);
  });
});

describe("results report", () => {
  const text = (t: string) => ({ content: [{ type: "text", text: t }] });
  const entry = (n: number, tool: string, t: string, status: object | null, body = "📍 ROUTE_1 | battle: none") =>
    logEntry({ n, name: tool, args: {}, started: Date.parse(t), ended: Date.parse(t) + 500, result: text(body), status });
  const log = [
    { type: "session", t: "2026-10-11T10:00:00.000Z", benchmark: { id: "hardcore-nuzlocke" }, harness: { version: "0.1.0", commit: "abcdef1234" } },
    entry(1, "walk_to", "2026-10-11T10:00:00.000Z", { badges: 0, deaths: 0, violations: 0, playTime: "0:01:00" }),
    entry(2, "fight", "2026-10-11T10:30:00.000Z", { badges: 1, deaths: 1, violations: 0, playTime: "0:45:10" }),
    entry(3, "fight", "2026-10-11T11:00:00.000Z", { badges: 8, deaths: 2, violations: 0, playTime: "8:30:05" }, "📍 HALL_OF_FAME | battle: none\n🏁 RUN ENDED — victory: Became Champion with NOVA!"),
  ].map((l) => JSON.stringify(l)).join("\n");

  it("summarizes how a run went and what it cost", () => {
    const s = summarize(parseLog(log));
    expect(s).toMatchObject({
      preset: "hardcore-nuzlocke", harness: "0.1.0@abcdef1", outcome: "victory: Became Champion with NOVA!", victory: true,
      badges: 8, deaths: 2, violations: 0, playTime: "8:30:05", calls: 3, errors: 0, wallMs: 3_600_500, topTools: "fight×2, walk_to×1",
    });
  });

  it("records when each badge came, in game time and real time", () => {
    const s = summarize(parseLog(log));
    expect(s.splits[0]).toEqual({ badge: 1, call: 2, playTime: "0:45:10", wallMs: 1_800_500 });
    expect(s.splits).toHaveLength(8); // badges 2–8 arrived together in this made-up log
    expect(s.splits[7]).toMatchObject({ badge: 8, call: 3, playTime: "8:30:05" });
    expect(splitsTable([{ name: "run-1", ...s }])).toContain("0:45:10 (call 2, 0:30:01 real)");
  });

  it("splits a session into attempts at each successful new_run", () => {
    const lines = [
      entry(1, "walk", "2026-10-11T10:00:00.000Z", { badges: 1, deaths: 3 }, "📍 ROUTE_3 | battle: trainer\n🏁 RUN ENDED — wipe: Team wiped by ROCKMON Lv14"),
      entry(2, "new_run", "2026-10-11T10:05:00.000Z", null, '{"run":{"attempt":2}}'),
      entry(3, "walk", "2026-10-11T10:06:00.000Z", { badges: 0, deaths: 0 }),
    ].map((l) => JSON.stringify(l)).join("\n");
    const runs = attempts(parseLog(lines)).map(summarize);
    expect(runs.map((r: { outcome: string; badges: number; deaths: number; calls: number }) => [r.outcome, r.badges, r.deaths, r.calls])).toEqual([
      ["wipe: Team wiped by ROCKMON Lv14", 1, 3, 1],
      ["unfinished", 0, 0, 2],
    ]);
  });

  it("doesn't count a victory with violations", () => {
    const won = JSON.stringify(entry(1, "fight", "2026-10-11T10:00:00.000Z", { badges: 8, deaths: 0, violations: 2 },
      "📍 HALL_OF_FAME | battle: none\n🏁 RUN ENDED — victory: Became Champion with NOVA!"));
    const s = summarize(parseLog(won));
    expect(s.victory).toBe(false);
    expect(table([{ name: "r", ...s }])).toContain("doesn't count: 2 violations");
  });

  it("recognizes a disqualified run", () => {
    const dq = JSON.stringify(entry(1, "use_item", "2026-10-11T10:00:00.000Z", { badges: 2, deaths: 0, violations: 1 },
      "📍 ROUTE_3 | battle: trainer\n🏁 RUN ENDED — disqualified: Disqualified: Used TONIC in battle"));
    expect(summarize(parseLog(dq))).toMatchObject({ disqualified: true, victory: false });
  });

  it("calls a log without an ending unfinished", () => {
    const s = summarize(parseLog(JSON.stringify(entry(1, "walk", "2026-10-11T10:00:00.000Z", null))));
    expect(s).toMatchObject({ outcome: "unfinished", victory: false, preset: null, badges: 0 });
  });

  it("reports Rare Candies and level caps, as the page last counted them", () => {
    const lines = [
      entry(1, "rare_candy", "2026-10-11T10:00:00.000Z", { candies: 6, candiedToCap: 1, overCap: 0, capViolations: 0 }),
      entry(2, "fight", "2026-10-11T10:05:00.000Z", { candies: 6, candiedToCap: 1, overCap: 1, capViolations: 0 },
        "📍 ROUTE_3 | battle: none\n🏁 RUN ENDED — lost: No Pokémon left that may battle (ROUTE 3): NOVA Lv15 is over the cap"),
    ].map((l) => JSON.stringify(l)).join("\n");
    const s = summarize(parseLog(lines));
    expect(s.caps).toEqual({ candies: 6, candiedToCap: 1, overCap: 1, capViolations: 0 });
    expect(s.outcome).toMatch(/^lost: No Pokémon left/);
    const old = summarize(parseLog(log));
    expect(capsTable([{ name: "old", ...old }])).toBe("");
    expect(capsTable([{ name: "new", ...s }, { name: "old", ...old }]).split("\n").slice(2)).toEqual(["| new | 6 | — | 1 | 1 | 0 |", "| old | — | — | — | — | — |"]);
  });

  it("reads Rare Candies and level caps back from a transcript, with the room left at each use", () => {
    const use = (id: string, name: string, input: Record<string, unknown>) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id, name: `mcp__nuzlocke-bench__${name}`, input }] } });
    const res = (id: string, text: string, isError = false) => JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text }], is_error: isError }] } });
    const transcript = [
      use("a", "rare_candy", { slot: 1, level: 14 }),
      res("a", "Messages:\n  • SHELL grew to level 13\n  • SHELL grew to level 14\n  • SHELL is Lv14."),
      use("b", "rare_candy", { slot: "x" }),
      res("b", "MCP error -32602: Input validation error", true), // refused: not in the run log
      use("c", "rare_candy", { slot: 2, level: 18 }),
      res("c", "Messages:\n  • TALON grew to level 18\n  • TALON is Lv18."),
      use("d", "fight", { move: 1 }),
      res("d", "Tracker:\n  📋 [warning] SHELL (SHELLMON) is Lv22, over the level cap (Lv21, Gym 2's highest) — it may stay in the party.\n  📋 [violation] SHELL (SHELLMON) Lv22 battled over the level cap (Lv21, Gym 2's highest)."),
    ].join("\n");
    const calls = [{ tool: "rare_candy", badges: 0 }, { tool: "rare_candy", badges: 1 }, { tool: "fight", badges: 1 }];
    expect(capsFromTranscript({ transcript, calls, levelCaps: { gyms: [14, 21], elite: [62] } }))
      .toEqual({ candies: 3, candiedToCap: 1, overCap: 1, capViolations: 1, roomLeft: [0, 3] });
    expect(capsTable([{ name: "r", caps: { candies: 3, candiedToCap: 1, overCap: 1, capViolations: 1, roomLeft: [0, 3, 0] } }]).split("\n")[2])
      .toBe("| r | 3 | 0×2, 3×1 (avg 1.0) | 1 | 1 | 1 |");
  });

  it("says how the first rival battle went, even when the firstrival option excused a loss", () => {
    const at = (map: string) => ({ where: `📍 X [${map}] x1 y1 | battle: none` });
    expect(firstRivalFromCalls([at("OAKS_LAB"), at("OAKS_LAB")], "wipe: Team wiped by FOEMON Lv5 at HOME TOWN (Building).")).toBe("lost");
    expect(firstRivalFromCalls([at("OAKS_LAB"), at("ROUTE_1")], "unfinished")).toBe("won");
    expect(firstRivalFromCalls([at("REDS_HOUSE_2F")], "unfinished")).toBeNull();
    const logged = summarize(parseLog([entry(1, "fight", "2026-10-11T10:00:00.000Z", { firstRival: "lost-free" })].map((l) => JSON.stringify(l)).join("\n")));
    expect(logged.firstRival).toBe("lost-free");
    const out = table([{ name: "r", ...logged }]);
    expect(out).toContain("lost the first rival battle (didn't count)");
    expect(playTable([{ name: "r", ...logged }])).toContain("| r | — | lost (didn't count: firstrival) |");
  });

  it("reads compactions and the largest context from the transcript", () => {
    const turn = (tokens: number, calls = 1) => JSON.stringify({ type: "assistant", message: {
      usage: { input_tokens: 10, cache_read_input_tokens: tokens, cache_creation_input_tokens: 0 },
      content: Array.from({ length: calls }, (_, i) => ({ type: "tool_use", id: `t${tokens}${i}`, name: "mcp__nuzlocke-bench__walk" })) } });
    const result = JSON.stringify({ type: "result", modelUsage: { "claude-sonnet-5-5[1m]": { contextWindow: 1000000 } } });
    const transcript = [turn(1000, 2), turn(900000), JSON.stringify({ type: "system", subtype: "compact_boundary", compact_metadata: { pre_tokens: 966971 } }), turn(5000), result].join("\n");
    const stats = contextStats(transcript);
    expect(stats).toEqual({ compactions: [{ afterCall: 3, tokens: 966971 }], peak: 900010, window: 1000000 });
    expect(contextStats("")).toEqual({ compactions: [], peak: null, window: null });
    expect(playTable([{ name: "r", extras: { context: stats } }])).toContain("| 1 (after call 3) | 900k of 1M |");
  });

  it("prints a Markdown table", () => {
    const out = table([{ name: "run-1", ...summarize(parseLog(log)) }]);
    expect(out.split("\n")[2]).toMatch(/^\| run-1 \| — \| hardcore-nuzlocke \| 0\.1\.0@abcdef1 \| victory: .* \| 8 \| 2 \| 0 \| 8:30:05 \| 3 \| 0 \| — \| — \| 1:00:01 \|/);
  });
});

describe("how a run was played", () => {
  const call = (n: number, tool: string, where?: string, args: object = {}) => ({ n, t: "2026-10-12T10:00:00.000Z", ms: 1, tool, args, where });

  it("counts the model's route book, notes, screenshots, the maps it saw and its longest stretch without a new one", () => {
    const p = playStats([
      call(1, "walk_to", "TOWN [TOWN_A] x1 y1 | battle: none"),
      call(2, "note_route", undefined, { from: "TOWN_A" }),
      call(3, "notes", undefined, { append: "a shop in the first town" }),
      call(4, "notes"), // reading them isn't writing
      call(5, "get_screen"),
      call(6, "walk_to", "TOWN [TOWN_A] x2 y1 | battle: none"),
      call(7, "walk_to", "ROAD [ROAD_1] x1 y1 | battle: none"),
      call(8, "go_to", "TOWN [TOWN_A] x1 y1 | battle: none"),
    ]);
    expect(p).toEqual({ mapsVisited: 2, furthest: "ROAD", longestStuck: 5, routesSaved: 1, routeTrips: 1, notesWritten: 1, screenshots: 1 });
  });

  it("reads the starter, catches, deaths and notes from the run's own files", () => {
    const transcript = String.raw`{"type":"user","content":"Messages:\n  • CLAUDE received\n  • a STARTERMON!\n  • RIVAL received\n  • a RIVALMON!"}`;
    const tracker = { pcHeals: 3, events: [
      { text: "Caught BIRDMON Lv4 at ROAD." },
      { text: "STARTY (STARTERMON) died (ROCKMON Lv14, GYM). It can never battle again; it goes to Box 12 by itself once you walk on." },
    ] };
    const x = runExtras({ tracker, transcript, notes: "Shop in town A.\n" });
    expect(x).toEqual({ starter: "STARTERMON", caught: ["BIRDMON Lv4 at ROAD"], deaths: ["STARTY (STARTERMON) died (ROCKMON Lv14, GYM)"], pcHeals: 3, fights: [], notes: "Shop in town A.", context: { compactions: [], peak: null, window: null }, rejected: 0 });
    const row = { name: "r1", play: { mapsVisited: 2, furthest: "ROAD", longestStuck: 5, routesSaved: 1, routeTrips: 1, notesWritten: 1, screenshots: 1 }, extras: x };
    expect(playTable([row])).toContain("| r1 | STARTERMON | — | 1 | 2 | ROAD | 5 | 1 / 1 | 1 | 1 | 3 | 0 | — |");
    expect(details([row])).toContain("> Shop in town A.");
  });
});
