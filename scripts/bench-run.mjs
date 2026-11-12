// Plays one benchmark run with Claude Code (claude -p), or straight through a model's API (--api), and records it.
//   node scripts/bench-run.mjs --rom path/to/red.gb [--model claude-haiku-5-5] [--effort medium]
//        [--api openai|anthropic] [--base-url <url>]   play through the API: no Claude Code, no system prompt
//        [--preset hardcore-nuzlocke-badge1] [--max-tokens 500] [--nudges 3] [--port 7880] [--headed] [--watch]
//        [--resume runs/<id>]   continue that run from a copy of its saves, in a new run folder
//        [-o nohardcap] …       options on top of the preset (repeat, or comma-separated); hardcap and firstrival
//                               are on unless turned off with nohardcap / nofirstrival
//        [--playtest]           test the tools: the model is asked to look for what lets it down (not a benchmark result)
//        [--no-report]          without report_issue (on by default: the model reports tools that let it down)
//        [--grid wide]          map grids with two spaces between squares (the default, narrow, has one)
//        [--effectiveness on|off]  whether results say how effective each move is (default: only with -o hints)
// Needs npm run build, Playwright (see mcp-server/headless.mjs) and the claude CLI (CLAUDE_BIN to choose one).
// Everything about the run goes in its own folder, runs/<id>/ (see mcp-server/run-folder.mjs):
// run-log.jsonl, transcript.jsonl, agent.json (model, effort, nudges, cost) and saves/.
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { COMPACT_WINDOW, HINTS, NUDGE, PLAYTEST, PROMPT, REPORT, RESUME_PROMPT, claudeArgs, mcpConfig, nextStep, runEnded, runnerEnv, TokenMeter, loggedPreset, mTokens, userTurn, GIVE_UP_AFTER } from "../mcp-server/bench-runner.mjs";
import { isExperimental, romVersion } from "../mcp-server/games/index.mjs";
import { DirectSession } from "../mcp-server/direct-session.mjs";
import { compressTranscript, locateRun, runFiles } from "../mcp-server/run-folder.mjs";
import { writeSummary } from "../mcp-server/run-summary.mjs";
import { dashboardRuns } from "../mcp-server/dashboard.mjs";
import { DEFAULT_OPTIONS, benchmarkPreset, presetHelp, presetId, withDefaultOptions } from "../mcp-server/benchmark.mjs";

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? fallback : argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true;
};
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`Plays one benchmark run with Claude Code (claude -p) and records it in runs/<id>/.

Usage: npm run bench -- --rom path/to/red.gb [options]

  --rom <file>         the game: Red, Blue, Yellow, or Crystal (experimental: not scored) (or NUZLOCKE_ROM)
  --model <id>         who plays (default claude-haiku-5-5). The standard context window is the default;
                       the [1m] suffix gives 1M (much costlier on long runs: every call re-reads the context)
  --effort <level>     low, medium, high… (default: Claude Code's; not with --api)
  --api <kind>         play straight through the model's API instead of Claude Code: openai (chat completions:
                       Ollama, vLLM, OpenRouter…) or anthropic (Messages API). The model reads only the prompt
                       and the game's tools: no system prompt. Key: BENCH_API_KEY (or OPENAI_API_KEY /
                       ANTHROPIC_API_KEY); not needed for Ollama
  --base-url <url>     the API's address (default: Ollama's, http://127.0.0.1:11434/v1 for openai and
                       http://127.0.0.1:11434 for anthropic)
  --max-output <n>     with --api: the most tokens one reply may have (default 16384)
  --preset <id>        benchmark preset (default hardcore-nuzlocke-badge1)
  -o, --option <name>  option on top of the preset; repeat, or comma-separated. ${DEFAULT_OPTIONS.join(" and ")} are on
                       by default; no<option> turns one off (-o nohardcap,nofirstrival: the strict rules)
  --max-tokens <M>     a safety stop at this many million tokens processed (default 500; input, cache and
                       output). The model isn't told; the preset's tool-call budget is what ends a run, so
                       one stopped here first isn't a finished result
  --compact-window <k> the context window in thousands of tokens: Claude Code compacts the conversation when
                       it's full (default ${COMPACT_WINDOW / 1000}, the same for every model; 0 = the model's own window)
  --nudges <n>         at most this many "keep playing" nudges (default 3); then the run ends as given up
  --port <n>           the game's port; give runs side by side different ones (default 7880)
  --headed             show the game window, paced to watch
  --watch              show the game window at full speed (the run isn't slowed down)
  --observer <module>  a watch-only observer: an outside module that may look at the run, never play it
                       (mcp-server/observers.mjs); recorded with the run, which stays official
  --grid wide          map grids with two spaces between squares (the default has one: ~40% fewer map tokens)
  --effectiveness <on|off>  whether results say how effective each move is against the foe. Default: off,
                       on with -o hints (it's help: the game itself only says "super effective" after a hit)
  --no-report          leave out report_issue (by default every run has it and is asked to report tools that let it down)
  --playtest           test the tools, not the model: it's asked to look for what lets it down and report it
                       (see npm run bench:friction; marked: not a benchmark result)
  --resume <run>       continue runs/<id> from a copy of its saves, in a new run folder
  -h, --help           this help

${presetHelp()}

Needs npm run build, Playwright and the claude CLI (CLAUDE_BIN to choose one).`);
  process.exit(0);
}
const rom = opt("rom", process.env.NUZLOCKE_ROM);
if (typeof rom !== "string" || !existsSync(rom)) {
  console.error("Give the ROM: --rom path/to/red.gb (or NUZLOCKE_ROM).");
  process.exit(1);
}
// A run to continue: its saves are copied (the original stays as it was), its preset kept.
const resumed = opt("resume", null) ? locateRun(String(opt("resume"))) : null;
if (resumed && !existsSync(join(resumed.saves, "run.json"))) {
  console.error(`No run to continue in ${resumed.saves}.`);
  process.exit(1);
}
const resumedAgent = resumed && existsSync(resumed.agent) ? JSON.parse(readFileSync(resumed.agent, "utf8")) : {};
// A run stopped by a reboot or a crash has no agent.json: its run log still names its preset.
const resumedPreset = resumed ? resumedAgent.preset ?? loggedPreset(existsSync(resumed.runLog) ? readFileSync(resumed.runLog, "utf8") : "") : null;
if (resumed && !resumedPreset && opt("preset", null) === null) {
  console.error(`${resumed.name} doesn't record its preset (no agent.json, no run log): give it with --preset and -o.`);
  process.exit(1);
}
const model = opt("model", "claude-haiku-5-5");
const effort = opt("effort", null);
const api = opt("api", null);
if (api !== null && api !== "openai" && api !== "anthropic") {
  console.error("--api takes openai or anthropic.");
  process.exit(1);
}
if (api && effort) {
  console.error("--effort is Claude Code's; it isn't sent with --api.");
  process.exit(1);
}
const baseUrl = api ? String(opt("base-url", api === "openai" ? "http://127.0.0.1:11434/v1" : "http://127.0.0.1:11434")) : null;
const apiKey = process.env.BENCH_API_KEY ?? (api === "openai" ? process.env.OPENAI_API_KEY : api === "anthropic" ? process.env.ANTHROPIC_API_KEY : undefined);
const maxOutput = numberOpt("max-output", 16384, { min: 1, integer: true });
// -o / --option: options on top of the preset; the run's preset id names them ("hardcore-nuzlocke+hardcap").
// A new run gets the default options too; a continued one keeps its preset id as it was.
const asked = argv.flatMap((a, i) => ((a === "-o" || a === "--option") && argv[i + 1] ? argv[i + 1].split(",") : []));
let preset;
try {
  preset = presetId(opt("preset", resumedPreset ?? "hardcore-nuzlocke-badge1"), resumed ? asked : withDefaultOptions(asked));
  benchmarkPreset(preset);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
/** A number option, refused unless it's a number in [min, max] (a typo must not turn a limit off). */
function numberOpt(name, fallback, { min = 0, max = Infinity, integer = false } = {}) {
  const v = Number(opt(name, fallback));
  if (!Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) {
    console.error(`--${name} takes ${integer ? "a whole number" : "a number"} from ${min}${max < Infinity ? ` to ${max}` : " up"}.`);
    process.exit(1);
  }
  return v;
}
const effectivenessAsked = opt("effectiveness", null);
if (effectivenessAsked !== null && effectivenessAsked !== "on" && effectivenessAsked !== "off") {
  console.error("--effectiveness takes on or off (default: off, on with -o hints).");
  process.exit(1);
}
// Help, so only in the hints group by default: whether results say how effective each move is.
const effectiveness = effectivenessAsked ?? (preset.split("+").includes("hints") ? "on" : "off");
const maxTokens = numberOpt("max-tokens", 500, { min: 0.001 }) * 1e6;
const maxNudges = numberOpt("nudges", GIVE_UP_AFTER, { integer: true });
const compactWindow = Number(opt("compact-window", COMPACT_WINDOW / 1000)) * 1000;
if (!Number.isFinite(compactWindow) || compactWindow < 0) {
  console.error("--compact-window takes thousands of tokens (e.g. 200), or 0 for the model's own window.");
  process.exit(1);
}
const port = numberOpt("port", 7880, { min: 1024, max: 65535, integer: true });
const playtest = opt("playtest", false) === true;
const report = opt("no-report", false) !== true;
// A watch-only observer module (observers.mjs): it can look at the run, not play it.
const observerOpt = opt("observer", undefined);
if (observerOpt !== undefined && (typeof observerOpt !== "string" || !existsSync(observerOpt))) {
  console.error("--observer takes the path of an observer module (see mcp-server/observers.mjs).");
  process.exit(1);
}
const observer = observerOpt ? resolve(observerOpt) : null;
const observers = observer ? [basename(observer)] : null;
const grid = opt("grid", undefined);
if (grid !== undefined && grid !== "narrow" && grid !== "wide") {
  console.error("--grid takes wide or narrow (the default).");
  process.exit(1);
}

// A game still being built (Crystal) plays, but its runs aren't scored or ranked: say so up front.
const version = romVersion(readFileSync(rom));
const experimental = isExperimental(version);
if (experimental) console.log(`Experimental game (${version[0].toUpperCase() + version.slice(1)}): the run plays, but it isn't scored or ranked.`);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const id = new Date().toISOString().replace(/[:.]/g, "-");
// Runs go in the repo's runs/ folder, or in NUZLOCKE_RUNS_DIR (the tests use it).
const run = runFiles(join(process.env.NUZLOCKE_RUNS_DIR ?? join(root, "runs"), id));
mkdirSync(run.saves, { recursive: true });
// The page's model log names who plays while the run is live.
// It also says what kind of run this is, for a run that stops before agent.json gets written.
writeFileSync(run.player, JSON.stringify({ model, effort, preset, resumedFrom: resumed?.name ?? null, playtest, ...(experimental ? { experimental } : {}), ...(observers ? { observers } : {}) }));
if (resumed) cpSync(resumed.saves, run.saves, { recursive: true });
const configFile = join(tmpdir(), `nuzlocke-bench-${id}.json`);
const config = mcpConfig({
  node: process.execPath,
  server: join(root, "mcp-server", "server.mjs"),
  rom: resolve(rom),
  preset,
  port,
  savesDir: run.saves,
  runLog: run.runLog,
  headed: opt("watch", false) === true ? "fast" : opt("headed", false) === true,
  playtest,
  grid,
  effectiveness,
  report,
  observer,
});
writeFileSync(configFile, JSON.stringify(config));

// What the model was given, for agent.json: the CLI's version (its compaction and tools are part of
// the harness) and a hash of the opening prompt (runs compare only under the same one).
const claudeBin = process.env.CLAUDE_BIN ?? "claude";
let claudeVersion = null;
if (!api) {
  try {
    claudeVersion = execFileSync(claudeBin, ["--version"], { encoding: "utf8" }).trim();
  } catch {
    /* reported as unknown */
  }
}
const firstTurn = (resumed ? RESUME_PROMPT : PROMPT) + (playtest ? PLAYTEST : report ? REPORT : "") +
  (preset.split("+").includes("hints") ? HINTS : "");
const promptSha256 = createHash("sha256").update(firstTurn).digest("hex");

// The player: the claude process, or a session on the model's API. Both give stream-json events,
// take user turns, and exit.
const player = api ? directPlayer() : claudePlayer();

function claudePlayer() {
  // Each run starts in its own empty folder: nothing from the repo or an earlier run is in reach.
  const claude = spawn(claudeBin, claudeArgs({ model, effort, configFile }), {
    cwd: mkdtempSync(join(tmpdir(), "nuzlocke-bench-run-")),
    env: runnerEnv(process.env, compactWindow),
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
}

function directPlayer() {
  const { command, args, env } = config.mcpServers["nuzlocke-bench"];
  const session = new DirectSession({ api, baseUrl, apiKey, model, server: { command, args, env }, compactWindow, maxOutput });
  session.on("event", (ev) => {
    transcript.write(JSON.stringify(ev) + "\n");
    onEvent(ev);
  });
  const started = session.start().catch((e) => {
    console.error(`couldn't start: ${e.message}`);
    stopped ??= `couldn't start: ${e.message}`;
    session.finish(1);
  });
  return {
    send: (text) => started.then(() => session.send(text)),
    end: () => started.then(() => session.end()),
    kill: () => session.kill(),
    onExit: (f) => session.on("exit", f),
  };
}
const transcript = createWriteStream(run.transcript);
// A write after the stream ended (a late line) or a full disk is reported, not a crash mid-run.
transcript.on("error", (e) => console.error(`transcript: ${e.message}`));
let ended = false, nudges = 0, last = null, stopped = null, gaveUp = false;
let callsThisTurn = 0, idleNudges = 0; // tool calls since the last turn ended; nudges in a row with none
// The safety stop (the model isn't told about it): tokens processed, checked on every event.
const meter = new TokenMeter();

console.log(`run ${id}${resumed ? ` (continuing ${resumed.name})` : ""}: ${model}${effort ? ` (${effort})` : ""}, ${preset}, up to ${mTokens(maxTokens)} tokens, up to ${maxNudges} nudges`);
function onEvent(ev) {
  meter.add(ev);
  if (!stopped && meter.totals().total >= maxTokens) {
    stopped = `token limit reached (${mTokens(maxTokens)})`;
    console.log(`  ${stopped}: stopping the session`);
    player.kill();
    return;
  }
  if (ev.type === "assistant") callsThisTurn += (ev.message?.content ?? []).filter((c) => c?.type === "tool_use").length;
  if (ev.type === "user") {
    for (const c of ev.message?.content ?? []) {
      if (c?.type !== "tool_result") continue;
      const text = typeof c.content === "string" ? c.content : (c.content ?? []).map((x) => x.text ?? "").join("\n");
      if (runEnded(text)) ended = true;
    }
  }
  if (ev.type !== "result") return;
  last = ev;
  // Already stopped (by hand, or at the token limit): a result that still arrives doesn't change why.
  if (stopped) return;
  // A turn that followed a nudge and played nothing counts toward giving up; any play resets it.
  if (nudges > 0) idleNudges = callsThisTurn === 0 ? idleNudges + 1 : 0;
  callsThisTurn = 0;
  const step = nextStep({ ended, result: ev, nudges, maxNudges, maxTokens, tokens: meter.totals().total, idleNudges });
  if (step.nudge) {
    nudges++;
    console.log(`  ended its turn before the run was over: nudge ${nudges} (${mTokens(meter.totals().total)} tokens, ${meter.totals().turns} turns so far)`);
    player.send(NUDGE);
    transcript.write(JSON.stringify({ type: "nudge", text: NUDGE, t: new Date().toISOString() }) + "\n"); // claude doesn't echo user turns
  } else {
    stopped = step.stop;
    gaveUp = !!step.gaveUp;
    player.end();
  }
}
player.send(firstTurn);

// Stopped by hand: the model stops too (it would play on without us), and the run's summary still gets written.
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(signal, () => {
    stopped ??= `stopped by hand (${signal})`;
    player.kill();
  });
}

player.onExit((code) => {
  const agent = {
    model, effort, preset, nudges, gaveUp,
    // Who ran the model: Claude Code (claudeVersion), or its API straight (no system prompt).
    via: api ? "api" : "claude-code",
    ...(api ? { api, baseUrl } : {}),
    resumedFrom: resumed?.name ?? null,
    playtest,
    ...(experimental ? { experimental } : {}),
    reportIssue: report || playtest,
    claudeVersion,
    promptSha256,
    // The window Claude Code compacted at (null: the model's own).
    compactWindow: compactWindow || null,
    ...(grid ? { grid } : {}),
    ...(observers ? { observers } : {}),
    // Maps on request (get_map, or show_map on a move): recorded so reports can tell runs from before apart.
    maps: "ask",
    // Whether results showed each move's effectiveness (shown before 2026-11-07, where it isn't recorded).
    effectiveness,
    // Tokens the model processed and its turns (API calls), counted from the stream.
    tokens: meter.totals(),
    turns: last?.num_turns ?? null,
    sessionId: last?.session_id ?? null,
    stopped: stopped ?? `${api ? "session" : "claude"} exited (${code})`,
    finalMessage: last?.result ?? null,
  };
  writeFileSync(run.agent, JSON.stringify(agent, null, 2));
  // Once the transcript is all on disk: the run's summary (the report's rows for it), then the
  // transcript gzipped (readers take either form), unless the summary failed.
  transcript.end(() => {
    try {
      const rows = writeSummary(run.runLog);
      compressTranscript(run.transcript);
      console.log(scoreLine(rows));
    } catch (e) {
      console.error(`summary.json or the compressed transcript not written: ${e.message}`);
    }
    console.log(`done: ${agent.stopped}; ${nudges} nudge(s), ${mTokens(agent.tokens.total)} tokens in ${agent.tokens.turns} turns\n  runs/${id}/`);
  });
});

/** The run's score as the dashboard counts it, for the console when it ends (a continued run: this leg only). */
function scoreLine(rows) {
  if (experimental) return "score: none (experimental game)";
  const [r] = dashboardRuns(rows);
  if (!r) return "score: none (nothing recorded)";
  const leg = resumed ? " for this leg (npm run bench:report for the whole run)" : "";
  return `score: ${r.score.total}${leg}; ${r.reached.length} milestone(s), ${r.deaths} death(s), ${r.calls} calls; ${r.notOfficial ? `not official: ${r.notOfficial}` : "official"}`;
}
