// Unit tests for `selectPlayerDriver` and the `PlayerDriver` lifecycle (`prepare`, `start`, `provenance`).

import { chmodSync, createWriteStream, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { DriverConfigError, createAgyDriver, createClaudeDriver, selectPlayerDriver } from "../../mcp-server/player-drivers.mjs";

function makeScript(dir: string, name: string, body: string): string {
  const file = join(dir, name);
  writeFileSync(file, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(file, 0o755);
  return file;
}

describe("PlayerDriver selection and provenance", () => {
  it("selects claude-code, api, and agy drivers with consistent provenance shapes", () => {
    const claude = selectPlayerDriver({ model: "claude-haiku-5-5", effort: "medium", env: {} });
    expect(claude.exitLabel).toBe("claude");
    expect(claude.playerMeta()).toEqual({});
    expect(claude.provenance({ compactWindow: 200_000 })).toMatchObject({
      via: "claude-code",
      compactWindow: 200_000,
    });

    const openai = selectPlayerDriver({ api: "openai", model: "qwen3", env: { OPENAI_API_KEY: "k" } });
    expect(openai.exitLabel).toBe("session");
    expect(openai.provenance({ compactWindow: 0 })).toEqual({
      via: "api",
      api: "openai",
      baseUrl: "http://127.0.0.1:11434/v1",
      claudeVersion: null,
      compactWindow: null,
    });

    const agy = selectPlayerDriver({ agentKind: "agy", model: "gemini-4-hydrogen", modelGiven: true, env: {} });
    expect(agy.exitLabel).toBe("agy");
    expect(agy.playerMeta()).toEqual({ via: "agy" });
    expect(agy.provenance()).toMatchObject({
      via: "agy",
      claudeVersion: null,
      compactWindow: null,
    });
  });

  it("rejects incompatible CLI flag combinations with DriverConfigError", () => {
    expect(() => selectPlayerDriver({ api: "vertex", model: "m" })).toThrow(DriverConfigError);
    expect(() => selectPlayerDriver({ api: "openai", effort: "high", model: "m" })).toThrow(/--effort is Claude Code's/);
    expect(() => selectPlayerDriver({ agentKind: "codex", model: "m", modelGiven: true })).toThrow(/--agent takes agy/);
    expect(() => selectPlayerDriver({ api: "anthropic", agentKind: "agy", model: "m", modelGiven: true })).toThrow(/give one/);
    expect(() => selectPlayerDriver({ agentKind: "agy", model: "m", modelGiven: false })).toThrow(/Give agy's model/);
    expect(() => selectPlayerDriver({ agentKind: "agy", model: "m", modelGiven: true, compactWindowGiven: true })).toThrow(/agy keeps its own context/);
  });

  it("spawns claude via start(), streams JSONL to transcript/onEvent, and ignores late stdin writes after exit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "driver-claude-"));
    const claudeBin = makeScript(dir, "fake-claude.mjs", `
      if (process.argv.includes("--version")) { console.log("2.1.0 (Claude Code)"); process.exit(0); }
      import("node:readline").then(({ createInterface }) => {
        const rl = createInterface({ input: process.stdin });
        rl.on("line", (line) => {
          const msg = JSON.parse(line);
          console.log(JSON.stringify({ type: "result", subtype: "success", result: msg.message.content[0].text }));
          process.exit(0);
        });
      });
    `);

    const driver = createClaudeDriver({ model: "claude-haiku-5-5", effort: "low", env: { ...process.env, CLAUDE_BIN: claudeBin } });
    driver.prepare();
    expect(driver.provenance({ compactWindow: null }).claudeVersion).toBe("2.1.0 (Claude Code)");

    const transcriptFile = join(dir, "transcript.jsonl");
    const transcript = createWriteStream(transcriptFile);
    const events: Record<string, unknown>[] = [];
    const player = driver.start({
      configFile: join(dir, "mcp.json"),
      compactWindow: null,
      transcript,
      onEvent: (ev: Record<string, unknown>) => events.push(ev),
    });

    const exitCode = await new Promise<number | null>((resolve) => {
      player.onExit((code: number | null) => resolve(code));
      player.send("Play turn 1");
    });
    // Late nudge after exit must not throw or crash.
    expect(() => player.send("Late nudge")).not.toThrow();
    await new Promise<void>((r) => transcript.end(() => r()));

    expect(exitCode).toBe(0);
    expect(events).toEqual([{ type: "result", subtype: "success", result: "Play turn 1" }]);
    expect(readFileSync(transcriptFile, "utf8").trim()).toContain("Play turn 1");
  });

  it("prepares agy's workspace, writes eager MCP config, records agy-events.jsonl, and stops on a forbidden tool", async () => {
    const dir = mkdtempSync(join(tmpdir(), "driver-agy-"));
    const wsDir = join(dir, "ws");
    mkdirSyncWithMarker(wsDir);
    const agyBin = makeScript(dir, "fake-agy.mjs", `
      const args = process.argv.slice(2);
      if (args[0] === "--version") { console.log("agy 1.5.11"); process.exit(0); }
      if (args[0] === "mcp" && args[1] === "list") { console.log("No MCP servers configured."); process.exit(0); }
      import("node:readline").then(({ createInterface }) => {
        const rl = createInterface({ input: process.stdin });
        rl.once("line", () => {
          console.log(JSON.stringify({ event: "init", conversation_id: "c1", init: { model: "g", cwd: process.cwd(), tools: [] } }));
          console.log(JSON.stringify({ event: "step_update", step_update: { conversation_id: "c1", step_index: 1, state: "ACTIVE", step_type: "tool", tool_name: "run_command" } }));
        });
        process.on("SIGTERM", () => process.exit(0));
      });
    `);

    const driver = createAgyDriver({
      model: "gemini-4-hydrogen",
      effort: null,
      env: { ...process.env, AGY_BIN: agyBin, AGY_WORKSPACE: wsDir },
    });
    driver.prepare();
    expect(driver.provenance().agyVersion).toBe("agy 1.5.11");

    const runDir = join(dir, "run");
    mkdirSyncWithMarker(runDir);
    const transcriptFile = join(runDir, "transcript.jsonl");
    const transcript = createWriteStream(transcriptFile);
    const events: Record<string, unknown>[] = [];
    const stops: string[] = [];

    const player = driver.start({
      config: { mcpServers: { "nuzlocke-bench": { command: "node", args: ["s.mjs"], env: {} } } },
      preset: "hardcore-nuzlocke+firstrival+hardcap",
      reportIssue: false,
      runDir,
      transcript,
      onEvent: (ev: Record<string, unknown>) => events.push(ev),
      onStop: (reason: string) => {
        stops.push(reason);
        return stops.length === 1;
      },
    });

    await new Promise<number | null>((resolve) => {
      player.onExit((code: number | null) => resolve(code));
      player.send("Start");
    });
    await new Promise<void>((r) => transcript.end(() => r()));

    expect(stops).toEqual(["agy used run_command, not one of the game's tools"]);
    expect(events[0]).toMatchObject({ type: "system", subtype: "init", via: "agy" });
    const mcpCfg = JSON.parse(readFileSync(join(wsDir, ".agents", "mcp_config.json"), "utf8"));
    expect(mcpCfg.mcpServers.bench.tools.get_state).toEqual({ eager: true });
    expect(mcpCfg.mcpServers.bench.tools.report_issue).toBeUndefined();
    expect(readFileSync(join(runDir, "agy-events.jsonl"), "utf8")).toContain("run_command");
  });
});

function mkdirSyncWithMarker(dir: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".nuzlocke-bench-agy"), "ok\n");
}
