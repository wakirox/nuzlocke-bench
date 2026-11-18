// Canonical metadata for every MCP tool the server can offer. Kept free of external imports so
// zero-dependency scripts (bench-results.mjs, run-summary.mjs) and runner helpers (agy-player.mjs,
// batch.mjs, call-budget.mjs) all read the same list instead of maintaining copies or scraping source.

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
 * @property {boolean} [counted]
 * @property {(env: ToolCatalogEnv) => boolean} [enabled]
 */

/** @type {readonly ToolMeta[]} */
export const TOOL_CATALOG = [
  // Actions a `do` batch may run as steps (order matches the tool schema's enum and description).
  { name: "walk", kind: "action", batch: "step" },
  { name: "walk_to", kind: "action", batch: "step" },
  { name: "travel", kind: "action", batch: "step" },
  { name: "exit_map", kind: "action", batch: "step" },
  { name: "go_to", kind: "action", batch: "step" },
  { name: "note_route", kind: "action", batch: "step" },
  { name: "advance_text", kind: "action", batch: "step" },
  { name: "choose", kind: "action", batch: "step" },
  { name: "press", kind: "action", batch: "step" },
  { name: "wait", kind: "action", batch: "step" },
  { name: "use_item", kind: "action", batch: "step" },
  { name: "rare_candy", kind: "action", batch: "step" },
  { name: "make_lead", kind: "action", batch: "step" },
  { name: "field_move", kind: "action", batch: "step" },
  { name: "fight_trainer", kind: "action", batch: "step" },
  { name: "hunt", kind: "action", batch: "step" },
  { name: "fight", kind: "action", batch: "step" },
  { name: "switch_pokemon", kind: "action", batch: "step" },
  { name: "throw_ball", kind: "action", batch: "step" },

  // Reads a `do` batch may end with (get_map or get_state).
  { name: "get_map", kind: "read", batch: "final_read" },
  { name: "get_state", kind: "read", batch: "final_read" },

  // Standalone reads (never inside a `do` batch: their output is for deciding what to do next).
  { name: "read_screen_text", kind: "read", batch: "none" },
  { name: "get_screen", kind: "read", batch: "none" },
  { name: "get_rules", kind: "read", batch: "none" },
  { name: "notes", kind: "read", batch: "none" },
  { name: "routes", kind: "read", batch: "none" },
  { name: "policies", kind: "read", batch: "none" },
  { name: "hint", kind: "read", batch: "none", enabled: ({ preset }) => !!preset?.hints },

  // Standalone actions and session/harness controls.
  { name: "do", kind: "meta", batch: "none" },
  { name: "forget_route", kind: "action", batch: "none" },
  { name: "start_game", kind: "action", batch: "none" },
  { name: "save_state", kind: "meta", batch: "none", enabled: ({ preset }) => !preset },
  { name: "load_state", kind: "meta", batch: "none", enabled: ({ preset }) => !preset },
  { name: "new_run", kind: "meta", batch: "none", enabled: ({ preset }) => !preset },
  { name: "report_issue", kind: "meta", batch: "none", counted: false, enabled: ({ reportIssue = true }) => !!reportIssue },
];

/** Tools a `do` batch may run as steps. */
export const BATCH_TOOLS = TOOL_CATALOG.filter((t) => t.batch === "step").map((t) => t.name);

/** Reads a `do` batch may end with, run once every step before them went through. */
export const FINAL_READ_TOOLS = TOOL_CATALOG.filter((t) => t.batch === "final_read").map((t) => t.name);

/** Tools that only read: they answer the model, so they're called on their own, never as an intermediate step. */
export const READ_TOOLS = TOOL_CATALOG.filter((t) => t.kind === "read").map((t) => t.name);

/** Tools that don't count against a benchmark run's call budget: they aren't play. */
export const UNCOUNTED = new Set(TOOL_CATALOG.filter((t) => t.counted === false).map((t) => t.name));

/**
 * Names of the tools offered under `env` (`preset`, `reportIssue`). Used by runner configs (e.g. agy)
 * so only the tools actually registered for that run are listed.
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
