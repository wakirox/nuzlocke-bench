// Canonical metadata for every MCP tool the server can offer. Kept free of external imports so
// zero-dependency scripts (bench-results.mjs, run-summary.mjs) and runner helpers (agy-player.mjs,
// batch.mjs, call-budget.mjs) all read the same list instead of maintaining copies or scraping source.
//
// IMPORTANT: Entry order in `TOOL_CATALOG` is the exact `tools/list` registration order the model
// reads in its prompt (guarded by `tests/server/tool-schema.test.ts`). Do not reorder casually.

/**
 * @typedef {Object} ToolCatalogEnv
 * @property {any} [preset]
 * @property {boolean} [reportIssue]
 */

/**
 * @typedef {Object} ToolMeta
 * @property {string} name
 * @property {"action" | "read" | "meta"} kind
 * @property {"step" | "final_read" | "none"} batch
 * @property {number} [batchOrder]  order in `do`'s `BATCH_TOOLS` / `FINAL_READ_TOOLS` enum & description
 * @property {boolean} [counted]
 * @property {(env: ToolCatalogEnv) => boolean} [enabled]
 */

/** @type {readonly ToolMeta[]} */
export const TOOL_CATALOG = [
  { name: "get_state", kind: "read", batch: "final_read", batchOrder: 2 },
  { name: "do", kind: "meta", batch: "none" },
  { name: "read_screen_text", kind: "read", batch: "none" },
  { name: "get_screen", kind: "read", batch: "none" },
  { name: "press", kind: "action", batch: "step", batchOrder: 9 },
  { name: "walk", kind: "action", batch: "step", batchOrder: 1 },
  { name: "go_to", kind: "action", batch: "step", batchOrder: 5 },
  { name: "notes", kind: "read", batch: "none" },
  { name: "note_route", kind: "action", batch: "step", batchOrder: 6 },
  { name: "forget_route", kind: "action", batch: "none" },
  { name: "routes", kind: "read", batch: "none" },
  { name: "travel", kind: "action", batch: "step", batchOrder: 3 },
  { name: "walk_to", kind: "action", batch: "step", batchOrder: 2 },
  { name: "get_map", kind: "read", batch: "final_read", batchOrder: 1 },
  { name: "exit_map", kind: "action", batch: "step", batchOrder: 4 },
  { name: "advance_text", kind: "action", batch: "step", batchOrder: 7 },
  { name: "start_game", kind: "action", batch: "none" },
  { name: "make_lead", kind: "action", batch: "step", batchOrder: 13 },
  { name: "rare_candy", kind: "action", batch: "step", batchOrder: 12 },
  { name: "switch_pokemon", kind: "action", batch: "step", batchOrder: 18 },
  { name: "throw_ball", kind: "action", batch: "step", batchOrder: 19 },
  { name: "use_item", kind: "action", batch: "step", batchOrder: 11 },
  { name: "fight_trainer", kind: "action", batch: "step", batchOrder: 15 },
  { name: "hunt", kind: "action", batch: "step", batchOrder: 16 },
  { name: "policies", kind: "read", batch: "none" },
  { name: "field_move", kind: "action", batch: "step", batchOrder: 14 },
  { name: "choose", kind: "action", batch: "step", batchOrder: 8 },
  { name: "fight", kind: "action", batch: "step", batchOrder: 17 },
  { name: "wait", kind: "action", batch: "step", batchOrder: 10 },
  { name: "save_state", kind: "meta", batch: "none", enabled: ({ preset }) => !preset },
  { name: "load_state", kind: "meta", batch: "none", enabled: ({ preset }) => !preset },
  { name: "new_run", kind: "meta", batch: "none", enabled: ({ preset }) => !preset },
  { name: "report_issue", kind: "meta", batch: "none", counted: false, enabled: ({ reportIssue = true }) => !!reportIssue },
  { name: "hint", kind: "read", batch: "none", enabled: ({ preset }) => !!preset?.hints },
  { name: "get_rules", kind: "read", batch: "none" },
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
export const READ_TOOLS = TOOL_CATALOG.filter((t) => t.kind === "read").map((t) => t.name);

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
