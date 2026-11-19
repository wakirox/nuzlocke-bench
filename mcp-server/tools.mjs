// Declarative registry of every MCP tool the server offers: its schema, wording, batch/budget
// metadata (from tool-catalog.mjs) and handler, registered through one explicit wrapper pipeline.

import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { BATCH_TOOLS, FINAL_READ_TOOLS, TOOL_CATALOG, stepToolError } from "./tool-catalog.mjs";
import { normalizeStep, runBatch, stepSummary } from "./batch.mjs";
import { UNCOUNTED_RESULT, withCallBudget } from "./call-budget.mjs";
import { COMPACT_GRID_NOTE, MAP_LEGEND, NARROW_GRID_NOTE, compactGrids, hideEffectiveness as stripEffectiveness, json, legendFor, narrowGrids, pickSections, plainErrorScreen, screenText } from "./format.mjs";
import { applyPreset } from "./benchmark.mjs";
import { entriesOf, NOTES_MAX, numbered, updateNotes } from "./notes.mjs";
import { hintState, nextHint } from "./hints.mjs";
import { objectivesOf } from "./report.mjs";
import { gameData } from "./games/index.mjs";

// Maps are shown on request: a move's result leaves the area's map out unless the model asks for it here.
const SHOW_MAP = z.boolean().optional().describe("Also show the area's map after moving (otherwise only get_map shows it)");

// Per-call override of the standing `trainers` policy (see the policies tool).
const TRAINERS = z.enum(["ignore", "avoid"]).optional()
  .describe("This call only: ignore = shortest path (crossings of trainers' sight are reported); avoid = route around their sight where possible");

const DIR = z.enum(["up", "down", "left", "right"]);

const STATE_SECTIONS = [
  "run", "location", "battle", "lead", "party", "nuzlocke", "enemy", "bag",
  "healsInBag", "badges", "money", "pokemonCenterHeals", "catches", "recentRuleEvents",
];

/** An error for a call refused before any of it ran: like a tool's own bad arguments, it doesn't count against the call budget. */
const refused = (message, cause) => Object.assign(new Error(message, cause ? { cause } : undefined), { uncounted: true });

// ---- Shared runners for tools that forward straight to the browser bridge ----

/** Game action whose result goes through `afterAction` (status, messages, events, changed screen). */
const action = (cmd) => async (args, { call, afterAction }) => afterAction(await call(cmd, args));

/** Moving action that also accepts `show_map` to keep the area's map on the result. */
const moveAction = (cmd) => async ({ show_map, ...a }, { call, afterAction }) =>
  afterAction(await call(cmd, { ...a, show_map }), { keepMap: !!show_map });

/** Bridge command returning plain JSON. */
const passJson = (cmd) => async (args, { call }) => json(await call(cmd, args));

/** @param {{ only?: string[] }} args @param {any} ctx */
async function stateResult({ only } = {}, { call, budget }) {
  const state = await call("get_state");
  if (budget && state?.run) state.run.toolCalls = `${budget.used()} of ${budget.max}`;
  return json(pickSections(state, only));
}

/** @param {{ legend?: any, [key: string]: any }} args @param {any} ctx */
async function mapResult({ legend, ...a } = {}, { call, afterAction, grid }) {
  const r = await afterAction(await call("get_map", a), { keepMap: true });
  // The legend on request only (in every map it would cost tokens on each call), and only for
  // the symbols this map has.
  const text = (r.content ?? []).map((c) => c.text ?? "").join("\n");
  const key = legend && !r.isError ? legendFor(grid === "compact" ? compactGrids(text) : text) : null;
  if (key) r.content = [...r.content, { type: "text", text: key }];
  return r;
}

/**
 * Reads a batch may end with: run once every step has gone through, their answer after the steps'.
 * The model's batches kept ending with get_map or get_state ("walk there, then show me"), and
 * each was refused (6 times in a run, 2026-11-08). Anywhere else a read still isn't a step: its
 * answer is for deciding what to do next.
 * @type {Record<string, (args: any, ctx: any) => Promise<any>>}
 */
