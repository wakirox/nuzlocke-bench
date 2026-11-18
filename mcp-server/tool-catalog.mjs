// Canonical metadata for every MCP tool the server can offer. Kept free of external imports so
// zero-dependency scripts (run-summary.mjs via call-budget.mjs) and runner/server modules
// (bench-run.mjs, batch.mjs, tools.mjs) all read the same list instead of keeping copies or scraping source.
//
// IMPORTANT: Entry order in `TOOL_CATALOG` is the exact `tools/list` registration order the model
// reads in its prompt (guarded by `tests/server/tool-order.snap.txt`). Do not reorder casually.

/**
 * @typedef {Object} ToolCatalogEnv
 * @property {any} [preset]
 * @property {boolean} [reportIssue]
 */

/**
 * @typedef {Object} ToolMeta
 * @property {string} name
 * @property {"step" | "final_read" | "none"} batch
 * @property {number} [batchOrder]  order in `do`'s `BATCH_TOOLS` / `FINAL_READ_TOOLS` enum & description
 * @property {boolean} [read]  only reads state: answers the model on its own, never as an intermediate `do` step
 * @property {boolean} [counted]
 * @property {(env: ToolCatalogEnv) => boolean} [enabled]
 */

/** @type {readonly ToolMeta[]} */
export const TOOL_CATALOG = [
  { name: "get_state", read: true, batch: "final_read", batchOrder: 2 },
  { name: "do", batch: "none" },
  { name: "read_screen_text", read: true, batch: "none" },
  { name: "get_screen", read: true, batch: "none" },
  { name: "press", batch: "step", batchOrder: 9 },
  { name: "walk", batch: "step", batchOrder: 1 },
  { name: "go_to", batch: "step", batchOrder: 5 },
  { name: "notes", read: true, batch: "none" },
  { name: "note_route", batch: "step", batchOrder: 6 },
  { name: "forget_route", batch: "none" },
  { name: "routes", read: true, batch: "none" },
  { name: "travel", batch: "step", batchOrder: 3 },
  { name: "walk_to", batch: "step", batchOrder: 2 },
  { name: "get_map", read: true, batch: "final_read", batchOrder: 1 },
  { name: "exit_map", batch: "step", batchOrder: 4 },
  { name: "advance_text", batch: "step", batchOrder: 7 },
  { name: "start_game", batch: "none" },
  { name: "make_lead", batch: "step", batchOrder: 13 },
  { name: "rare_candy", batch: "step", batchOrder: 12 },
  { name: "switch_pokemon", batch: "step", batchOrder: 18 },
  { name: "throw_ball", batch: "step", batchOrder: 19 },
  { name: "use_item", batch: "step", batchOrder: 11 },
  { name: "fight_trainer", batch: "step", batchOrder: 15 },
  { name: "hunt", batch: "step", batchOrder: 16 },
  { name: "policies", read: true, batch: "none" },
  { name: "field_move", batch: "step", batchOrder: 14 },
  { name: "choose", batch: "step", batchOrder: 8 },
  { name: "fight", batch: "step", batchOrder: 17 },
  { name: "wait", batch: "step", batchOrder: 10 },
  // A benchmark run has one attempt: the server starts it, and the model can't start another.
  { name: "save_state", batch: "none", enabled: ({ preset }) => !preset },
  { name: "load_state", batch: "none", enabled: ({ preset }) => !preset },
  { name: "new_run", batch: "none", enabled: ({ preset }) => !preset },
  // The model reports what lets it down, in every run unless turned off (a playtest asks for reports).
  // npm run bench:friction lists them, and it doesn't use up a tool call.
  { name: "report_issue", batch: "none", counted: false, enabled: ({ reportIssue = true }) => !!reportIssue },
  // Only under the preset option "hints" (see hints.mjs): read from the game state and the maps the
  // run log has seen, and each hint is a counted tool call like any other. Kept out of `read` so a
  // no-hints run's `do` error never reveals that a `hint` tool exists.
  { name: "hint", batch: "none", enabled: ({ preset }) => !!preset?.hints },
  { name: "get_rules", read: true, batch: "none" },
];

/** Tools a `do` batch may run as steps, in the order listed in `do`'s schema and description. */
export const BATCH_TOOLS = TOOL_CATALOG
  .filter((t) => t.batch === "step")
  .sort((a, b) => (a.batchOrder ?? 0) - (b.batchOrder ?? 0))
  .map((t) => t.name);

/** Reads a `do` batch may end with, run once every step before them went through. */
export const FINAL_READ_TOOLS = TOOL_CATALOG
  .filter((t) => t.batch === "final_read")
  .sort((a, b) => (a.batchOrder ?? 0) - (b.batchOrder ?? 0))
  .map((t) => t.name);

/** Tools that only read: they answer the model, so they're called on their own, never as an intermediate step. */
export const READ_TOOLS = TOOL_CATALOG.filter((t) => t.read).map((t) => t.name);

/** Tools that don't count against a benchmark run's call budget: they aren't play. */
export const UNCOUNTED = new Set(TOOL_CATALOG.filter((t) => t.counted === false).map((t) => t.name));

/**
 * Names of the tools offered under `env` (`preset`, `reportIssue`), in `tools/list` registration order.
 * Used by runner configs (e.g. agy) so only the tools actually registered for that run are listed.
 * @param {ToolCatalogEnv} [env]
 */
export function activeToolNames({ preset = null, reportIssue = true } = {}) {
  return TOOL_CATALOG.filter((t) => (t.enabled ? t.enabled({ preset, reportIssue }) : true)).map((t) => t.name);
}

/** What's wrong with a `do` step's tool name, in words the model can act on. */
export function stepToolError(name) {
  if (READ_TOOLS.includes(name)) {
    return `${name} can't be a step: reads answer you, so call ${name} on its own (before or after the do). Only ${FINAL_READ_TOOLS.join(" or ")} may end a batch.`;
  }
  return `${JSON.stringify(name)} isn't a step. Steps can be: ${BATCH_TOOLS.join(", ")}.`;
}
