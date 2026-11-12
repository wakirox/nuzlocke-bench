// bench-run.mjs reads every option before it starts anything: run it with a bad last-checked option
// and it must refuse that one cleanly (any error earlier in the option code fails here instead).

import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const rom = join(mkdtempSync(join(tmpdir(), "rom-")), "game.gb");
writeFileSync(rom, "not a real game");
const run = (...args: string[]) => spawnSync(process.execPath, ["scripts/bench-run.mjs", "--rom", rom, ...args], { encoding: "utf8" });

describe("bench-run's options", () => {
  it("get through every option check to the last one, with and without hints and --effectiveness", () => {
    for (const extra of [[], ["-o", "hints"], ["--effectiveness", "on"], ["--effectiveness", "off", "--api", "openai"]]) {
      const r = run(...extra, "--port", "1");
      expect(r.stderr).not.toMatch(/ReferenceError|TypeError|SyntaxError/);
      expect(r.stderr).toMatch(/--port takes a whole number/);
      expect(r.status).toBe(1);
    }
  });

  it("refuses an --observer that isn't a file", () => {
    expect(run("--observer", "/no/such/observer.mjs").stderr).toMatch(/--observer takes the path of an observer module/);
  });

  it("refuses a bad --effectiveness", () => {
    expect(run("--effectiveness", "maybe").stderr).toMatch(/--effectiveness takes on or off/);
  });

  // A folder as a reboot leaves it: saves, maybe a run log, no agent.json.
  const stoppedRun = (runLog: string | null) => {
    const dir = mkdtempSync(join(tmpdir(), "stopped-run-"));
    mkdirSync(join(dir, "saves"));
    writeFileSync(join(dir, "saves", "run.json"), "{}");
    if (runLog !== null) writeFileSync(join(dir, "run-log.jsonl"), runLog);
    return dir;
  };

  it("continues a run that left no agent.json under the preset its run log names", () => {
    const session = (id: string) => `${JSON.stringify({ type: "session", benchmark: { id } })}\n`;
    expect(run("--resume", stoppedRun(session("hardcore-nuzlocke+firstrival+hardcap")), "--port", "1").stderr).toMatch(/--port takes a whole number/);
    // Not the default preset in its place: a preset that doesn't exist is refused as such.
    expect(run("--resume", stoppedRun(session("no-such-preset")), "--port", "1").stderr).not.toMatch(/--port takes/);
  });

  it("refuses to continue a run that records no preset unless one is given", () => {
    expect(run("--resume", stoppedRun(null), "--port", "1").stderr).toMatch(/doesn't record its preset/);
    expect(run("--resume", stoppedRun(null), "--preset", "hardcore-nuzlocke", "--port", "1").stderr).toMatch(/--port takes a whole number/);
  });
});

describe("bench-run stopped by hand", () => {
  it("keeps that as why it stopped, whatever the model's process still prints", async () => {
    // A stand-in for the model's CLI: it waits, and on SIGTERM prints a last failed result.
    const bin = join(mkdtempSync(join(tmpdir(), "fake-cli-")), "cli.mjs");
    writeFileSync(bin, `#!${process.execPath}
if (process.argv.includes("--version")) { console.log("0.0.0"); process.exit(0); }
process.stdin.resume();
console.log(JSON.stringify({ type: "system", subtype: "init" }));
process.on("SIGTERM", () => {
  console.log(JSON.stringify({ type: "result", subtype: "success", is_error: true, result: "interrupted", num_turns: 1 }));
  process.exit(143);
});
`);
    chmodSync(bin, 0o755);
    const runs = mkdtempSync(join(tmpdir(), "runs-"));
    const child = spawn(process.execPath, ["scripts/bench-run.mjs", "--rom", rom, "--port", "7999"], { env: { ...process.env, CLAUDE_BIN: bin, NUZLOCKE_RUNS_DIR: runs }, stdio: ["ignore", "pipe", "pipe"] });
    // The fake CLI's first line is in the transcript once it's up: stop the run then.
    const made = () => readdirSync(runs);
    for (let i = 0; i < 100 && !(made()[0] && existsSync(join(runs, made()[0], "transcript.jsonl")) && readFileSync(join(runs, made()[0], "transcript.jsonl"), "utf8").includes("init")); i++) await new Promise((r) => setTimeout(r, 50));
    child.kill("SIGTERM");
    await new Promise((r) => child.on("close", r));
    const [id] = made();
    const agent = JSON.parse(readFileSync(join(runs, id, "agent.json"), "utf8"));
    expect(agent.stopped).toBe("stopped by hand (SIGTERM)");
    expect(agent.gaveUp).toBe(false);
    expect(JSON.parse(readFileSync(join(runs, id, "player.json"), "utf8"))).toMatchObject({ resumedFrom: null, playtest: false });
  }, 20000);
});
