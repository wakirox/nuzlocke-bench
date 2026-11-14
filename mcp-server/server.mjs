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
import { z } from "zod";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { distDir } from "./headless.mjs";
import { createAutoStart, createHeadlessLauncher } from "./autostart.mjs";
import { createBridgeLink } from "./bridge-link.mjs";
import { createRequestHandler, saveFileOf } from "./http-routes.mjs";
import { loadObserver } from "./observers.mjs";
import { entriesOf, NOTES_MAX, notesStore, numbered, updateNotes } from "./notes.mjs";
import { instrumentTools } from "./run-log.mjs";
import { callBudget, limitCalls } from "./call-budget.mjs";
import { harnessVersion } from "./provenance.mjs";
import { MAP_LEGEND, NARROW_GRID_NOTE, createFormatter, hideEffectiveness, json, legendFor, narrowGrids, pickSections, plainErrorScreen, screenText } from "./format.mjs";
import { applyPreset, benchmarkPreset } from "./benchmark.mjs";
import { knownRoms } from "./rom-refs.mjs";
import { hintState, nextHint } from "./hints.mjs";
import { objectivesOf } from "./report.mjs";
import { gameData } from "./games/index.mjs";
import { BATCH_TOOLS, normalizeStep, runBatch, stepSummary, stepToolError } from "./batch.mjs";

const PORT = Number(process.env.NUZLOCKE_BRIDGE_PORT ?? 7878);
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// Headless: serve dist/ and drive it in headless Chromium (see headless.mjs).
const HEADLESS = /^(1|true|yes)$/i.test(process.env.NUZLOCKE_HEADLESS ?? "");
const HEADED = HEADLESS && !!process.env.NUZLOCKE_HEADED;
const PLAYTEST = /^(1|true|yes)$/i.test(process.env.NUZLOCKE_PLAYTEST ?? "");
// report_issue is on by default (NUZLOCKE_REPORT_ISSUE=0 turns it off; a playtest always has it).
const REPORT_ISSUE = PLAYTEST || !/^(0|false|no)$/i.test(process.env.NUZLOCKE_REPORT_ISSUE ?? "");
// Map grids have one space between squares (narrow, the default since an A/B on 2026-10-15 found
// no difference in navigation at ~40% fewer map tokens); NUZLOCKE_GRID=wide gives two.
const NARROW_GRID = process.env.NUZLOCKE_GRID !== "wide";
// Action results leave out the area's map: get_map shows it, and a moving tool does with show_map
// (an A/B on 2026-11-07 found no difference in play at ~10% fewer tokens; the model asks when it needs one).
// Results say how effective each move is against the foe only in the hints group: it's the answer to
// a battle's main choice, which the game itself shows only after the hit (an A/B on 2026-11-07).
// NUZLOCKE_EFFECTIVENESS=on|off overrides; set after PRESET below.
const shown = (text) => {
  const t = NARROW_GRID ? narrowGrids(text) : text;
  return HIDE_EFFECTIVENESS ? hideEffectiveness(t) : t;
};
const narrow = (r) => ({ ...r, content: r.content.map((c) => (c.type === "text" ? { ...c, text: shown(c.text) } : c)) });
// Benchmark: lock every run to one preset (benchmark.mjs).
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
    autoStart.maybeAutoStart();
  },
});
link.attach(http);
const { call } = link;
const autoStart = createAutoStart({ headless: HEADLESS, preset: PRESET, rulesetIds: RULESET_IDS, fileOf, call, log });
const launcher = createHeadlessLauncher({ port: PORT, headed: HEADED, log, observer });
http.listen(PORT, "127.0.0.1", () => {
  log(`bridge listening on ws://127.0.0.1:${PORT} (saves: ${SAVES_DIR})`);
  if (!HEADLESS) return;
  launcher.start();
});
if (HEADLESS) launcher.closeOnExit();


