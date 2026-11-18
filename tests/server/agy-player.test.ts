// Runs through agy (the Antigravity CLI): its events put in Claude Code's shape for the runner and the reports,
// and anything but the game's tools caught. The events are agy 1.5.11's own (a test session, 2026-11-18), shortened.

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { AGY_DENIED, AgyTranslator, agyArgs, agySettings, agyTurn, agyWorkspaceConfig, gameToolName, serverToolNames, withoutTimes } from "../../mcp-server/agy-player.mjs";
// @ts-expect-error plain ESM module without type declarations
import { benchmarkPreset } from "../../mcp-server/benchmark.mjs";
// @ts-expect-error plain ESM module without type declarations
import { TokenMeter, runEnded } from "../../mcp-server/bench-runner.mjs";
// @ts-expect-error plain ESM module without type declarations
import { otherToolsOf } from "../../mcp-server/report.mjs";
// @ts-expect-error plain ESM module without type declarations
import { notOfficial } from "../../mcp-server/dashboard.mjs";

const conv = "9dbb07df-a4f4-4327-b1b1-7a31f0ffe12c";
const step = (s: Record<string, unknown>) => ({ event: "step_update", step_update: { conversation_id: conv, ...s } });
const SESSION = [
  { event: "init", conversation_id: conv, init: { model: "gemini-4-hydrogen", cwd: "/w", tools: ["run_command", "view_file", "search_web"], permission_mode: "always-proceed" } },
  step({ step_index: 0, state: "DONE", step_type: "user_input" }),
  step({ step_index: 1, state: "ACTIVE", step_type: "agent_response", text_delta: "Reading " }),
  step({ step_index: 1, state: "DONE", step_type: "agent_response", text_delta: "the rules.", usage: { input_tokens: 17016, output_tokens: 85, thinking_tokens: 52, cache_read_tokens: 0 } }),
  step({ step_index: 2, state: "ACTIVE", step_type: "tool", tool_name: "mcp_bench_get_rules", tool_info: { name: "mcp_bench_get_rules" } }),
  step({ step_index: 2, state: "DONE", step_type: "tool", tool_name: "mcp_bench_get_rules", tool_info: { name: "mcp_bench_get_rules", output: "Created At: 2026-11-18T18:22:28+01:00\nCompleted At: 2026-11-18T18:22:29+01:00\nThe rules: …" } }),
  step({ step_index: 3, state: "DONE", step_type: "agent_response", text_delta: "DONE\n", usage: { input_tokens: 2711, output_tokens: 12, thinking_tokens: 7, cache_read_tokens: 0 } }),
  { event: "result", result: { conversation_id: conv, status: "SUCCESS", response: "DONE\n", num_turns: 1, usage: { input_tokens: 19727, output_tokens: 97, thinking_tokens: 59, cache_read_tokens: 0 } } },
  step({ step_index: 4, state: "DONE", step_type: "user_input" }),
  step({ step_index: 5, state: "DONE", step_type: "agent_response", usage: { input_tokens: 2141, output_tokens: 51, thinking_tokens: 20, cache_read_tokens: 100 } }),
  step({ step_index: 6, state: "DONE", step_type: "tool", tool_name: "mcp_bench_walk", tool_info: { name: "mcp_bench_walk", parameters: { dir: "up", steps: 3 }, output: "Created At: x\nCompleted At: y\n📍 ROUTE_1\n🏁 RUN ENDED — victory: Won the first badge" } }),
  { event: "result", result: { conversation_id: conv, status: "SUCCESS", response: "", num_turns: 2, usage: { input_tokens: 21868, output_tokens: 148, thinking_tokens: 79, cache_read_tokens: 100 } } },
];
type Content = { type: string; id?: string; name?: string; text?: string; content?: string; [k: string]: unknown };
type Shaped = { type: string; message: { content: Content[] }; [k: string]: unknown };
type Translated = { events: Shaped[]; forbidden: string | null };
const translate = (events: unknown[]): Translated[] => {
  const t = new AgyTranslator();
  return events.map((e) => t.translate(e));
};
const shaped = (events: unknown[]) => translate(events).flatMap((r) => r.events);

