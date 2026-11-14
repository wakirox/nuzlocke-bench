// The per-call run log the MCP server writes (mcp-server/run-log.mjs).

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { instrumentTools, logEntry } from "../../mcp-server/run-log.mjs";

type Handler = (...a: unknown[]) => Promise<unknown>;

/** Just enough of McpServer: registerTool stores the handler as the SDK would call it. */
function fakeServer() {
  const tools = new Map<string, Handler>();
  return {
    tools,
    registerTool(name: string, config: { inputSchema?: object }, cb: Handler) {
      tools.set(name, (args) => (config.inputSchema ? cb(args, {}) : cb({})));
    },
  };
}

const text = (t: string, extra: object = {}) => ({ content: [{ type: "text", text: t }], ...extra });

describe("run log", () => {
  it("writes one line per call with tool, args, timing, location and outcome", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "runlog-")), "nested", "run.jsonl");
    const server = fakeServer();
    let clock = 1_000;
    instrumentTools(server, { file, now: () => (clock += 250) });
    server.registerTool("walk", { inputSchema: {} }, async () => text("📍 ROUTE_1 (5,6) | battle: none\nScreen:\n"));
    server.registerTool("fight", { inputSchema: {} }, async () => text("📍 ROUTE_1 | battle: trainer\n🏁 RUN ENDED — wipe: Team wiped by ROCKMON Lv14"));
    server.registerTool("get_rules", {}, async () => text("rules…"));

    await server.tools.get("walk")!({ path: "U3" });
    await server.tools.get("fight")!({ move: 1 });
    await server.tools.get("get_rules")!({});

    const lines = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ n: 1, tool: "walk", args: { path: "U3" }, ms: 250, where: "ROUTE_1 (5,6) | battle: none" });
    expect(lines[1]).toMatchObject({ n: 2, tool: "fight", outcome: "wipe: Team wiped by ROCKMON Lv14" });
    expect(lines[2]).toMatchObject({ n: 3, tool: "get_rules", args: {} });
    expect(lines[0].error).toBeUndefined();
  });

  it("records the maps a call passed through (only when there were any), and hands them to onEntry", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "runlog-")), "run.jsonl");
    const server = fakeServer();
    const pending = [["ROUTE_4", "CERULEAN_CITY", "ROUTE_9"], []];
    const seen: unknown[] = [];
    instrumentTools(server, { file, mapsEntered: () => pending.shift() ?? [], onEntry: async (e: { maps?: string[] }) => void seen.push(e.maps) });
    server.registerTool("go_to", { inputSchema: {} }, async () => text("📍 ROUTE 9 [ROUTE_9] x1 y1 | battle: none"));
    await server.tools.get("go_to")!({ map: "ROUTE_9" });
    await server.tools.get("go_to")!({ map: "ROUTE_9" });
    const lines = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines[0].maps).toEqual(["ROUTE_4", "CERULEAN_CITY", "ROUTE_9"]);
    expect(lines[1].maps).toBeUndefined();
    expect(seen).toEqual([["ROUTE_4", "CERULEAN_CITY", "ROUTE_9"], undefined]);
  });

  it("hands each entry, once written, to onEntry, before the call returns; a failing onEntry doesn't fail the call", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "runlog-")), "run.jsonl");
    const server = fakeServer();
    const seen: unknown[] = [];
    instrumentTools(server, { file, onEntry: async (e: { where?: string }) => {
      seen.push(e.where);
      if (seen.length === 2) throw new Error("page gone");
    } });
    server.registerTool("walk", { inputSchema: {} }, async () => text("📍 CITY [CERULEAN_CITY] x3 y4 | battle: none"));
    await server.tools.get("walk")!({});
    expect(seen).toEqual(["CITY [CERULEAN_CITY] x3 y4 | battle: none"]);
    await expect(server.tools.get("walk")!({})).resolves.toBeTruthy();
    expect(readFileSync(file, "utf8").trim().split("\n")).toHaveLength(2);
  });

  it("puts a playtest report where the last result left the player", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "runlog-")), "run.jsonl");
    const server = fakeServer();
    instrumentTools(server, { file });
    server.registerTool("walk", { inputSchema: {} }, async () => text("📍 TOWN 2 [TOWN_2] x3 y4 | battle: none"));
    server.registerTool("report_issue", { inputSchema: {} }, async () => text("Reported (1 this run). Keep playing."));
    await server.tools.get("walk")!({});
    await server.tools.get("report_issue")!({ did: "a", expected: "b", happened: "c" });
    const [, report] = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(report).toMatchObject({ tool: "report_issue", where: "TOWN 2 [TOWN_2] x3 y4 | battle: none" });
  });

  it("logs errors and calls that threw, and still rethrows", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "runlog-")), "run.jsonl");
    const server = fakeServer();
    instrumentTools(server, { file });
    server.registerTool("press", { inputSchema: {} }, async () => text("No game is running.", { isError: true }));
    server.registerTool("boom", { inputSchema: {} }, async () => {
      throw new Error("kaput");
    });
    await server.tools.get("press")!({ buttons: "a" });
    await expect(server.tools.get("boom")!({})).rejects.toThrow("kaput");
    const [press, boom] = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(press.error).toBe("No game is running.");
    expect(boom.error).toBe("no result (threw)");
  });

  it("writes nothing when turned off", async () => {
    const server = fakeServer();
    instrumentTools(server, { file: null });
    server.registerTool("wait", { inputSchema: {} }, async () => text("ok"));
    await expect(server.tools.get("wait")!({ frames: 1 })).resolves.toEqual(text("ok"));
  });

  it("reads the outcome out of a get_state result and counts images", () => {
    const state = JSON.stringify({ run: { outcome: { kind: "victory", detail: "Became Champion" } } }, null, 1);
    expect(logEntry({ n: 1, name: "get_state", args: {}, started: 0, ended: 5, result: text(state) }).outcome).toBe("victory: Became Champion");
    const shot = { content: [{ type: "image", data: "", mimeType: "image/png" }, { type: "text", text: "x" }] };
    expect(logEntry({ n: 2, name: "get_screen", args: {}, started: 0, ended: 1, result: shot })).toMatchObject({ images: 1, chars: 1 });
  });
});
