// The `do` tool: several of the model's own actions in one call. Each step is a tool the model
// could have called by itself, with the arguments it chose; the batch only saves the round trips.
// It never decides anything: it stops at the first step that leaves something new to decide
// (a battle, an interruption, a rule event, an error, the end of the run) and reports
// everything that happened up to there.

import { plainErrorScreen, sentences } from "./format.mjs";
import { BATCH_TOOLS, stepToolError } from "./tool-catalog.mjs";

export { BATCH_TOOLS, stepToolError };

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

/**
 * Why a walk's report says it ended before getting where it was going ("up 2/6 — stopped: blocked…",
 * "stopped short: the only way on crosses…", "3 legs → stopped: NOVA is hurt by poison"), or null.
 * Crossing into the next map is how a walk out of a map ends, and a battle is caught on its own.
 * Of an exit_map's retries (" | retry: ") only the last says where it ended.
 */
export function walkCutShort(walk) {
  if (typeof walk !== "string") return null;
  const last = walk.split(" | retry: ").at(-1);
  const why = [...last.matchAll(/\bstopped(?: short)?:? (.+?)(?= —|; | \(ran from|$)/g)].at(-1)?.[1].trim();
  if (!why || /^(?:entered a new map|a battle started)/.test(why)) return null;
  return why.split(/\. (?=[A-Za-z])/)[0];
}

/** The legs of a walk's path ("U1 R4", "up 3, right 2"), read the way the walk tool reads them. */
const pathLegs = (path) => [...String(path ?? "").matchAll(/\b(up|down|left|right|u|d|l|r)\s*(\d+)?/gi)].length;

/**
 * Why a step's own tool ended where the next steps weren't planned from, or null: a walk that crossed
 * into the next map with legs of its path still to go, or a hunt that ended without a battle.
 */
function endedEarly(r, step) {
  if (step?.tool === "walk" && typeof r.walk === "string" && / — stopped: entered a new map/.test(r.walk)) {
    const ran = r.walk.split(" — ")[0].split(", ").length;
    const legs = pathLegs(step.args?.path);
    if (ran < legs) return `entered a new map with ${legs - ran} leg${legs - ran > 1 ? "s" : ""} of the path left`;
  }
  if (step?.tool === "hunt") return "the hunt ended without a battle";
  return null;
}

/**
 * Why the batch can't go on after this step's result, or null.
 * @param {any} r
 * @param {{ tool: string, args?: any } | null} [step] the step that gave it
 */
export function stopReason(r, step = null) {
  if (!r || typeof r !== "object") return null;
  const s = r.status ?? {};
  if (s.outcome) return "the run ended";
  if (r.crashed) return "the game crashed";
  if (r.saveWarning) return "autosave is failing";
  if (s.battle && s.battle !== "none") return "in battle";
  if (r.stopped) return `the step stopped early (${r.stopped})`;
  // The next steps were planned from where this one should have ended.
  const short = walkCutShort(r.walk);
  if (short) return `the walk stopped short (${short})`;
  // fight_trainer that talked to someone but started no battle.
  if (typeof r.note === "string" && /^No battle started\b/.test(r.note)) return "no battle started";
  if (r.events?.some((e) => /^\[(warning|violation)\]/.test(e))) return "a rule event";
  return endedEarly(r, step);
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
    const why = stopReason(result, { tool, args });
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
