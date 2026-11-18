// bench-run.mjs --agent agy, with a stand-in for agy: the workspace it checks and fills, the run it records,
// and a run stopped for a tool that isn't the game's.

import { describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const rom = join(mkdtempSync(join(tmpdir(), "rom-")), "game.gb");
writeFileSync(rom, "not a real game");

/** A stand-in for agy: answers each turn with one tool call (`tool`), whose result ends the run. */
function fakeAgy({ tool = "mcp_bench_get_state", mcpList = "No MCP servers configured." } = {}) {
  const bin = join(mkdtempSync(join(tmpdir(), "fake-agy-")), "agy.cjs");
  writeFileSync(bin, `#!${process.execPath}
const a = process.argv.slice(2);
if (a[0] === "--version") { console.log("1.5.11"); process.exit(0); }
if (a[0] === "mcp") { console.log(${JSON.stringify(mcpList)}); process.exit(0); }
const fs = require("node:fs");
fs.writeFileSync("seen-args.json", JSON.stringify({ args: a, mcp: JSON.parse(fs.readFileSync(".agents/mcp_config.json", "utf8")) }));
const out = (e) => console.log(JSON.stringify(e));
const s = (x) => out({ event: "step_update", step_update: { conversation_id: "c1", ...x } });
out({ event: "init", conversation_id: "c1", init: { model: "m", cwd: process.cwd(), tools: ["run_command", "view_file"], permission_mode: "always-proceed" } });
let n = 0;
require("node:readline").createInterface({ input: process.stdin }).on("line", () => {
  n++;
  s({ step_index: n * 3, state: "DONE", step_type: "agent_response", text_delta: "Playing.", usage: { input_tokens: 100, output_tokens: 10 } });
  s({ step_index: n * 3 + 1, state: "ACTIVE", step_type: "tool", tool_name: ${JSON.stringify(tool)} });
  setTimeout(() => {
    s({ step_index: n * 3 + 1, state: "DONE", step_type: "tool", tool_name: ${JSON.stringify(tool)}, tool_info: { name: ${JSON.stringify(tool)}, output: "Created At: x\\nCompleted At: y\\n🏁 RUN ENDED — victory: Won the first badge" } });
    out({ event: "result", result: { conversation_id: "c1", status: "SUCCESS", response: "done", num_turns: n, usage: { input_tokens: 100 * n, output_tokens: 10 * n } } });
  }, 100);
});
process.on("SIGTERM", () => process.exit(143));
`);
  chmodSync(bin, 0o755);
  return bin;
}

/** A workspace agy was told to trust: the runner's marker in it, and leftovers from an earlier run. */
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), "agy-ws-"));
  writeFileSync(join(dir, ".nuzlocke-bench-agy"), "");
  writeFileSync(join(dir, "left-over.txt"), "from an earlier run");
  return dir;
}

