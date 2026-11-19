#!/usr/bin/env node
// MCP server (nuzlocke-bench) that lets an AI play the challenge runs in the browser app.
//
//   AI client ⇄ (stdio, MCP) ⇄ this server ⇄ (WebSocket, localhost) ⇄ browser tab
//
// Open the app, start a run, and click "AI control" — the tab connects here.
// While connected the game only advances when a tool sends input, so every
// call is deterministic. Logs go to stderr; stdout carries the MCP protocol.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { appendFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { distDir } from "./headless.mjs";
import { createAutoStart, createHeadlessLauncher } from "./autostart.mjs";
import { createBridgeLink } from "./bridge-link.mjs";
import { createRequestHandler, saveFileOf } from "./http-routes.mjs";
import { loadObserver } from "./observers.mjs";
import { notesStore } from "./notes.mjs";
import { createToolLogger } from "./run-log.mjs";
import { callBudget } from "./call-budget.mjs";
import { harnessVersion } from "./provenance.mjs";
import { createFormatter } from "./format.mjs";
import { benchmarkPreset } from "./benchmark.mjs";
import { knownRoms } from "./rom-refs.mjs";
import { objectivesOf } from "./report.mjs";
import { registerTools } from "./tools.mjs";

const PORT = Number(process.env.NUZLOCKE_BRIDGE_PORT ?? 7878);
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// Headless: serve dist/ and drive it in headless Chromium (see headless.mjs).
const HEADLESS = /^(1|true|yes)$/i.test(process.env.NUZLOCKE_HEADLESS ?? "");
const HEADED = HEADLESS && !!process.env.NUZLOCKE_HEADED;
const PLAYTEST = /^(1|true|yes)$/i.test(process.env.NUZLOCKE_PLAYTEST ?? "");
// report_issue is on by default (NUZLOCKE_REPORT_ISSUE=0 turns it off; a playtest always has it).
const REPORT_ISSUE = PLAYTEST || !/^(0|false|no)$/i.test(process.env.NUZLOCKE_REPORT_ISSUE ?? "");
// Map grids have one space between squares (narrow, the default since an A/B on 2026-10-15 found
// no difference in navigation at ~40% fewer map tokens); NUZLOCKE_GRID=wide gives two, and
// NUZLOCKE_GRID=compact groups squares into 5-column blocks.
const GRID_MODE = process.env.NUZLOCKE_GRID === "wide" ? "wide" : process.env.NUZLOCKE_GRID === "compact" ? "compact" : "narrow";
// Saying which way seen on-screen trainers face on the `Trainers (T)` line, off until an A/B decides.
const TRAINER_FACING = /^(1|true|yes|on)$/i.test(process.env.NUZLOCKE_TRAINER_FACING ?? "");
/** Opt-in bridge options sent once on connect (empty by default: nothing sent). */
const BRIDGE_OPTIONS = {
  ...(TRAINER_FACING ? { trainerFacing: true } : {}),
};
// Action results leave out the area's map: get_map shows it, and a moving tool does with show_map
// (an A/B on 2026-11-07 found no difference in play at ~10% fewer tokens; the model asks when it needs one).
// Results say how effective each move is against the foe only in the hints group: it's the answer to
// a battle's main choice, which the game itself shows only after the hit (an A/B on 2026-11-07).
// NUZLOCKE_EFFECTIVENESS=on|off overrides; set after PRESET below.
const PRESET = benchmarkPreset(process.env.NUZLOCKE_BENCHMARK);
const HIDE_EFFECTIVENESS = process.env.NUZLOCKE_EFFECTIVENESS ? process.env.NUZLOCKE_EFFECTIVENESS === "off" : !PRESET?.hints;
/** The app's rulesets (RULESETS in src/rulesets.ts); the first is the default. */
const RULESET_IDS = ["nuzlocke"];
// Also append to a log file: MCP clients usually hide stderr, which makes launch problems invisible.
const LOG_FILE = join(tmpdir(), "nuzlocke-bench.log");
const log = (...a) => {
  console.error("[nuzlocke-bench]", ...a);
  try {
    appendFileSync(LOG_FILE, `${new Date().toISOString()} ${a.join(" ")}\n`);
  } catch {
    /* logging must never break the server */
  }
};
log(`starting pid=${process.pid} node=${process.version} cwd=${process.cwd()}`);
process.on("uncaughtException", (e) => {
  log("uncaught:", e?.stack ?? e);
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Wiring: the browser link (bridge-link.mjs), the HTTP side (http-routes.mjs) and the headless
// launch (autostart.mjs). Save backups are on disk in <project>/saves (see http-routes.mjs).

// Headless runs keep their own folder by default, so they never resume (or overwrite) the run you play in a tab.
const SAVES_DIR = process.env.NUZLOCKE_SAVES_DIR ?? join(PROJECT_ROOT, HEADLESS ? "saves-headless" : "saves");
mkdirSync(SAVES_DIR, { recursive: true });
const notes = notesStore(SAVES_DIR);
const fileOf = saveFileOf(SAVES_DIR);
// Saves keep the ROM by reference (rom-refs.mjs): the run's ROM and the others in its folder, or
// in NUZLOCKE_ROMS_DIR.
const ROMS = knownRoms({ rom: process.env.NUZLOCKE_ROM, dirs: process.env.NUZLOCKE_ROMS_DIR ? [process.env.NUZLOCKE_ROMS_DIR] : [] });

const DIST = HEADLESS ? distDir(PROJECT_ROOT) : null;
// The conversation panel: bench-run writes the model's transcript next to the run log.
const TRANSCRIPT = process.env.NUZLOCKE_RUN_LOG && process.env.NUZLOCKE_RUN_LOG !== "off" ? join(dirname(process.env.NUZLOCKE_RUN_LOG), "transcript.jsonl") : null;
// A client the bench doesn't run itself (another agent app): the server writes that transcript itself, calls
// and results only (NUZLOCKE_SERVER_TRANSCRIPT=1, needs NUZLOCKE_RUN_LOG). Such a run is self-reported.
const SERVER_TRANSCRIPT = process.env.NUZLOCKE_SERVER_TRANSCRIPT === "1" ? TRANSCRIPT : null;
if (process.env.NUZLOCKE_SERVER_TRANSCRIPT === "1" && !TRANSCRIPT) log("NUZLOCKE_SERVER_TRANSCRIPT needs NUZLOCKE_RUN_LOG: no transcript written");
// A watch-only observer (bench-run --observer): it may look at the run, never play it (observers.mjs).
let observer = null;
if (HEADLESS && process.env.NUZLOCKE_OBSERVER) {
  try {
    observer = await loadObserver(process.env.NUZLOCKE_OBSERVER, { savesDir: SAVES_DIR, transcript: TRANSCRIPT, log });
    log(`observer: ${process.env.NUZLOCKE_OBSERVER}${observer.wantsFrames ? " (frames drawn)" : ""}`);
  } catch (e) {
    log("observer not loaded (the run goes on without it):", e.message);
  }
}

// Results only repeat the screen when it changed (format.mjs).
const formatter = createFormatter({ mapsOnRequest: true });
// Milestone saves: the call that first reaches a story milestone (report.mjs's objectives, as the
// run log shows it) has the page keep a save right there (run.milestone.<id> in the saves folder),
// so a test can start from any of them. A continued run keeps the ones it brought.
const milestonesSaved = new Set(readdirSync(SAVES_DIR).map((f) => /^run\.milestone\.(\w+)\.json$/.exec(f)?.[1]).filter(Boolean));

let optionsConfirmed = {};
let optionsError = null;
let pendingOptions = Promise.resolve();

const http = createServer(createRequestHandler({ savesDir: SAVES_DIR, roms: ROMS, transcript: TRANSCRIPT, dist: DIST, log, observer }));
const link = createBridgeLink({
  log,
  port: PORT,
  headless: HEADLESS,
  logFile: LOG_FILE,
  onNewRun: () => {
    notes.clear();
    milestonesSaved.clear(); // the page drops the last run's milestone saves too (clearRun)
  },
  onConnect: () => {
    formatter.reset(); // a fresh page: show the next screen in full
    optionsConfirmed = {};
    optionsError = null;
    if (Object.keys(BRIDGE_OPTIONS).length) {
      pendingOptions = link.send("set_options", BRIDGE_OPTIONS).then(
        () => { optionsConfirmed = BRIDGE_OPTIONS; },
        (e) => {
          optionsError = `The connected page didn't accept bridge options (${Object.keys(BRIDGE_OPTIONS).join(", ")}): ${e.message}. Rebuild/reload the page.`;
          log("set_options failed:", e.message);
        },
      );
    } else {
      pendingOptions = Promise.resolve();
    }
    autoStart.maybeAutoStart();
  },
});
link.attach(http);
const call = async (method, params) => {
  await pendingOptions;
  if (optionsError) throw new Error(optionsError);
  return link.call(method, params);
};
const autoStart = createAutoStart({ headless: HEADLESS, preset: PRESET, rulesetIds: RULESET_IDS, fileOf, call, log });
const launcher = createHeadlessLauncher({ port: PORT, headed: HEADED, log, observer });
http.listen(PORT, "127.0.0.1", () => {
  log(`bridge listening on ws://127.0.0.1:${PORT} (saves: ${SAVES_DIR})`);
  if (!HEADLESS) return;
  launcher.start();
});
if (HEADLESS) launcher.closeOnExit();

// ---------------------------------------------------------------------------
// MCP server & tools (registered from tools.mjs)

/** The game the run's ROM is, from its header title, as the instructions name it. */
function gameName(romPath) {
  try {
    const title = readFileSync(romPath).subarray(0x134, 0x143).toString("latin1");
    if (title.startsWith("PM_CRYSTAL")) return "Pokémon Crystal (Game Boy Color)";
    if (title.startsWith("POKEMON YELLOW")) return "Pokémon Yellow (Game Boy)";
    if (title.startsWith("POKEMON BLUE")) return "Pokémon Blue (Game Boy)";
    if (title.startsWith("POKEMON RED")) return "Pokémon Red (Game Boy)";
  } catch {
    // no ROM given yet (new_run's rom_path): say the games the bench plays
  }
  return "Pokémon Red/Blue/Yellow or Crystal (Game Boy)";
}

const server = new McpServer(
  // The benchmark's version, as package.json has it (it was a literal and fell behind at 0.2.0).
  { name: "nuzlocke-bench", version: JSON.parse(readFileSync(join(PROJECT_ROOT, "package.json"), "utf8")).version },
  {
    instructions: [
      `You are playing ${gameName(process.env.NUZLOCKE_ROM)} under a challenge ruleset — get_rules has the rules and the run's goal.`,
      "The game is paused between calls. Every call costs a turn" + (PRESET?.max_calls ? ` (this run has ${PRESET.max_calls} tool calls in all; get_rules says more)` : "") + ", so:",
      "  - Chain actions you've already decided on with do (e.g. walk_to a door, advance_text, choose YES, exit_map): it stops by itself when something new needs deciding.",
      "  - Action results already carry your location, lead, foe, messages, tracker events and the screen text (only when it changed). Call get_state only for what they don't show, with only=[...] for just the sections you need.",
      "  - get_screen (an image) is rarely needed: get_map shows the map as text.",
      "Moving: walk_to (coordinates from get_map full=true), exit_map, travel, walk (\"U3 R2\"). Finding your way is up to you: nothing about the world's layout is given. Maps show what you've seen (? is unseen); when no seen way gets there, walk_to and exit_map try one through unseen squares, a few steps at a time.",
      "  A move's result shows the map only when asked: show_map=true on the move, or get_map.",
      "  When you learn how two maps connect, note_route it; go_to then travels any chain of noted routes in one call.",
      "Your notes: on a long run the conversation may be summarized and lose detail; notes keeps what you want to remember for this run.",
      "Dialogue and menus: advance_text (all text until a choice), choose (an option by its text), press (raw buttons; 'b' backs out).",
      "Battles: fight (a move; plays the turn), switch_pokemon, throw_ball, use_item outside battle. Enemy moves stay hidden until seen.",
      "Hardcore Nuzlocke (run.ruleset 'nuzlocke'): the game as it shipped. get_state's nuzlocke.thisArea says whether this area's encounter is still open;",
      "  hunt paces grass until a wild battle; policies sets how walking treats wild battles and trainers' sight.",
      PRESET ? "If the run ends (🏁 in a result), it's over: a benchmark run has one attempt." : "If the run ends (🏁 in a result), it's over: new_run starts the next attempt.",
    ].join("\n"),
  },
);

// Run log (see run-log.mjs). NUZLOCKE_RUN_LOG=<file> to choose the file, NUZLOCKE_RUN_LOG=off to turn it off.
const RUN_LOG_FILE = process.env.NUZLOCKE_RUN_LOG === "off" ? null
  : process.env.NUZLOCKE_RUN_LOG ?? join(PROJECT_ROOT, "runs", `${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);

async function saveMilestones(entry) {
  for (const id of Object.keys(objectivesOf([entry]))) {
    if (milestonesSaved.has(id)) continue;
    milestonesSaved.add(id);
    await call("milestone_save", { id });
  }
}

const wrapLog = createToolLogger({
  file: RUN_LOG_FILE,
  log,
  status: link.lastStatus,
  mapsEntered: link.takeMapsEntered,
  onEntry: saveMilestones,
  transcript: SERVER_TRANSCRIPT,
  session: () => ({
    benchmark: PRESET,
    harness: harnessVersion(PROJECT_ROOT, DIST),
    headless: HEADLESS,
    ...(PLAYTEST ? { playtest: true } : {}),
    ...(SERVER_TRANSCRIPT ? { serverTranscript: true } : {}),
    ...(REPORT_ISSUE ? { reportIssue: true } : {}),
    grid: GRID_MODE,
    maps: "ask",
    effectiveness: HIDE_EFFECTIVENESS ? "off" : "on",
    ...optionsConfirmed,
    ...(optionsError ? { optionsError } : {}),
  }),
});

const BUDGET = PRESET?.max_calls ? callBudget({ max: PRESET.max_calls, dir: SAVES_DIR }) : null;

registerTools(server, {
  call,
  link,
  autoStart,
  formatter,
  notes,
  budget: BUDGET,
  wrapLog,
  runLogFile: RUN_LOG_FILE,
  preset: PRESET,
  reportIssue: REPORT_ISSUE,
  grid: GRID_MODE,
  hideEffectiveness: HIDE_EFFECTIVENESS,
  rulesetIds: RULESET_IDS,
});

await server.connect(new StdioServerTransport());
log("MCP server ready (stdio)");
