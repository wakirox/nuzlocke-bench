// Strategy drivers for the three ways `scripts/bench-run.mjs` can run a model:
//   - `claude-code`: `claude -p` in an empty temporary folder
//   - `agy`: Antigravity CLI (`agy`) in its dedicated workspace with built-ins denied
//   - `api`: `DirectSession` straight against an OpenAI or Anthropic HTTP endpoint
//
// `selectPlayerDriver` validates mutually exclusive CLI flags and picks a driver; each driver
// implements `prepare` → `playerMeta` → `start` → `provenance` (plus `exitLabel`) so `bench-run.mjs`
// owns only option parsing, the nudge/token loop, and summary writing.

import { execFileSync, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { AGY_DENIED, AgyTranslator, agyArgs, agyTurn, agyWorkspaceConfig } from "./agy-player.mjs";
import { claudeArgs, runnerEnv, userTurn } from "./bench-runner.mjs";
import { benchmarkPreset } from "./benchmark.mjs";
import { DirectSession } from "./direct-session.mjs";
import { activeToolNames } from "./tool-catalog.mjs";

export class DriverConfigError extends Error {}

/**
 * Picks and validates the `PlayerDriver` for the CLI flags given (`--api` vs `--agent` vs default Claude Code).
 * Throws `DriverConfigError` with user-facing CLI guidance on invalid flag combinations.
 */
export function selectPlayerDriver({
  api = null,
  agentKind = null,
  model,
  modelGiven = false,
  effort = null,
  compactWindowGiven = false,
  baseUrlOpt = null,
  maxOutput = 16384,
  env = process.env,
}) {
  if (api !== null && api !== "openai" && api !== "anthropic") {
    throw new DriverConfigError("--api takes openai or anthropic.");
  }
  if (api && effort) {
    throw new DriverConfigError("--effort is Claude Code's; it isn't sent with --api.");
  }
  if (agentKind !== null && agentKind !== "agy") {
    throw new DriverConfigError("--agent takes agy.");
  }
  if (agentKind && api) {
    throw new DriverConfigError("--agent and --api are two ways to run the model: give one.");
  }
  if (agentKind === "agy") {
    if (!modelGiven) {
      throw new DriverConfigError("Give agy's model: --model <id> (as agy names it, e.g. gemini-4-hydrogen).");
    }
    if (compactWindowGiven) {
      throw new DriverConfigError("agy keeps its own context: --compact-window is Claude Code's.");
    }
    return createAgyDriver({ model, effort, env });
  }
  if (api) {
    const baseUrl = String(baseUrlOpt ?? (api === "openai" ? "http://127.0.0.1:11434/v1" : "http://127.0.0.1:11434"));
    const apiKey = env.BENCH_API_KEY ?? (api === "openai" ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY);
    return createDirectApiDriver({ api, baseUrl, apiKey, model, maxOutput });
  }
  return createClaudeDriver({ model, effort, env });
}

function readCliVersion(bin) {
  try {
    return execFileSync(bin, ["--version"], { encoding: "utf8" }).trim();
  } catch {
    /* reported as unknown */
    return null;
  }
}

/** Claude Code (`claude -p`) driver. */
export function createClaudeDriver({ model, effort, env = process.env }) {
  const claudeBin = env.CLAUDE_BIN ?? "claude";
  let claudeVersion = null;
  return {
    exitLabel: "claude",
    prepare() {
      claudeVersion = readCliVersion(claudeBin);
    },
    playerMeta() {
      return {};
    },
    provenance({ compactWindow }) {
      // Who ran the model: Claude Code (claudeVersion; its compaction and tools are part of the harness)
      // and the window it compacted at (null: the model's own).
      return {
        via: "claude-code",
        claudeVersion,
        compactWindow: compactWindow || null,
      };
    },
    start({ configFile, compactWindow, transcript, onEvent }) {
      // Each run starts in its own empty folder: nothing from the repo or an earlier run is in reach.
      const claude = spawn(claudeBin, claudeArgs({ model, effort, configFile }), {
        cwd: mkdtempSync(join(tmpdir(), "nuzlocke-bench-run-")),
        env: runnerEnv(env, compactWindow),
        stdio: ["pipe", "pipe", "inherit"],
      });
      // Writing to a claude that already exited (a nudge as it dies) is an EPIPE: not worth a crash.
      claude.stdin.on("error", (e) => console.error(`claude's input: ${e.message}`));
      createInterface({ input: claude.stdout }).on("line", (line) => {
        transcript.write(line + "\n");
        try {
          onEvent(JSON.parse(line));
        } catch (e) {
          if (!(e instanceof SyntaxError)) throw e;
        }
      });
      return {
        send: (text) => {
          if (claude.stdin.writable) claude.stdin.write(userTurn(text));
        },
        end: () => claude.stdin.end(),
        kill: () => claude.kill("SIGTERM"),
        // "close", not "exit": by then claude's output has all been read (and written to the transcript).
        onExit: (f) => claude.on("close", f),
      };
    },
  };
}

/**
 * agy's workspace, checked before the run folder is made: a folder the runner owns (agy has to be told
 * once to trust it, so it's always the same one), emptied for every run, and no MCP servers in agy's own
 * config (agy loads those as well as the workspace's). The game's server is put in it as the run starts.
 */
function prepareAgyWorkspace(env = process.env) {
  const bin = env.AGY_BIN ?? "agy";
  const dir = resolve(env.AGY_WORKSPACE ?? join(homedir(), ".local", "share", "nuzlocke-bench", "agy-workspace"));
  const marker = ".nuzlocke-bench-agy";
  const trust = `agy asks to trust a new folder once: run  cd ${dir} && agy  accept, quit, and start the run again.`;
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, marker), "agy's workspace for nuzlocke-bench runs: emptied for every run.\n");
    throw new DriverConfigError(`Made agy's workspace, ${dir}. ${trust}`);
  }
  if (!existsSync(join(dir, marker))) {
    const other = readdirSync(dir).filter((n) => n !== ".agents" && n !== ".trusted");
    if (other.length) {
      throw new DriverConfigError(`${dir} has other files (${other.join(", ")}): agy's workspace is emptied for every run, so it must be its own folder. Give another with AGY_WORKSPACE.`);
    }
    writeFileSync(join(dir, marker), "agy's workspace for nuzlocke-bench runs: emptied for every run.\n");
  }
  // Nothing from an earlier run in reach.
  for (const n of readdirSync(dir)) if (n !== marker) rmSync(join(dir, n), { recursive: true, force: true });
  let mcpList;
  try {
    mcpList = execFileSync(bin, ["mcp", "list"], { cwd: dir, encoding: "utf8", timeout: 120_000 }).trim();
  } catch (e) {
    throw new DriverConfigError(`agy mcp list failed: ${e.message}`);
  }
  if (!/^No MCP servers configured/i.test(mcpList)) {
    throw new DriverConfigError(`agy has MCP servers of its own (agy mcp list):\n${mcpList}\nA run has the game's only: remove them from agy's config first.`);
  }
  return { bin, dir, mcpList, trust };
}