const FINAL_READS = { get_map: mapResult, get_state: stateResult };

/**
 * Tool definitions keyed by tool name; merged with TOOL_CATALOG below so metadata and handlers stay
 * in lockstep. `description` and `schema` may be functions of `{ preset, grid, hideEffectiveness, rulesetIds }`.
 * @type {Record<string, { title: string, description: string | ((env: any) => string), schema: Record<string, any> | ((env: any) => Record<string, any>), run: (args: any, ctx: any) => Promise<any> }>}
 */
const DEFINITIONS = {
  get_state: {
    title: "Get game state",
    description: ({ hideEffectiveness }) =>
      `Name-resolved game state: lead Pokémon (moves with type/power/PP${hideEffectiveness ? "" : "/effectiveness"}), enemy in battle, party, bag, location, badges, heals, catches, rule events and run outcome. ` +
      "only=[...] returns just those sections (cheaper).",
    schema: {
      only: z.array(z.enum(STATE_SECTIONS)).optional().describe("Sections to return (default: all)"),
    },
    run: stateResult,
  },

  do: {
    title: "Do several actions",
    description:
      "Run several of your own actions in one call, in order — e.g. walk_to a door, advance_text, choose YES, exit_map. " +
      "Each step is { tool, args: { …that tool's usual arguments } }. It stops after the first step that leaves something new to decide " +
      "(a battle, a step cut short, a tracker warning or violation, an error, the end of the run) and says which steps didn't run. " +
      "Returns every step's messages and the final screen. Steps can be: " + BATCH_TOOLS.join(", ") + "; the last step may also be " +
      FINAL_READ_TOOLS.join(" or ") + " (run only if every step before it went through).",
    schema: {
      steps: z.array(z.object({
        tool: z.enum([...BATCH_TOOLS, ...FINAL_READ_TOOLS], { error: (issue) => stepToolError(issue.input) }),
        args: z.record(z.string(), z.any()).optional().describe("That tool's arguments"),
      }).catchall(z.any())).min(1).max(12),
    },
    run: async ({ steps }, ctx) => {
      const { call, afterAction, schemas } = ctx;
      // Check every step's arguments before running any, so a typo doesn't leave the batch half done.
      const parsed = steps.map((raw, i) => {
        let st;
        try {
          st = normalizeStep(raw);
        } catch (e) {
          throw refused(`Step ${i + 1} (${raw.tool}): ${e.message}`, e);
        }
        if (FINAL_READS[st.tool] && i < steps.length - 1) {
          throw refused(`Step ${i + 1} (${st.tool}): a read can only be the last step (its answer is for deciding what to do next).`);
        }
        const schema = schemas[st.tool];
        const r = schema ? schema.safeParse(st.args ?? {}) : { success: true, data: st.args ?? {} };
        if (!r.success) throw refused(`Step ${i + 1} (${st.tool}): ${r.error.issues.map((x) => `${x.path.join(".") || "args"}: ${x.message}`).join("; ")}`);
        return { tool: st.tool, args: r.data };
      });
      const read = FINAL_READS[parsed[parsed.length - 1].tool] ? parsed.pop() : null;
      if (!parsed.length) throw refused(`A batch needs at least one action before ${read.tool}: call ${read.tool} on its own.`);
      // Only the last step's map is shown: show_map on an earlier one would use up a new map's first
      // full view (the bridge shows a map whole once) on a result nobody sees. A get_map at the end
      // shows the map itself, so then no step's show_map is kept (it would print a second map above it).
      for (const st of read?.tool === "get_map" ? parsed : parsed.slice(0, -1)) {
        if (st.args?.show_map) {
          const { show_map: _, ...rest } = st.args;
          st.args = rest;
        }
      }
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
      const answer = await FINAL_READS[read.tool](read.args, ctx);
      return { content: [{ type: "text", text }, { type: "text", text: `${done.length + 1}. ${read.tool}` }, ...answer.content], isError: answer.isError };
    },
  },

  read_screen_text: {
    title: "Read screen text",
    description: "The Game Boy screen's text, one line per box: Text (dialogue), Menu (▶ is the cursor; 'Menu (behind)' with ▷ is a menu a level back), Box (e.g. MONEY), then anything outside a box. A box's rows are joined with ' / '. ▼ means more text — press 'a'.",
    schema: {},
    run: async (_a, { call }) => {
      const r = await call("read_screen_text");
      return { content: [{ type: "text", text: screenText(r.lines) }] };
    },
  },

  get_screen: {
    title: "Screenshot",
    description: "PNG screenshot of the Game Boy screen (plus the decoded text). Use it to see the overworld map, sprites and positions.",
    schema: { scale: z.number().int().min(1).max(6).optional().describe("Upscale factor, default 3") },
    run: async ({ scale }, { call }) => {
      const r = await call("get_screen", { scale: scale ?? 3 });
      return {
        content: [
          { type: "image", data: r.png, mimeType: "image/png" },
          // The shared screen reader's no-text line points to get_screen: here the image is that.
          { type: "text", text: screenText(r.lines).replace("Use get_screen to see it.", "The image shows it.") },
        ],
      };
    },
  },

  press: {
    title: "Press buttons",
    description:
      "Press a sequence of Game Boy buttons, in order. Tokens: a, b, start, select, up, down, left, right; repeat with '*' (down*3); chords with '+' (up+b); pause with wait:N (frames, 60 = 1 s); name:SPROUT types a name on an open naming keyboard and confirms it. " +
      "Example: \"a a down*2 a wait:60 b\". Returns the screen text and state afterwards.",
    schema: {
      buttons: z.string().describe("Space- or comma-separated tokens"),
      hold_frames: z.number().int().min(1).max(600).optional().describe("Frames each press is held (default 6)"),
      wait_frames: z.number().int().min(0).max(600).optional().describe("Frames to wait after each press (default 20)"),
      show_map: SHOW_MAP,
    },
    run: moveAction("press"),
  },

  walk: {
    title: "Walk a path",
    description:
      "Walk a path in one call, e.g. \"up 3, right 2\" or \"U3 R2\" (or direction+tiles). Each leg stops early at walls, " +
      "people, warps or when a battle starts. Returns where you ended up (and the map around you with show_map).",
    schema: {
      show_map: SHOW_MAP,
      path: z.string().optional().describe('Legs like "up 3, right 2" or "U3 R2"'),
      direction: z.enum(["up", "down", "left", "right"]).optional(),
      tiles: z.number().int().min(1).max(30).optional(),
    },
    run: moveAction("walk"),
  },

  go_to: {
    title: "Go to map",
    description: "Travel to a map by its id (e.g. ROUTE_1) along the routes you noted with note_route — only those; " +
      "nothing is known in advance. Stops at battles and says where a noted route didn't work.",
    schema: { show_map: SHOW_MAP, map: z.string(), trainers: TRAINERS },
    run: moveAction("go_to"),
  },

  notes: {
    title: "Your notes",
    description: "Your own notes for this run, a numbered list kept outside the conversation: if a long run's conversation is summarized, they're still here. " +
      `With nothing, lists them. add puts entries at the end, remove takes entries out by number, clear empties the list; ` +
      `in one call they apply in that order: clear, remove, add (${NOTES_MAX} characters at most in all). A new run starts with none.`,
    schema: {
      add: z.union([z.string(), z.array(z.string())]).optional().describe("Entry or entries to add at the end (one line each)"),
      remove: z.array(z.number().int()).optional().describe("Numbers of the entries to remove, as last listed"),
      clear: z.boolean().optional().describe("Empty the list first"),
    },
    run: async ({ add, remove, clear }, { notes }) => {
      const now = updateNotes(notes.read(), { add, remove, clear });
      if (add != null || remove?.length || clear) notes.write(now);
      const entries = entriesOf(now);
      return { content: [{ type: "text", text: entries.length ? `Notes (${entries.length} entries, ${now.length}/${NOTES_MAX} characters):\n${numbered(entries)}` : "No notes yet." }] };
    },
  },

  note_route: {
    title: "Note a route",
    description: "Write down how to get from one map to a neighbouring one, so go_to can travel it later: either cross the map's edge " +
      "(exit: up/down/left/right) or step on a door/warp square (door: {x, y} in the from-map's coordinates; push: a direction to step " +
      "after, for warps you leave by walking, like building exits). Map ids as in 📍 [BRACKETS]. Kept for this run; replaces an older note.",
    schema: {
      from: z.string().optional().describe("Map you leave from (default: the map you're on)"),
      to: z.string(),
      exit: DIR.optional(),
      door: z.object({ x: z.number().int().min(0), y: z.number().int().min(0) }).optional(),
      push: DIR.optional(),
    },
    run: passJson("note_route"),
  },

  forget_route: {
    title: "Forget a route",
    description: "Remove a route you noted (from → to).",
    schema: { from: z.string(), to: z.string() },
    run: passJson("forget_route"),
  },

  routes: {
    title: "Your routes",
    description: "The routes you've noted this run.",
    schema: {},
    run: async (_a, { call }) => {
      const r = await call("routes");
      return { content: [{ type: "text", text: r.routes.length ? r.routes.join("\n") : "No routes noted yet." }] };
    },
  },

  travel: {
    title: "Travel",
    description:
      "Head in a direction across a route or town: repeatedly walks to the furthest visible square that way (or, when the screen " +
      "shows no way on, the furthest one on the whole map), routing around walls and ledges, until you enter a new map, a battle " +
      "starts, something scripted stops you, or it's a dead end. " +
      "maps=N keeps going the same way through up to N map changes in one call.",
    schema: {
      show_map: SHOW_MAP,
      direction: z.enum(["up", "down", "left", "right"]),
      max_legs: z.number().int().min(1).max(40).optional(),
      maps: z.number().int().min(1).max(6).optional(),
      trainers: TRAINERS,
    },
    run: moveAction("travel"),
  },

  walk_to: {
    title: "Walk to",
    description:
      "Pathfind to map coordinate (x, y) anywhere on the current map (see get_map full=true) and walk there, re-planning around people. If the target is a person, " +
      "sign or object, stops next to it and faces it; interact=true also presses A and reads the dialogue.",
    schema: {
      show_map: SHOW_MAP,
      x: z.number().int(),
      y: z.number().int(),
      interact: z.boolean().optional(),
      trainers: TRAINERS,
    },
    run: moveAction("walk_to"),
  },

  get_map: {
    title: "Map around you",
    description: ({ grid }) =>
      "Text map from game memory. Default is the visible screen (10×9), or the whole map when it's small (a house, a shop, a Pokémon Center); full=true shows the WHOLE current map plus its exits, as far as you've seen it: squares that were never on your screen are ?, and a door you haven't been through leads to ? (a Pokémon Center, Mart or Gym is known from outside). " +
      "Rows/columns are map coordinates for walk_to. Maps in other results use the same symbols; legend=true adds the meaning of each symbol on that map to the result. " +
      MAP_LEGEND + (grid === "compact" ? COMPACT_GRID_NOTE : grid === "narrow" ? NARROW_GRID_NOTE : ""),
    schema: {
      full: z.boolean().optional().describe("Whole current map instead of the screen"),
      legend: z.boolean().optional().describe("Add what each symbol on this map means to the result"),
    },
    run: mapResult,
  },

  exit_map: {
    title: "Exit map",
    description:
      "Walk to this map's edge in a direction and cross into the connected map. " +
      "Pathfinds over the whole map. Fails if the map has no exit that way (then look for a door D).",
    schema: { show_map: SHOW_MAP, direction: z.enum(["up", "down", "left", "right"]), trainers: TRAINERS },
    run: moveAction("exit_map"),
  },

  advance_text: {
    title: "Advance dialogue",
    description:
      "Press A through dialogue/battle text until a menu or YES/NO choice appears, the text box closes, or max_presses is hit. " +
      "Returns every message shown — use this instead of pressing A one box at a time.",
    schema: { max_presses: z.number().int().min(1).max(80).optional() },
    run: action("advance_text"),
  },

  start_game: {
    title: "Start game",
    description:
      "From the title screen of a fresh run: sets options (fast text, animations off, battle style SET, as the rules require) and names you and your rival. " +
      "Stops in the bedroom when the game hands you control. Call right after new_run.",
    schema: {
      name: z.string().regex(/^[A-Za-z]{1,7}$/).optional().describe("Player name (default PLAYER)"),
      rival: z.string().regex(/^[A-Za-z]{1,7}$/).optional().describe("Rival name (default RIVAL)"),
    },
    run: action("start_game"),
  },

  make_lead: {
    title: "Make lead",
    description: "Swap a party Pokémon (species, nickname or slot number) into the lead slot via the start menu.",
    schema: { pokemon: z.string().describe('Species/nickname as shown in your party, or slot "2"') },
    run: action("make_lead"),
  },

  rare_candy: {
    title: "Use Rare Candies",
    description:
      "Outside battle: feed Rare Candies to a party slot through the bag until it reaches `level`. " +
      "Evolutions play out; if a move-learning question comes up it stops with the prompt open — answer it with choose.",
    schema: {
      slot: z.number().int().min(1).max(6).describe("Party slot 1-6"),
      level: z.number().int().min(2).max(100).describe("Target level"),
    },
    run: action("rare_candy"),
  },

  switch_pokemon: {
    title: "Switch Pokémon",
    description: "In battle: switch to a party Pokémon (nickname, species or slot). Also picks who comes out after a faint ('Use next POKéMON?' in wild battles, 'Bring out which POKéMON?' in trainer battles). Returns the battle messages.",
    schema: { pokemon: z.string().describe('Nickname, species or slot "1"-"6"') },
    run: action("switch_pokemon"),
  },

  throw_ball: {
    title: "Throw a Poké Ball",
    description: "In a wild battle: throw the ball you choose and report the result. " +
      "On a catch it answers the nickname prompt with `nickname` (Nuzlocke: always give one).",
    schema: {
      nickname: z.string().regex(/^[A-Za-z]{1,10}$/, "letters A–Z only, up to 10").optional().describe("Nickname for the catch (letters A–Z, up to 10)"),
      ball: z.enum(["poke", "great", "ultra", "master", "safari"]).optional().describe("Which ball to throw (in the game reserve its own balls are thrown: safari, or leave it out)"),
    },
    run: action("throw_ball"),
  },

  use_item: {
    title: "Use an item",
    description: "Outside battle: use a bag item, on a party Pokémon when it needs one (e.g. SUPER POTION on BEAKER, REPEL on nobody), and on one of its moves for items that ask which (ETHER, PP UP). Closes the menus after.",
    schema: {
      item: z.string().describe('Item name as the bag lists it, e.g. "SUPER POTION", "REPEL"'),
      pokemon: z.string().optional().describe("Target: nickname, species or slot"),
      move: z.string().optional().describe("For items used on one move (ETHER, PP UP…): the move's name"),
    },
    run: action("use_item"),
  },

  fight_trainer: {
    title: "Fight a trainer",
    description: "Walk up to the trainer at (x, y), talk, and play through the intro to the battle menu.",
    schema: { x: z.number().int(), y: z.number().int() },
    run: action("fight_trainer"),
  },

  hunt: {
    title: "Hunt the first encounter",
    description: "Nuzlocke: pace the nearest grass (or cave floor) until a wild battle starts, and stop in it — the result says whether it counts " +
      "for this area. With the encounters policy flee_uncounted it runs from ones that don't count and keeps pacing.",
    schema: { max_steps: z.number().int().min(10).max(2000).optional() },
    run: action("hunt"),
  },

  policies: {
    title: "Walking policies",
    description: "Your standing choices for how walking behaves (call with no arguments to see them). " +
      "encounters: stop (default) hands you every wild battle; flee_uncounted runs from wild Pokémon that don't count for the area " +
      "(Nuzlocke: area used, dupe) and walks on — a battle that counts still stops you, and a failed escape hands the battle back. " +
      "trainers: avoid (default) routes around unbeaten trainers' sight where possible and stops short where it isn't, saying whose " +
      "sight is in the way; ignore takes shortest paths, through sight (that trainer then battles you), and reports whose sight they crossed. " +
      "Path tools also take trainers for one call.",
    schema: {
      encounters: z.enum(["stop", "flee_uncounted"]).optional(),
      trainers: z.enum(["ignore", "avoid"]).optional(),
    },
    run: passJson("policies"),
  },

  field_move: {
    title: "Field move",
    description: "Use a field move (CUT, SURF, STRENGTH, FLASH…) from whichever party Pokémon knows it. Face the tree/water first.",
    schema: { move: z.string().describe('e.g. "CUT"') },
    run: action("field_move"),
  },

  choose: {
    title: "Choose menu option",
    description:
      "Pick an on-screen menu option by its text — YES/NO prompts, NEW NAME, FIGHT/PKMN/ITEM/RUN, shop or start-menu entries. " +
      "Moves the ▶ cursor until it's on that option, presses A, and returns the dialogue that follows. Safer than raw presses.",
    schema: { option: z.string().describe('Option text as shown, e.g. "YES", "NO", "ITEM"') },
    run: action("choose"),
  },

  fight: {
    title: "Fight",
    description:
      "In battle: choose FIGHT, select a move (by name or slot 1–4) and play out the turn. Returns the battle messages " +
      "(damage, crits, status, faints) and stops at the next decision.",
    schema: {
      move: z.union([z.string(), z.number().int().min(1).max(4)]).describe("Move name or slot 1-4"),
    },
    run: action("fight"),
  },

  wait: {
    title: "Wait",
    description: "Let the game run for N frames without input (60 frames = 1 second).",
    schema: { frames: z.number().int().min(1).max(3600).default(60) },
    run: action("wait"),
  },

  save_state: {
    title: "Save state",
    description: "Save an emulator state to a named slot. Note: reloading states to undo bad outcomes is against the rules.",
    schema: { slot: z.string().max(20).default("1") },
    run: passJson("save_state"),
  },

  load_state: {
    title: "Load state",
    description: "Load a state saved with save_state (for recovering from input mistakes, not to undo deaths).",
    schema: { slot: z.string().max(20).default("1") },
    run: async (a, { call, formatter }) => {
      formatter.reset(); // the screen jumps to the saved one
      return json(await call("load_state", a));
    },
  },

  new_run: {
    title: "New run",
    description: "Finish the current attempt and start a new one from the user's loaded ROM, from power-on. Starts the new run immediately. " +
      "rom_path loads a ROM file from disk first (e.g. when the app has none loaded).",
    schema: ({ preset, rulesetIds }) => ({
      // Under a benchmark preset only its ruleset is offered (applyPreset refuses the others anyway).
      mode: z.enum(preset ? [preset.ruleset] : rulesetIds).optional().describe("Ruleset (default: the current run's)"),
      rare_candies: z.boolean().optional().describe("Hardcore Nuzlocke: infinite Rare Candies (default on)"),
      hard_level_caps: z.boolean().optional().describe("Hardcore Nuzlocke: hard level caps — a Pokémon at the cap gains no more levels (default off)"),
      first_rival_free: z.boolean().optional().describe("Hardcore Nuzlocke: the first rival battle doesn't count — a faint there isn't a death (default off)"),
      end_on_violation: z.boolean().optional().describe("The first rule broken ends the run as disqualified (default: on for Hardcore Nuzlocke)"),
      lenient_rules: z.array(z.enum(["first-encounter", "dead-pokemon", "level-cap", "items-in-battle", "nickname", "battle-style"]))
        .optional().describe("Hardcore Nuzlocke rules whose violations are only logged this run (for tuning the harness)"),
      goal_badges: z.number().int().min(1).max(8).nullable().optional().describe("Short run: winning this many badges wins the run; null = full game (default: keep the current run's goal)"),
      rom_path: z.string().optional().describe("Path to a Red/Blue/Yellow .gb or Crystal .gbc file to load as the base ROM"),
    }),
    run: async (a, { call, link, preset }) => {
      const params = applyPreset(preset, { mode: a.mode, rare_candies: a.rare_candies, hard_level_caps: a.hard_level_caps, first_rival_free: a.first_rival_free, end_on_violation: a.end_on_violation, lenient_rules: a.lenient_rules, goal_badges: a.goal_badges });
      if (a.rom_path) {
        const bytes = readFileSync(a.rom_path);
        params.rom = bytes.toString("base64");
        params.rom_name = a.rom_path.split(/[\\/]/).pop();
      }
      // Under a preset a run on the title screen would only be replaced by the same run: the page refuses then.
      await call("new_run", { ...params, refuse_unstarted: Boolean(preset) });
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
    },
  },

  report_issue: {
    title: "Report a tool problem",
    description: "Report a tool that let you down (a result that doesn't match the screen, a wrong-looking map, " +
      "a move that fails where it looks like it should work, an error you don't understand, something that takes many tries). " +
      "It doesn't use up a tool call; keep playing after it.",
    schema: {
      did: z.string().describe("What you did (the tool and arguments, or the steps)"),
      expected: z.string().describe("What you expected to happen"),
      happened: z.string().describe("What happened instead"),
    },
    run: async (_a, { nextReportNumber }) => ({ content: [{ type: "text", text: `Reported (${nextReportNumber()} this run). Keep playing.` }] }),
  },

  hint: {
    title: "Hint",
    description: "Where to go next in the story, and what starts that step. Each hint uses up a tool call.",
    schema: {},
    run: async (_a, { call, runLogFile }) => {
      const state = await call("get_state");
      const runLog = runLogFile && existsSync(runLogFile) ? readFileSync(runLogFile, "utf8") : "";
      const calls = runLog.split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((c) => c && c.type !== "session");
      /** @type {any} */
      const game = gameData(state?.run?.game);
      const reached = new Set(Object.keys(objectivesOf(calls, game)));
      const facts = await call("hint_facts");
      return { content: [{ type: "text", text: `💡 ${nextHint(hintState(state, runLog, facts), game.objectives, reached, game)}` }] };
    },
  },

  get_rules: {
    title: "Rules",
    description: "The rules this run follows and its goal.",
    schema: {},
    run: async (_a, { call, budget }) => {
      const r = await call("get_rules");
      const callsLine = budget
        ? `Tool calls: this run has ${budget.max} in all, and every call counts (this one too: ${budget.used()} used so far). When they're used up, the run ends.`
        : null;
      return { content: [{ type: "text", text: callsLine ? `${r.rules}\n\n${callsLine}` : r.rules }] };
    },
  },
};

