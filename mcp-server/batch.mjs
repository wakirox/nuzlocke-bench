// The `do` tool: several of the model's own actions in one call. Each step is a tool the model
// could have called by itself, with the arguments it chose; the batch only saves the round trips.
// It never decides anything: it stops at the first step that leaves something new to decide
// (a battle, an interruption, a rule event, an error, the end of the run) and reports
// everything that happened up to there.

import { plainErrorScreen, sentences } from "./format.mjs";

/** Tools a batch may run. Reads (get_state, get_map…) aren't here: their output is for deciding. */
export const BATCH_TOOLS = [
  "walk", "walk_to", "travel", "exit_map", "go_to", "note_route", "advance_text", "choose", "press", "wait",
  "use_item", "rare_candy", "make_lead", "field_move", "fight_trainer", "hunt", "fight", "switch_pokemon", "throw_ball",
];

/** Tools that only read: they answer the model, so they're called on their own, never as a step. */
const READS = ["get_state", "get_map", "get_screen", "read_screen_text", "get_rules", "notes", "routes", "policies"];

/** What's wrong with a step's tool name, in words the model can act on. */
export function stepToolError(name) {
  if (READS.includes(name)) return `${name} can't be a step: reads answer you, so call ${name} on its own (before or after the do). Only get_map or get_state may end a batch.`;
  return `${JSON.stringify(name)} isn't a step. Steps can be: ${BATCH_TOOLS.join(", ")}.`;
}

/**
 * A step as { tool, args }. Arguments written next to `tool` ({ tool: "walk_to", x: 6, y: 3 }) are
 * that tool's arguments too: dropping them would run the tool without them.
 */
export function normalizeStep(step) {
  const { tool, args, ...rest } = step ?? {};
  const both = Object.keys(rest).filter((k) => args && k in args);
  if (both.length) throw new Error(`${both.join(", ")} given both in args and next to tool`);
  return { tool, args: { ...rest, ...(args ?? {}) } };
}

/** Why the batch can't go on after this step's result, or null. */
export function stopReason(r) {
  if (!r || typeof r !== "object") return null;
  const s = r.status ?? {};
  if (s.outcome) return "the run ended";
  if (r.crashed) return "the game crashed";
  if (r.saveWarning) return "autosave is failing";
  if (s.battle && s.battle !== "none") return "in battle";
  if (r.stopped) return `the step stopped early (${r.stopped})`;
  if (r.events?.some((e) => /^\[(warning|violation)\]/.test(e))) return "a rule event";
  return null;
}

/**
 * Runs steps in order with exec(tool, args) until one fails or leaves something to decide.
 * Returns each step's result (or error) and why it stopped early (null when every step ran).
 */
export async function runBatch(steps, exec) {
  const done = [];
  for (let i = 0; i < steps.length; i++) {
    const { tool, args = {} } = steps[i];
    let result;
    try {
      result = await exec(tool, args);
    } catch (e) {
      done.push({ tool, error: e?.message ?? String(e) });
      return { done, stopped: i < steps.length - 1 ? `at step ${i + 1} (${tool}): it failed` : null, skipped: steps.length - i - 1 };
    }
    done.push({ tool, result });
    const why = stopReason(result);
    if (why && i < steps.length - 1) return { done, stopped: `after step ${i + 1} (${tool}): ${why}`, skipped: steps.length - i - 1 };
  }
  return { done, stopped: null, skipped: 0 };
}

/** One step's outcome in a line or few, without the screen (only the last step shows it). */
export function stepSummary(i, step) {
  const head = `${i + 1}. ${step.tool}`;
  if (step.error) return `${head} ✗ ${plainErrorScreen(step.error)}`;
  const r = step.result;
  if (!r || typeof r !== "object" || !("status" in r)) return `${head}: ${JSON.stringify(r)}`;
  const bits = [
    r.walk ? `walk: ${r.walk}` : null,
    r.chose ? `chose ${r.chose}` : null,
    r.used ? `used ${r.used}` : null,
    r.switchedTo ? `switched to ${r.switchedTo}` : null,
    r.threw ? `threw a ${r.threw}${r.caught ? " — caught!" : ""}` : null,
    r.stopped ? `stopped: ${r.stopped}` : null,
  ].filter(Boolean);
  const lines = [`${head}${bits.length ? ": " + bits.join("; ") : " ✓"}`];
  for (const m of sentences(r.messages)) lines.push(`   • ${m}`);
  for (const e of r.events ?? []) lines.push(`   📋 ${e}`);
  return lines.join("\n");
}