/** Antigravity CLI (`agy`) driver, with its built-in tools denied (`agy-player.mjs`). */
export function createAgyDriver({ model, effort, env = process.env }) {
  /** @type {any} */
  let ws = null;
  let agyVersion = null;
  return {
    exitLabel: "agy",
    prepare() {
      ws = prepareAgyWorkspace(env);
      agyVersion = readCliVersion(ws.bin);
    },
    playerMeta() {
      return { via: "agy" };
    },
    provenance() {
      return {
        via: "agy",
        agyVersion,
        agyDenied: AGY_DENIED,
        agyMcpList: ws?.mcpList ?? null,
        claudeVersion: null,
        compactWindow: null,
      };
    },
    start({ config, preset, reportIssue, runDir, transcript, onEvent, onStop }) {
      // The game's server, the workspace's only one.
      mkdirSync(join(ws.dir, ".agents"), { recursive: true });
      const tools = activeToolNames({ preset: benchmarkPreset(preset), reportIssue });
      writeFileSync(
        join(ws.dir, ".agents", "mcp_config.json"),
        JSON.stringify(agyWorkspaceConfig(config.mcpServers["nuzlocke-bench"], tools), null, 2),
      );
      const child = spawn(ws.bin, agyArgs({ model, effort }), { cwd: ws.dir, stdio: ["pipe", "pipe", "inherit"] });
      child.stdin.on("error", (e) => console.error(`agy's input: ${e.message}`));
      // agy's own events, as they came: the transcript has them in claude's shape.
      const raw = createWriteStream(join(runDir, "agy-events.jsonl"));
      raw.on("error", (e) => console.error(`agy-events.jsonl: ${e.message}`));
      const translator = new AgyTranslator();
      // agy waits without a word while another agy session is open, or in a folder it hasn't been told to trust.
      let started = false;
      const slow = setTimeout(() => {
        if (!started) console.log(`  agy hasn't started after a minute. It waits while another agy session is open (quit it), and in a folder it doesn't trust yet: ${ws.trust}`);
      }, 60_000);
      createInterface({ input: child.stdout }).on("line", (line) => {
        raw.write(line + "\n");
        let ev;
        try {
          ev = JSON.parse(line);
        } catch {
          return;
        }
        if (ev?.event === "init") started = true;
        const { events, forbidden } = translator.translate(ev);
        for (const e of events) {
          transcript.write(JSON.stringify(e) + "\n");
          onEvent(e);
        }
        // Anything but the game's tools ends the run: the transcript shows what it was.
        if (forbidden && onStop(`agy used ${forbidden}, not one of the game's tools`)) {
          console.log(`  agy used ${forbidden}, not one of the game's tools: stopping the session`);
          child.kill("SIGTERM");
        }
      });
      return {
        send: (text) => {
          if (child.stdin.writable) child.stdin.write(agyTurn(text));
        },
        end: () => child.stdin.end(),
        kill: () => child.kill("SIGTERM"),
        onExit: (f) =>
          child.on("close", (code) => {
            clearTimeout(slow);
            raw.end(() => f(code));
          }),
      };
    },
  };
}

/** Direct HTTP API (`DirectSession`: OpenAI chat completions or Anthropic Messages) driver. */
export function createDirectApiDriver({ api, baseUrl, apiKey, model, maxOutput }) {
  return {
    exitLabel: "session",
    prepare() {},
    playerMeta() {
      return {};
    },
    provenance({ compactWindow }) {
      return {
        via: "api",
        api,
        baseUrl,
        claudeVersion: null,
        compactWindow: compactWindow || null,
      };
    },
    start({ config, compactWindow, transcript, onEvent, onStop }) {
      const { command, args, env } = config.mcpServers["nuzlocke-bench"];
      const session = new DirectSession({ api, baseUrl, apiKey, model, server: { command, args, env }, compactWindow, maxOutput });
      session.on("event", (ev) => {
        transcript.write(JSON.stringify(ev) + "\n");
        onEvent(ev);
      });
      const started = session.start().catch((e) => {
        console.error(`couldn't start: ${e.message}`);
        onStop(`couldn't start: ${e.message}`);
        session.finish(1);
      });
      return {
        send: (text) => started.then(() => session.send(text)),
        end: () => started.then(() => session.end()),
        kill: () => session.kill(),
        onExit: (f) => session.on("exit", f),
      };
    },
  };
}