// Fail at load time if TOOL_CATALOG, DEFINITIONS, and FINAL_READS ever fall out of sync.
{
  const catalogNames = new Set(TOOL_CATALOG.map((t) => t.name));
  const defNames = new Set(Object.keys(DEFINITIONS));
  const missingDef = [...catalogNames].filter((n) => !defNames.has(n));
  const missingMeta = [...defNames].filter((n) => !catalogNames.has(n));
  if (missingDef.length || missingMeta.length) {
    throw new Error(`Tool registry out of sync (missing definition: ${missingDef.join(", ") || "none"}; missing catalog entry: ${missingMeta.join(", ") || "none"})`);
  }
  const finalReadNames = new Set(Object.keys(FINAL_READS));
  if (finalReadNames.size !== FINAL_READ_TOOLS.length || FINAL_READ_TOOLS.some((n) => !finalReadNames.has(n))) {
    throw new Error(`FINAL_READS (${[...finalReadNames].join(", ")}) must match FINAL_READ_TOOLS (${FINAL_READ_TOOLS.join(", ")})`);
  }
}

/**
 * Resolves the enabled tool specs for `env`, with concrete descriptions and Zod input schemas.
 * @param {{ preset?: any, reportIssue?: boolean, grid?: "wide" | "narrow" | "compact", hideEffectiveness?: boolean, rulesetIds?: string[] }} [env]
 */