// ---------------------------------------------------------------------------
// MCP tools

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
  { name: "nuzlocke-bench", version: "0.1.0" },
  {
    instructions: [
      `You are playing ${gameName(process.env.NUZLOCKE_ROM)} under a challenge ruleset — get_rules has the rules and the run's goal.`,
      "The game is paused between calls. Every call costs a turn" + (PRESET?.max_calls ? ` (this run has ${PRESET.max_calls} tool calls in all; get_rules says more)` : "") + ", so:",
      "  - Chain actions you've already decided on with do (e.g. walk_to a door, advance_text, choose YES, exit_map): it stops by itself when something new needs deciding.",
      "  - Action results already carry your location, lead, foe, messages, tracker events and the screen text (only when it changed). Call get_state only for what they don't show, with only=[...] for just the sections you need.",
      "  - get_screen (an image) is rarely needed: get_map shows the map as text.",
      "Moving: walk_to (coordinates from get_map full=true), exit_map, travel, walk (\"U3 R2\"). Finding your way is up to you: nothing about the world's layout is given.",
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

// ---------------------------------------------------------------------------
// Run log (see run-log.mjs). NUZLOCKE_RUN_LOG=<file> to choose the file, NUZLOCKE_RUN_LOG=off to turn it off.
const RUN_LOG_FILE = process.env.NUZLOCKE_RUN_LOG === "off" ? null
  : process.env.NUZLOCKE_RUN_LOG ?? join(PROJECT_ROOT, "runs", `${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
// Milestone saves: the call that first reaches a story milestone (report.mjs's objectives, as the
// run log shows it) has the page keep a save right there (run.milestone.<id> in the saves folder),
// so a test can start from any of them. A continued run keeps the ones it brought.
const milestonesSaved = new Set(readdirSync(SAVES_DIR).map((f) => /^run\.milestone\.(\w+)\.json$/.exec(f)?.[1]).filter(Boolean));
async function saveMilestones(entry) {
  for (const id of Object.keys(objectivesOf([entry]))) {
    if (milestonesSaved.has(id)) continue;
    milestonesSaved.add(id);
    await call("milestone_save", { id });
  }
}

instrumentTools(server, {
  file: RUN_LOG_FILE,
  log,
  status: link.lastStatus,
  mapsEntered: link.takeMapsEntered,
  onEntry: saveMilestones,
  session: { benchmark: PRESET, harness: harnessVersion(PROJECT_ROOT, DIST), headless: HEADLESS, ...(PLAYTEST ? { playtest: true } : {}), ...(REPORT_ISSUE ? { reportIssue: true } : {}), grid: NARROW_GRID ? "narrow" : "wide", maps: "ask", effectiveness: HIDE_EFFECTIVENESS ? "off" : "on" },
});

// A benchmark preset's tool-call budget (call-budget.mjs): counted after the run log, so the log
// records the call that ends the run.
const BUDGET = PRESET?.max_calls ? callBudget({ max: PRESET.max_calls, dir: SAVES_DIR }) : null;
if (BUDGET) limitCalls(server, BUDGET);
const callsLine = () => `Tool calls: this run has ${BUDGET.max} in all, and every call counts (this one too: ${BUDGET.used()} used so far). When they're used up, the run ends.`;

// Each tool's argument schema, so `do` can check its steps' arguments the same way.
const SCHEMAS = {};
{
  const register = server.registerTool.bind(server);
  server.registerTool = (name, config, handler) => {
    if (config.inputSchema) SCHEMAS[name] = z.object(config.inputSchema).strict();
    return register(name, config, handler);
  };
}

// Results only repeat the screen when it changed (format.mjs).
const formatter = createFormatter({ mapsOnRequest: true });
const afterAction = (r, opts) => formatter.afterAction(r, opts);
const wrap = (fn) => async (args) => {
  try {
    // Headless auto-start in progress: let it finish (a minute at most; then the tool says what's wrong).
    if (autoStart.pending()) await Promise.race([autoStart.pending(), new Promise((r) => setTimeout(r, 60_000))]);
    return narrow(await fn(args ?? {}));
  } catch (e) {
    return narrow({ isError: true, content: [{ type: "text", text: plainErrorScreen(e.message ?? String(e)) }] });
  }
};

// Maps are shown on request: a move's result leaves the area's map out unless the model asks for it here.
const SHOW_MAP = z.boolean().optional().describe("Also show the area's map after moving (otherwise only get_map shows it)");

const STATE_SECTIONS = ["run", "location", "battle", "lead", "party", "nuzlocke", "enemy", "bag", "healsInBag", "badges", "money", "pokemonCenterHeals", "catches", "recentRuleEvents"];

server.registerTool("get_state", {
  title: "Get game state",
  description: `Name-resolved game state: lead Pokémon (moves with type/power/PP${HIDE_EFFECTIVENESS ? "" : "/effectiveness"}), enemy in battle, party, bag, location, badges, heals, catches, rule events and run outcome. ` +
    "only=[...] returns just those sections (cheaper).",
  inputSchema: {
    only: z.array(z.enum(STATE_SECTIONS)).optional().describe("Sections to return (default: all)"),
  },
}, wrap(stateResult));

async function stateResult({ only } = {}) {
  const state = await call("get_state");
  if (BUDGET && state?.run) state.run.toolCalls = `${BUDGET.used()} of ${BUDGET.max}`;
  return json(pickSections(state, only));
}

async function mapResult({ legend, ...a } = {}) {
  const r = await afterAction(await call("get_map", a), { keepMap: true });
  // The legend on request only (in every map it would cost tokens on each call), and only for
  // the symbols this map has.
  const key = legend && !r.isError ? legendFor((r.content ?? []).map((c) => c.text ?? "").join("\n")) : null;
  if (key) r.content = [...r.content, { type: "text", text: key }];
  return r;
}

/**
 * Reads a batch may end with: run once every step has gone through, their answer after the steps'.
 * The model's batches kept ending with get_map or get_state ("walk there, then show me"), and
 * each was refused (6 times in a run, 2026-11-08). Anywhere else a read still isn't a step: its
 * answer is for deciding what to do next.
 */
const FINAL_READS = { get_map: mapResult, get_state: stateResult };

server.registerTool("do", {
  title: "Do several actions",
  description: "Run several of your own actions in one call, in order — e.g. walk_to a door, advance_text, choose YES, exit_map. " +
    "Each step is { tool, args: { …that tool's usual arguments } }. It stops after the first step that leaves something new to decide " +
    "(a battle, a step cut short, a tracker warning or violation, an error, the end of the run) and says which steps didn't run. " +
    "Returns every step's messages and the final screen. Steps can be: " + BATCH_TOOLS.join(", ") + "; the last step may also be " +
    Object.keys(FINAL_READS).join(" or ") + " (run only if every step before it went through).",
  inputSchema: {
    steps: z.array(z.object({
      tool: z.enum([...BATCH_TOOLS, ...Object.keys(FINAL_READS)], { error: (issue) => stepToolError(issue.input) }),
      args: z.record(z.string(), z.any()).optional().describe("That tool's arguments"),
    }).catchall(z.any())).min(1).max(12),
  },
}, wrap(async ({ steps }) => {
  // Check every step's arguments before running any, so a typo doesn't leave the batch half done.
  const parsed = steps.map((raw, i) => {
    let st;
    try {
      st = normalizeStep(raw);
    } catch (e) {
      throw new Error(`Step ${i + 1} (${raw.tool}): ${e.message}`);
    }
    if (FINAL_READS[st.tool] && i < steps.length - 1) throw new Error(`Step ${i + 1} (${st.tool}): a read can only be the last step (its answer is for deciding what to do next).`);
    const schema = SCHEMAS[st.tool];
    const r = schema ? schema.safeParse(st.args ?? {}) : { success: true, data: st.args ?? {} };
    if (!r.success) throw new Error(`Step ${i + 1} (${st.tool}): ${r.error.issues.map((x) => `${x.path.join(".") || "args"}: ${x.message}`).join("; ")}`);
    return { tool: st.tool, args: r.data };
  });
  const read = FINAL_READS[parsed[parsed.length - 1].tool] ? parsed.pop() : null;
  if (!parsed.length) throw new Error(`A batch needs at least one action before ${read.tool}: call ${read.tool} on its own.`);
  const { done, stopped, skipped } = await runBatch(parsed, (tool, args) => call(tool, args));
  const last = done[done.length - 1];
  const head = done.slice(0, -1).map((d, i) => stepSummary(i, d));
  const tail = last.result && typeof last.result === "object" && "status" in last.result
    ? `${done.length}. ${last.tool}\n${afterAction(last.result, { keepMap: !!parsed[done.length - 1]?.args?.show_map }).content[0].text}`
    : stepSummary(done.length - 1, last);
  const notRun = skipped + (read ? 1 : 0);
  const note = stopped || (read && last.error) ? `⏸ Stopped ${stopped ?? `at step ${done.length} (${last.tool}): it failed`} — ${notRun} step${notRun === 1 ? "" : "s"} not run.` : null;
  const text = [...head, tail, note].filter(Boolean).join("\n");
  if (!read || note) return { content: [{ type: "text", text }], isError: last.error ? true : undefined };
  const answer = await FINAL_READS[read.tool](read.args);
  return { content: [{ type: "text", text }, { type: "text", text: `${done.length + 1}. ${read.tool}` }, ...answer.content], isError: answer.isError };
}));

server.registerTool("read_screen_text", {
  title: "Read screen text",
  description: "The Game Boy screen's text, one line per box: Text (dialogue), Menu (▶ is the cursor; 'Menu (behind)' with ▷ is a menu a level back), Box (e.g. MONEY), then anything outside a box. A box's rows are joined with ' / '. ▼ means more text — press 'a'.",
  inputSchema: {},
}, wrap(async () => {
  const r = await call("read_screen_text");
  return { content: [{ type: "text", text: screenText(r.lines) }] };
}));

server.registerTool("get_screen", {
  title: "Screenshot",
  description: "PNG screenshot of the Game Boy screen (plus the decoded text). Use it to see the overworld map, sprites and positions.",
  inputSchema: { scale: z.number().int().min(1).max(6).optional().describe("Upscale factor, default 3") },
}, wrap(async ({ scale }) => {
  const r = await call("get_screen", { scale: scale ?? 3 });
  return {
    content: [
      { type: "image", data: r.png, mimeType: "image/png" },
      // The shared screen reader's no-text line points to get_screen: here the image is that.
      { type: "text", text: screenText(r.lines).replace("Use get_screen to see it.", "The image shows it.") },
    ],
  };
}));

server.registerTool("press", {
  title: "Press buttons",
  description:
    "Press a sequence of Game Boy buttons, in order. Tokens: a, b, start, select, up, down, left, right; repeat with '*' (down*3); chords with '+' (up+b); pause with wait:N (frames, 60 = 1 s); name:SPROUT types a name on an open naming keyboard and confirms it. " +
    "Example: \"a a down*2 a wait:60 b\". Returns the screen text and state afterwards.",
  inputSchema: {
    buttons: z.string().describe("Space- or comma-separated tokens"),
    hold_frames: z.number().int().min(1).max(600).optional().describe("Frames each press is held (default 6)"),
    wait_frames: z.number().int().min(0).max(600).optional().describe("Frames to wait after each press (default 20)"),
  },
}, wrap(async (a) => afterAction(await call("press", a))));

server.registerTool("walk", {
  title: "Walk a path",
  description:
    "Walk a path in one call, e.g. \"up 3, right 2\" or \"U3 R2\" (or direction+tiles). Each leg stops early at walls, " +
    "people, warps or when a battle starts. Returns where you ended up (and the map around you with show_map).",
  inputSchema: {
    show_map: SHOW_MAP,
    path: z.string().optional().describe('Legs like "up 3, right 2" or "U3 R2"'),
    direction: z.enum(["up", "down", "left", "right"]).optional(),
    tiles: z.number().int().min(1).max(30).optional(),
  },
}, wrap(async ({ show_map, ...a }) => afterAction(await call("walk", a), { keepMap: !!show_map })));

// Per-call override of the standing `trainers` policy (see the policies tool).
const TRAINERS = z.enum(["ignore", "avoid"]).optional()
  .describe("This call only: ignore = shortest path (crossings of trainers' sight are reported); avoid = route around their sight where possible");

server.registerTool("go_to", {
  title: "Go to map",
  description: "Travel to a map by its id (e.g. ROUTE_1) along the routes you noted with note_route — only those; " +
    "nothing is known in advance. Stops at battles and says where a noted route didn't work.",
  inputSchema: {
    show_map: SHOW_MAP, map: z.string(), trainers: TRAINERS },
}, wrap(async ({ show_map, ...a }) => afterAction(await call("go_to", a), { keepMap: !!show_map })));

const DIR = z.enum(["up", "down", "left", "right"]);
server.registerTool("notes", {
  title: "Your notes",
  description: "Your own notes for this run, a numbered list kept outside the conversation: if a long run's conversation is summarized, they're still here. " +
    `With nothing, lists them. add puts entries at the end, remove takes entries out by number, clear empties the list; ` +
    `in one call they apply in that order: clear, remove, add (${NOTES_MAX} characters at most in all). A new run starts with none.`,
  inputSchema: {
    add: z.union([z.string(), z.array(z.string())]).optional().describe("Entry or entries to add at the end (one line each)"),
    remove: z.array(z.number().int()).optional().describe("Numbers of the entries to remove, as last listed"),
    clear: z.boolean().optional().describe("Empty the list first"),
  },
}, wrap(async ({ add, remove, clear }) => {
  const now = updateNotes(notes.read(), { add, remove, clear });
  if (add != null || remove?.length || clear) notes.write(now);
  const entries = entriesOf(now);
  return { content: [{ type: "text", text: entries.length ? `Notes (${entries.length} entries, ${now.length}/${NOTES_MAX} characters):\n${numbered(entries)}` : "No notes yet." }] };
}));

server.registerTool("note_route", {
  title: "Note a route",
  description: "Write down how to get from one map to a neighbouring one, so go_to can travel it later: either cross the map's edge " +
    "(exit: up/down/left/right) or step on a door/warp square (door: {x, y} in the from-map's coordinates; push: a direction to step " +
    "after, for warps you leave by walking, like building exits). Map ids as in 📍 [BRACKETS]. Kept for this run; replaces an older note.",
  inputSchema: {
    from: z.string().optional().describe("Map you leave from (default: the map you're on)"),
    to: z.string(),
    exit: DIR.optional(),
    door: z.object({ x: z.number().int().min(0), y: z.number().int().min(0) }).optional(),
    push: DIR.optional(),
  },
}, wrap(async (a) => json(await call("note_route", a))));

server.registerTool("forget_route", {
  title: "Forget a route",
  description: "Remove a route you noted (from → to).",
  inputSchema: { from: z.string(), to: z.string() },
}, wrap(async (a) => json(await call("forget_route", a))));

server.registerTool("routes", {
  title: "Your routes",
  description: "The routes you've noted this run.",
  inputSchema: {},
}, wrap(async () => {
  const r = await call("routes");
  return { content: [{ type: "text", text: r.routes.length ? r.routes.join("\n") : "No routes noted yet." }] };
}));

server.registerTool("travel", {
  title: "Travel",
  description:
    "Head in a direction across a route or town: repeatedly walks to the furthest visible square that way (or, when the screen " +
    "shows no way on, the furthest one on the whole map), routing around walls and ledges, until you enter a new map, a battle " +
    "starts, something scripted stops you, or it's a dead end. " +
    "maps=N keeps going the same way through up to N map changes in one call.",
  inputSchema: {
    show_map: SHOW_MAP,
    direction: z.enum(["up", "down", "left", "right"]),
    max_legs: z.number().int().min(1).max(40).optional(),
    maps: z.number().int().min(1).max(6).optional(),
    trainers: TRAINERS,
  },
}, wrap(async ({ show_map, ...a }) => afterAction(await call("travel", a), { keepMap: !!show_map })));

server.registerTool("walk_to", {
  title: "Walk to",
  description:
    "Pathfind to map coordinate (x, y) anywhere on the current map (see get_map full=true) and walk there, re-planning around people. If the target is a person, " +
    "sign or object, stops next to it and faces it; interact=true also presses A and reads the dialogue.",
  inputSchema: {
    show_map: SHOW_MAP,
    x: z.number().int(),
    y: z.number().int(),
    interact: z.boolean().optional(),
    trainers: TRAINERS,
  },
}, wrap(async ({ show_map, ...a }) => afterAction(await call("walk_to", a), { keepMap: !!show_map })));

server.registerTool("get_map", {
  title: "Map around you",
  description:
    "Text map from game memory. Default is the visible screen (10×9), or the whole map when it's small (a house, a shop, a Pokémon Center); full=true shows the WHOLE current map plus its exits. " +
    "Rows/columns are map coordinates for walk_to. Maps in other results use the same symbols; legend=true adds the meaning of each symbol on that map to the result. " +
    MAP_LEGEND + (NARROW_GRID ? NARROW_GRID_NOTE : ""),
  inputSchema: {
    full: z.boolean().optional().describe("Whole current map instead of the screen"),
    legend: z.boolean().optional().describe("Add what each symbol on this map means to the result"),
  },
}, wrap(mapResult));

server.registerTool("exit_map", {
  title: "Exit map",
  description:
    "Walk to this map's edge in a direction and cross into the connected map. " +
    "Pathfinds over the whole map. Fails if the map has no exit that way (then look for a door D).",
  inputSchema: {
    show_map: SHOW_MAP, direction: z.enum(["up", "down", "left", "right"]), trainers: TRAINERS },
}, wrap(async ({ show_map, ...a }) => afterAction(await call("exit_map", a), { keepMap: !!show_map })));

server.registerTool("advance_text", {
  title: "Advance dialogue",
  description:
    "Press A through dialogue/battle text until a menu or YES/NO choice appears, the text box closes, or max_presses is hit. " +
    "Returns every message shown — use this instead of pressing A one box at a time.",
  inputSchema: { max_presses: z.number().int().min(1).max(80).optional() },
}, wrap(async (a) => afterAction(await call("advance_text", a))));

server.registerTool("start_game", {
  title: "Start game",
  description:
    "From the title screen of a fresh run: sets options (fast text, animations off, battle style SET, as the rules require) and names you and your rival. " +
    "Stops in the bedroom when the game hands you control. Call right after new_run.",
  inputSchema: {
    name: z.string().regex(/^[A-Za-z]{1,7}$/).optional().describe("Player name (default PLAYER)"),
    rival: z.string().regex(/^[A-Za-z]{1,7}$/).optional().describe("Rival name (default RIVAL)"),
  },
}, wrap(async (a) => afterAction(await call("start_game", a))));

server.registerTool("make_lead", {
  title: "Make lead",
  description:
    "Swap a party Pokémon (species, nickname or slot number) into the lead slot via the start menu.",
  inputSchema: { pokemon: z.string().describe('Species/nickname as shown in your party, or slot "2"') },
}, wrap(async (a) => afterAction(await call("make_lead", a))));

server.registerTool("rare_candy", {
  title: "Use Rare Candies",
  description:
    "Outside battle: feed Rare Candies to a party slot through the bag until it reaches `level`. " +
    "Evolutions play out; if a move-learning question " +
    "comes up it stops with the prompt open — answer it with choose.",
  inputSchema: {
    slot: z.number().int().min(1).max(6).describe("Party slot 1-6"),
    level: z.number().int().min(2).max(100).describe("Target level"),
  },
}, wrap(async (a) => afterAction(await call("rare_candy", a))));

server.registerTool("switch_pokemon", {
  title: "Switch Pokémon",
  description: "In battle: switch to a party Pokémon (nickname, species or slot). Also picks who comes out after a faint ('Use next POKéMON?' in wild battles, 'Bring out which POKéMON?' in trainer battles). Returns the battle messages.",
  inputSchema: { pokemon: z.string().describe('Nickname, species or slot "1"-"6"') },
}, wrap(async (a) => afterAction(await call("switch_pokemon", a))));

server.registerTool("throw_ball", {
  title: "Throw a Poké Ball",
  description: "In a wild battle: throw the ball you choose and report the result. " +
    "On a catch it answers the nickname prompt with `nickname` (Nuzlocke: always give one).",
  inputSchema: {
    nickname: z.string().max(10).optional().describe("Nickname for the catch (letters)"),
    ball: z.enum(["poke", "great", "ultra", "master"]).describe("Which ball to throw"),
  },
}, wrap(async (a) => afterAction(await call("throw_ball", a))));

server.registerTool("use_item", {
  title: "Use an item",
  description: "Outside battle: use a bag item, on a party Pokémon when it needs one (e.g. SUPER POTION on BEAKER, REPEL on nobody). Closes the menus after.",
  inputSchema: {
    item: z.string().describe('Item name, e.g. "SUPER POTION", "REPEL"'),
    pokemon: z.string().optional().describe("Target: nickname, species or slot"),
  },
}, wrap(async (a) => afterAction(await call("use_item", a))));

server.registerTool("fight_trainer", {
  title: "Fight a trainer",
  description: "Walk up to the trainer at (x, y), talk, and play through the intro to the battle menu.",
  inputSchema: { x: z.number().int(), y: z.number().int() },
}, wrap(async (a) => afterAction(await call("fight_trainer", a))));

server.registerTool("hunt", {
  title: "Hunt the first encounter",
  description: "Nuzlocke: pace the nearest grass (or cave floor) until a wild battle starts, and stop in it — the result says whether it counts " +
    "for this area. With the encounters policy flee_uncounted it runs from ones that don't count and keeps pacing.",
  inputSchema: { max_steps: z.number().int().min(10).max(2000).optional() },
}, wrap(async (a) => afterAction(await call("hunt", a))));

server.registerTool("policies", {
  title: "Walking policies",
  description: "Your standing choices for how walking behaves (call with no arguments to see them). " +
    "encounters: stop (default) hands you every wild battle; flee_uncounted runs from wild Pokémon that don't count for the area " +
    "(Nuzlocke: area used, dupe) and walks on — a battle that counts still stops you, and a failed escape hands the battle back. " +
    "trainers: avoid (default) routes around unbeaten trainers' sight where possible and stops short where it isn't, saying whose " +
    "sight is in the way; ignore takes shortest paths, through sight (that trainer then battles you), and reports whose sight they crossed. " +
    "Path tools also take trainers for one call.",
  inputSchema: {
    encounters: z.enum(["stop", "flee_uncounted"]).optional(),
    trainers: z.enum(["ignore", "avoid"]).optional(),
  },
}, wrap(async (a) => json(await call("policies", a))));

server.registerTool("field_move", {
  title: "Field move",
  description: "Use a field move (CUT, SURF, STRENGTH, FLASH…) from whichever party Pokémon knows it. Face the tree/water first.",
  inputSchema: { move: z.string().describe('e.g. "CUT"') },
}, wrap(async (a) => afterAction(await call("field_move", a))));

server.registerTool("choose", {
  title: "Choose menu option",
  description:
    "Pick an on-screen menu option by its text — YES/NO prompts, NEW NAME, FIGHT/PKMN/ITEM/RUN, shop or start-menu entries. " +
    "Moves the ▶ cursor until it's on that option, presses A, and returns the dialogue that follows. Safer than raw presses.",
  inputSchema: { option: z.string().describe('Option text as shown, e.g. "YES", "NO", "ITEM"') },
}, wrap(async (a) => afterAction(await call("choose", a))));

server.registerTool("fight", {
  title: "Fight",
  description:
    "In battle: choose FIGHT, select a move (by name or slot 1–4) and play out the turn. Returns the battle messages " +
    "(damage, crits, status, faints) and stops at the next decision.",
  inputSchema: {
    move: z.union([z.string(), z.number().int().min(1).max(4)]).describe("Move name or slot 1-4"),
  },
}, wrap(async (a) => afterAction(await call("fight", a))));

server.registerTool("wait", {
  title: "Wait",
  description: "Let the game run for N frames without input (60 frames = 1 second).",
  inputSchema: { frames: z.number().int().min(1).max(3600).default(60) },
}, wrap(async (a) => afterAction(await call("wait", a))));

if (!PRESET) server.registerTool("save_state", {
  title: "Save state",
  description: "Save an emulator state to a named slot. Note: reloading states to undo bad outcomes is against the rules.",
  inputSchema: { slot: z.string().max(20).default("1") },
}, wrap(async (a) => json(await call("save_state", a))));

if (!PRESET) server.registerTool("load_state", {
  title: "Load state",
  description: "Load a state saved with save_state (for recovering from input mistakes, not to undo deaths).",
  inputSchema: { slot: z.string().max(20).default("1") },
}, wrap(async (a) => {
  formatter.reset(); // the screen jumps to the saved one
  return json(await call("load_state", a));
}));

// A benchmark run has one attempt: the server starts it, and the model can't start another.
if (!PRESET) server.registerTool("new_run", {
  title: "New run",
  description: "Finish the current attempt and start a new one from the user's loaded ROM, from power-on. Starts the new run immediately. " +
    "rom_path loads a ROM file from disk first (e.g. when the app has none loaded).",
  inputSchema: {
    // Under a benchmark preset only its ruleset is offered (applyPreset refuses the others anyway).
    mode: z.enum(PRESET ? [PRESET.ruleset] : RULESET_IDS).optional().describe("Ruleset (default: the current run's)"),
    rare_candies: z.boolean().optional().describe("Hardcore Nuzlocke: infinite Rare Candies (default on)"),
    hard_level_caps: z.boolean().optional().describe("Hardcore Nuzlocke: hard level caps — a Pokémon at the cap gains no more levels (default off)"),
    first_rival_free: z.boolean().optional().describe("Hardcore Nuzlocke: the first rival battle doesn't count — a faint there isn't a death (default off)"),
    end_on_violation: z.boolean().optional().describe("The first rule broken ends the run as disqualified (default: on for Hardcore Nuzlocke)"),
    lenient_rules: z.array(z.enum(["first-encounter", "dead-pokemon", "level-cap", "items-in-battle", "nickname", "battle-style"]))
      .optional().describe("Hardcore Nuzlocke rules whose violations are only logged this run (for tuning the harness)"),
    goal_badges: z.number().int().min(1).max(8).nullable().optional().describe("Short run: winning this many badges wins the run; null = full game (default: keep the current run's goal)"),
    rom_path: z.string().optional().describe("Path to a Red/Blue/Yellow .gb or Crystal .gbc file to load as the base ROM"),
  },
}, wrap(async (a) => {
  const params = applyPreset(PRESET, { mode: a.mode, rare_candies: a.rare_candies, hard_level_caps: a.hard_level_caps, first_rival_free: a.first_rival_free, end_on_violation: a.end_on_violation, lenient_rules: a.lenient_rules, goal_badges: a.goal_badges });
  if (a.rom_path) {
    const bytes = readFileSync(a.rom_path);
    params.rom = bytes.toString("base64");
    params.rom_name = a.rom_path.split(/[\\/]/).pop();
  }
  // Under a preset a run on the title screen would only be replaced by the same run: the page refuses then.
  await call("new_run", { ...params, refuse_unstarted: Boolean(PRESET) });
  // The page reloads to boot the new run from power-on: wait for the new page's connection (it
  // fails with what happened if none comes), then for the run to answer as it finishes booting.
  await link.waitForReload(20_000);
  const deadline = Date.now() + 20_000;
  for (;;) {
    try {
      const state = await call("get_state");
      if (state) return json(state);
    } catch {
      /* still booting */
    }
    if (Date.now() > deadline) throw new Error("The new run's page reconnected but didn't answer. Check that AI control is on.");
    await new Promise((r) => setTimeout(r, 250));
  }
}));

// The model reports what lets it down, in every run unless turned off (a playtest asks it to look
// for such things). Each report is in the run log with where it happened (npm run bench:friction
// lists them), and it doesn't use up a tool call.
if (REPORT_ISSUE) {
  let reports = 0;
  server.registerTool("report_issue", {
    title: "Report a tool problem",
    description: "Report a tool that let you down (a result that doesn't match the screen, a wrong-looking map, " +
      "a move that fails where it looks like it should work, an error you don't understand, something that takes many tries). " +
      "It doesn't use up a tool call; keep playing after it.",
    inputSchema: {
      did: z.string().describe("What you did (the tool and arguments, or the steps)"),
      expected: z.string().describe("What you expected to happen"),
      happened: z.string().describe("What happened instead"),
    },
  }, wrap(async () => ({ content: [{ type: "text", text: `Reported (${++reports} this run). Keep playing.` }] })));
}

// The hint tool, only under the preset option "hints" (see hints.mjs): the next story step, read
// from the game state and the maps the run log has seen. Each hint is a tool call like any other.
if (PRESET?.hints) {
  server.registerTool("hint", {
    title: "Hint",
    description: "Where to go next in the story, and what starts that step. Each hint uses up a tool call.",
    inputSchema: {},
  }, wrap(async () => {
    const state = await call("get_state");
    const runLog = RUN_LOG_FILE && existsSync(RUN_LOG_FILE) ? readFileSync(RUN_LOG_FILE, "utf8") : "";
    const calls = runLog.split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((c) => c && c.type !== "session");
    const game = gameData(state?.run?.game);
    const reached = new Set(Object.keys(objectivesOf(calls, game)));
    const facts = await call("hint_facts");
    return { content: [{ type: "text", text: `💡 ${nextHint(hintState(state, runLog, facts), game.objectives, reached, game)}` }] };
  }));
}

server.registerTool("get_rules", {
  title: "Rules",
  description: "The rules this run follows and its goal.",
  inputSchema: {},
}, wrap(async () => {
  const r = await call("get_rules");
  return { content: [{ type: "text", text: BUDGET ? `${r.rules}\n\n${callsLine()}` : r.rules }] };
}));

await server.connect(new StdioServerTransport());
log("MCP server ready (stdio)");