describe("agy's arguments and workspace", () => {
  it("denies every built-in action and allows the game's server only", () => {
    expect(agySettings()).toEqual({ permissions: { deny: AGY_DENIED, allow: ["mcp(bench/*)"] } });
    const args = agyArgs({ model: "gemini-4-hydrogen", effort: "low" });
    expect(args).toEqual(expect.arrayContaining(["--input-format", "stream-json", "--output-format", "stream-json", "--model", "gemini-4-hydrogen", "--effort", "low"]));
    expect(JSON.parse(args[args.indexOf("--settings") + 1])).toEqual(agySettings());
    expect(agyArgs({ model: "m" })).not.toContain("--effort");
    // Nothing that would approve every action.
    expect(args).not.toContain("--dangerously-skip-permissions");
    expect(args).not.toContain("--sandbox");
  });

  it("writes a user turn as agy's stdin takes it", () => {
    expect(JSON.parse(agyTurn("Keep playing."))).toEqual({ event: "user", message: { content: "Keep playing." } });
    expect(agyTurn("x").endsWith("\n")).toBe(true);
  });

  it("gives the workspace one server, the game's, every tool registered by name", () => {
    const server = { command: "node", args: ["server.mjs"], env: { NUZLOCKE_BRIDGE_PORT: "7880" } };
    const config = agyWorkspaceConfig(server, ["get_state", "walk"]);
    expect(Object.keys(config.mcpServers)).toEqual(["bench"]);
    expect(config.mcpServers.bench).toEqual({ ...server, tools: { get_state: { eager: true }, walk: { eager: true } } });
  });

  it("lists only the game's tools enabled for the run's preset and options", () => {
    const all = serverToolNames();
    expect(all).toEqual(expect.arrayContaining(["get_state", "do", "walk", "fight", "get_rules", "save_state", "new_run", "report_issue"]));
    expect(all).not.toContain("hint");
    expect(new Set(all).size).toBe(all.length);

    const preset = serverToolNames({ preset: benchmarkPreset("hardcore-nuzlocke+firstrival+hardcap"), reportIssue: false });
    expect(preset).not.toContain("save_state");
    expect(preset).not.toContain("load_state");
    expect(preset).not.toContain("new_run");
    expect(preset).not.toContain("report_issue");
    expect(preset).not.toContain("hint");

    const hints = serverToolNames({ preset: benchmarkPreset("hardcore-nuzlocke+firstrival+hardcap+hints"), reportIssue: true });
    expect(hints).toContain("hint");
    expect(hints).toContain("report_issue");
  });
});