export function buildToolSpecs({ preset = null, reportIssue = true, grid = "narrow", hideEffectiveness = true, rulesetIds = ["nuzlocke"] } = {}) {
  const fullEnv = { preset, reportIssue, grid, hideEffectiveness, rulesetIds };
  return TOOL_CATALOG
    .filter((meta) => (meta.enabled ? meta.enabled({ preset, reportIssue }) : true))
    .map((meta) => {
      const def = DEFINITIONS[meta.name];
      const inputSchema = typeof def.schema === "function" ? def.schema(fullEnv) : def.schema;
      const description = typeof def.description === "function" ? def.description(fullEnv) : def.description;
      return {
        ...meta,
        title: def.title,
        description,
        inputSchema,
        strictSchema: z.object(inputSchema).strict(),
        run: def.run,
      };
    });
}

/**
 * Registers every enabled tool on `server` through a single explicit pipeline:
 *   runLog (outermost, records the call that ends the run and strips UNCOUNTED_RESULT)
 *     → callBudget (counts play calls, refunds refused ones)
 *       → safeWrap (waits for headless autostart, formats errors and grid/effectiveness)
 *         → spec.run
 */
export function registerTools(server, {
  call,
  link,
  autoStart,
  formatter,
  notes,
  budget = null,
  wrapLog,
  runLogFile = null,
  preset = null,
  reportIssue = true,
  grid = /** @type {"wide" | "narrow" | "compact"} */ ("narrow"),
  hideEffectiveness = true,
  rulesetIds = ["nuzlocke"],
}) {
  const specs = buildToolSpecs({ preset, reportIssue, grid, hideEffectiveness, rulesetIds });
  // Each tool's argument schema, so `do` can check its steps' arguments the same way.
  const schemas = Object.fromEntries(specs.map((s) => [s.name, s.strictSchema]));
  let reports = 0;

  const shown = (text) => {
    const t = grid === "compact" ? compactGrids(text) : grid === "narrow" ? narrowGrids(text) : text;
    return hideEffectiveness ? stripEffectiveness(t) : t;
  };
  const narrow = (r) => ({ ...r, content: r.content.map((c) => (c.type === "text" ? { ...c, text: shown(c.text) } : c)) });

  const ctx = {
    call,
    link,
    formatter,
    afterAction: (r, opts) => formatter.afterAction(r, opts),
    notes,
    budget,
    runLogFile,
    preset,
    grid,
    schemas,
    nextReportNumber: () => ++reports,
  };

  const safeWrap = (spec) => async (args) => {
    try {
      // Headless auto-start in progress: let it finish (a minute at most; then the tool says what's wrong).
      if (autoStart?.pending()) await Promise.race([autoStart.pending(), new Promise((r) => setTimeout(r, 60_000))]);
      return narrow(await spec.run(args ?? {}, ctx));
    } catch (e) {
      const text = plainErrorScreen(e.message ?? String(e)) + (e?.uncounted && budget ? "\n(Nothing ran, so this call doesn't count.)" : "");
      // Marked with or without a budget: the run log records it as uncounted (and drops the mark).
      return narrow({ isError: true, content: [{ type: "text", text }], ...(e?.uncounted ? { [UNCOUNTED_RESULT]: true } : {}) });
    }
  };

  for (const spec of specs) {
    let handler = safeWrap(spec);
    handler = withCallBudget(budget, handler, { counted: spec.counted !== false });
    handler = wrapLog(spec.name, handler);
    server.registerTool(spec.name, { title: spec.title, description: spec.description, inputSchema: spec.inputSchema }, handler);
  }
}
