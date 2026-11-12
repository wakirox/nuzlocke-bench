// A benchmark run's tool-call budget. The preset fixes how many calls a run gets, the same for
// every model, so how far a run got compares across models whatever they cost: dollars measure
// the price and wall time the hardware, not the play. Every call counts, reading state as much as
// acting, except report_issue. The count lives in the run's saves folder
// (tool-calls.txt: not a .json, so the page's backup restore doesn't pick it up), so a run
// continued with --resume goes on counting.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Tools that don't count: they aren't play. */
export const UNCOUNTED = new Set(["report_issue"]);

/** The line that ends a run out of calls (like format.mjs's 🏁 line, which the run log and the runner read). */
export const outOfCalls = (max) => `🏁 RUN ENDED — out of calls: all ${max} tool calls of this run are used`;

/** A budget of `max` calls, counted in `dir`. */
export function callBudget({ max, dir }) {
  const file = join(dir, "tool-calls.txt");
  let used = existsSync(file) ? Number(readFileSync(file, "utf8")) || 0 : 0;
  return {
    max,
    used: () => used,
    /** Counts one call: { spent } when none were left (the call must not run), { last } when it's the final one. */
    take() {
      if (used >= max) return { spent: true };
      used++;
      writeFileSync(file, String(used));
      return { last: used === max };
    },
  };
}

/** A result with the run's end added, unless it already says the run ended. */
export function endRun(result, max) {
  const content = result?.content ?? [];
  if (content.some((c) => c.type === "text" && c.text.includes("🏁 RUN ENDED"))) return result;
  return { ...result, content: [...content, { type: "text", text: outOfCalls(max) }] };
}

/**
 * Wraps server.registerTool so every tool registered afterwards counts against `budget`: the
 * call that uses the last one ends the run, and calls after it don't reach the game.
 */
export function limitCalls(server, budget) {
  const registerTool = server.registerTool.bind(server);
  server.registerTool = (name, config, handler) => registerTool(name, config, UNCOUNTED.has(name) ? handler : async (...cbArgs) => {
    const turn = budget.take();
    if (turn.spent) return { content: [{ type: "text", text: outOfCalls(budget.max) }] };
    const result = await handler(...cbArgs);
    return turn.last ? endRun(result, budget.max) : result;
  });
}