const bench = (env: Record<string, string>, ...args: string[]) =>
  new Promise<{ code: number | null; out: string; err: string }>((done) => {
    const child = spawn(process.execPath, ["scripts/bench-run.mjs", "--rom", rom, "--agent", "agy", "--model", "gemini-4-hydrogen", "--effort", "low", "--port", "7998", ...args], {
      env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => done({ code, out, err }));
  });
const runOf = (runs: string) => join(runs, readdirSync(runs)[0]);
const transcriptOf = (dir: string) =>
  existsSync(join(dir, "transcript.jsonl.gz")) ? gunzipSync(readFileSync(join(dir, "transcript.jsonl.gz"))).toString() : readFileSync(join(dir, "transcript.jsonl"), "utf8");

describe("bench-run --agent agy", () => {
  it("plays in an emptied workspace with the game's server only, and records the run as via agy", async () => {
    const ws = workspace(), runs = mkdtempSync(join(tmpdir(), "runs-"));
    const r = await bench({ AGY_BIN: fakeAgy(), AGY_WORKSPACE: ws, NUZLOCKE_RUNS_DIR: runs });
    expect(r.err).not.toMatch(/ReferenceError|TypeError|SyntaxError/);
    const dir = runOf(runs);
    const agent = JSON.parse(readFileSync(join(dir, "agent.json"), "utf8"));
    expect(agent).toMatchObject({ via: "agy", model: "gemini-4-hydrogen", effort: "low", agyVersion: "1.5.11", agyMcpList: "No MCP servers configured.", compactWindow: null, claudeVersion: null, stopped: "the run is over" });
    expect(agent.agyDenied).toContain("command(*)");
    expect(JSON.parse(readFileSync(join(dir, "player.json"), "utf8")).via).toBe("agy");
    // The workspace: emptied, then the game's server as its only one.
    expect(existsSync(join(ws, "left-over.txt"))).toBe(false);
    const seen = JSON.parse(readFileSync(join(ws, "seen-args.json"), "utf8"));
    expect(Object.keys(seen.mcp.mcpServers)).toEqual(["bench"]);
    expect(seen.mcp.mcpServers.bench.env.NUZLOCKE_BRIDGE_PORT).toBe("7998");
    expect(seen.mcp.mcpServers.bench.tools.get_state).toEqual({ eager: true });
    expect(JSON.parse(seen.args[seen.args.indexOf("--settings") + 1]).permissions.allow).toEqual(["mcp(bench/*)"]);
    // The transcript in Claude Code's shape; agy's own events beside it.
    const t = transcriptOf(dir);
    expect(t).toContain('"via":"agy"');
    expect(t).toContain('"name":"mcp__nuzlocke-bench__get_state"');
    expect(readFileSync(join(dir, "agy-events.jsonl"), "utf8")).toContain('"event":"init"');
  }, 30000);

  it("stops the run when the model reaches for a tool that isn't the game's", async () => {
    const runs = mkdtempSync(join(tmpdir(), "runs-"));
    const r = await bench({ AGY_BIN: fakeAgy({ tool: "run_command" }), AGY_WORKSPACE: workspace(), NUZLOCKE_RUNS_DIR: runs });
    expect(r.out).toMatch(/agy used run_command, not one of the game's tools/);
    const agent = JSON.parse(readFileSync(join(runOf(runs), "agent.json"), "utf8"));
    expect(agent.stopped).toBe("agy used run_command, not one of the game's tools");
  }, 30000);

  it("won't start while agy has MCP servers of its own", async () => {
    const runs = mkdtempSync(join(tmpdir(), "runs-"));
    const r = await bench({ AGY_BIN: fakeAgy({ mcpList: "docs: npx docs-server (connected)" }), AGY_WORKSPACE: workspace(), NUZLOCKE_RUNS_DIR: runs });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/agy has MCP servers of its own/);
    expect(readdirSync(runs)).toEqual([]);
  });

  it("makes a new workspace and asks for it to be trusted first", async () => {
    const ws = join(mkdtempSync(join(tmpdir(), "agy-home-")), "agy-workspace");
    const r = await bench({ AGY_BIN: fakeAgy(), AGY_WORKSPACE: ws });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/Made agy's workspace.*trust/s);
    expect(readdirSync(ws)).toEqual([".nuzlocke-bench-agy"]);
  });

  it("won't empty a folder that isn't its own", async () => {
    const ws = mkdtempSync(join(tmpdir(), "not-a-workspace-"));
    mkdirSync(join(ws, "src"));
    const r = await bench({ AGY_BIN: fakeAgy(), AGY_WORKSPACE: ws });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/has other files \(src\)/);
    expect(existsSync(join(ws, "src"))).toBe(true);
  });

  it("refuses a run without --model, with --api, or with --compact-window", () => {
    const run = (...args: string[]) => spawnSync(process.execPath, ["scripts/bench-run.mjs", "--rom", rom, ...args], { encoding: "utf8" });
    expect(run("--agent", "agy").stderr).toMatch(/Give agy's model/);
    expect(run("--agent", "agy", "--model", "m", "--api", "openai").stderr).toMatch(/give one/);
    expect(run("--agent", "agy", "--model", "m", "--compact-window", "100").stderr).toMatch(/agy keeps its own context/);
    expect(run("--agent", "codex").stderr).toMatch(/--agent takes agy/);
  });
});