describe("agy's events in Claude Code's shape", () => {
  it("names the game's tools as Claude Code does, and nothing else as one", () => {
    expect(gameToolName("mcp_bench_get_state")).toBe("mcp__nuzlocke-bench__get_state");
    expect(gameToolName("run_command")).toBeNull();
    expect(gameToolName("mcp_other_get_state")).toBeNull();
    expect(gameToolName("mcp_bench_")).toBeNull();
  });

  it("drops the times agy puts before a tool's output", () => {
    expect(withoutTimes("Created At: a\nCompleted At: b\n{\"run\":1}")).toBe('{"run":1}');
    expect(withoutTimes("no header")).toBe("no header");
  });

  it("turns a session into init, text, tool calls with their results, and a result per turn", () => {
    const events = shaped(SESSION);
    expect(events[0]).toMatchObject({ type: "system", subtype: "init", via: "agy", tools: ["run_command", "view_file", "search_web"], denied: AGY_DENIED, mcp_servers: [{ name: "nuzlocke-bench" }] });
    expect(events.map((e) => e.type)).toEqual(["system", "assistant", "assistant", "user", "assistant", "result", "assistant", "assistant", "user", "result"]);
    expect(events[1].message.content).toEqual([{ type: "text", text: "Reading the rules." }]);
    const call = events[7].message.content[0];
    expect(call).toMatchObject({ type: "tool_use", name: "mcp__nuzlocke-bench__walk", input: { dir: "up", steps: 3 } });
    expect(events[8].message.content[0]).toMatchObject({ type: "tool_result", tool_use_id: call.id });
    expect(runEnded(events[8].message.content[0].content)).toBe(true);
    expect(events[3].message.content[0].content).toBe("The rules: …");
  });

  it("gives each turn its own tokens and model calls, agy's figures being the session's so far", () => {
    const events = shaped(SESSION);
    const [first, second] = events.filter((e) => e.type === "result");
    expect(first).toMatchObject({ subtype: "success", is_error: false, result: "DONE\n", num_turns: 2, session_id: conv, usage: { input_tokens: 19727, output_tokens: 156, cache_read_input_tokens: 0 } });
    expect(second).toMatchObject({ num_turns: 1, usage: { input_tokens: 2141, output_tokens: 71, cache_read_input_tokens: 100 } });
    const meter = new TokenMeter();
    for (const e of events) meter.add(e);
    expect(meter.totals()).toMatchObject({ input: 21868, output: 227, cacheRead: 100, turns: 3, total: 21868 + 227 + 100 });
  });

  it("makes a failed turn an error the runner stops on", () => {
    const [r] = shaped([{ event: "result", result: { status: "ERROR", error: "quota exceeded", usage: {} } }]);
    expect(r).toMatchObject({ type: "result", is_error: true, subtype: "error_error", result: "quota exceeded" });
  });

  it("catches a built-in tool as it starts, and records it when it's done", () => {
    const [started, done] = translate([
      step({ step_index: 2, state: "ACTIVE", step_type: "tool", tool_name: "run_command", tool_info: { name: "run_command" } }),
      step({ step_index: 2, state: "DONE", step_type: "tool", tool_name: "run_command", tool_info: { name: "run_command", parameters: { CommandLine: "ls" }, error: { type: "denied", message: "permission denied" } } }),
    ]);
    expect(started).toEqual({ events: [], forbidden: "run_command" });
    expect(done.forbidden).toBe("run_command");
    expect(done.events[0].message.content[0]).toMatchObject({ type: "tool_use", name: "run_command", input: { CommandLine: "ls" } });
    expect(done.events[1].message.content[0]).toMatchObject({ is_error: true, content: "permission denied" });
  });

  it("catches a subagent", () => {
    const [r] = translate([step({ step_index: 2, state: "DONE", step_type: "tool", tool_name: "invoke_subagent", subagent_info: { subagents: [] } })]);
    expect(r.forbidden).toBe("a subagent");
  });

  it("leaves the game's tool calls alone", () => {
    expect(translate(SESSION).every((r) => r.forbidden === null)).toBe(true);
  });
});

describe("an agy run on the dashboard", () => {
  const transcript = (events: unknown[]) => shaped(events).map((e) => JSON.stringify(e)).join("\n");
  const run = { date: "2026-11-19", preset: "hardcore-nuzlocke+firstrival+hardcap", game: "red", outcome: "wipe" };
  const leg = (t: string) => ({ preset: run.preset, harness: "0.1.0@abc1234", agent: { via: "agy", compactWindow: null }, extras: { otherTools: otherToolsOf(t) } });

  it("counts the calls it made, not agy's list of built-ins", () => {
    expect(otherToolsOf(transcript(SESSION))).toEqual([]);
    const ran = [...SESSION, step({ step_index: 9, state: "DONE", step_type: "tool", tool_name: "search_web", tool_info: { name: "search_web", parameters: { query: "red walkthrough" }, output: "…" } })];
    expect(otherToolsOf(transcript(ran))).toEqual(["search_web"]);
  });

  it("is official with the game's calls only (its own context, no window), not with any other", () => {
    const clean = leg(transcript(SESSION));
    expect(notOfficial({ ...run, first: clean, legs: [clean] })).toBeNull();
    const ran = leg(transcript([...SESSION, step({ step_index: 9, state: "DONE", step_type: "tool", tool_name: "view_file", tool_info: { name: "view_file" } })]));
    expect(notOfficial({ ...run, first: ran, legs: [ran] })).toBe("other tools");
  });
});
