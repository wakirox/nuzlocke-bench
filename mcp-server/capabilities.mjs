// What a run shows about the model, in three groups, as measured numbers (no made-up 0-100 scores):
// how it uses the tools, how it plans, and what it knows of the game's story. For diagnosis only: none
// of it is in the score (score.mjs). docs/capabilities.md says what each number is and why.
//
// toolUseOf reads one leg's run log (run-summary.mjs keeps it in the leg's row); capabilitiesOf puts a
// whole run together from the dashboard's run (dashboard.mjs), which has its legs combined already.

import { OBJECTIVES } from "./report.mjs";

/** Calls that move the player through the map for it: a route, a path or a batch, not a button. */
const PLANNED_MOVES = new Set(["go_to", "travel", "walk_to", "exit_map", "walk", "hunt", "do"]);
/** Calls where the same arguments turn after turn are normal play, not a loop. */
const REPEATS_ARE_PLAY = new Set(["fight", "advance_text", "wait"]);

/**
 * One leg's tool use, from its run log: calls, raw button presses, planned moves (one call that moves
 * for the model), batches (`do`), and loops (the same call three times running, as friction.mjs counts them).
 */
export function toolUseOf(calls) {
  let presses = 0, planned = 0, batches = 0, loops = 0, streak = 0;
  calls.forEach((c, i) => {
    if (c.tool === "press") presses++;
    if (PLANNED_MOVES.has(c.tool)) planned++;
    if (c.tool === "do") batches++;
    const prev = calls[i - 1];
    const same = prev && !REPEATS_ARE_PLAY.has(c.tool) && prev.tool === c.tool && JSON.stringify(prev.args ?? {}) === JSON.stringify(c.args ?? {});
    streak = same ? streak + 1 : 0;
    if (streak === 2) loops++;
  });
  return { calls: calls.length, presses, planned, batches, loops };
}

/** Several legs' tool use as one run's. */
export function joinToolUse(legs) {
  const all = legs.filter(Boolean);
  if (!all.length) return null;
  return Object.fromEntries(["calls", "presses", "planned", "batches", "loops"].map((k) => [k, all.reduce((n, t) => n + (t[k] ?? 0), 0)]));
}

const pct = (n, of) => (of > 0 ? Math.round((1000 * n) / of) / 10 : null);

/**
 * The calls each story step took, as { milestone id: calls } in the order the run reached them: from the
 * milestone reached before it (or the start) to it. Parts of the story can be done in either order (Silph
 * Co. before the fifth badge), so it goes by the calls, story order only breaking ties. A long step is
 * where the model didn't know, or couldn't find, what came next.
 */
export function stepCallsOf(objectiveCalls = {}, reached = []) {
  const got = new Set(reached);
  const order = OBJECTIVES.map((o, i) => ({ id: o.id, at: objectiveCalls[o.id], i }))
    .filter((o) => got.has(o.id) && o.at != null)
    .sort((a, b) => a.at - b.at || a.i - b.i);
  const steps = {};
  let before = 0;
  for (const o of order) {
    steps[o.id] = o.at - before;
    before = o.at;
  }
  return steps;
}

/**
 * A dashboard run's three groups. `run` is dashboard.mjs's run: calls, wrongCalls, rejected, screenshots,
 * deaths, badges, dark, objectiveCalls, reached and toolUse (joined over its legs). The times into each
 * hard area are planning too: the run's hardAreas has them, so they aren't repeated here.
 */
export function capabilitiesOf(run) {
  const made = (run.calls ?? 0) + (run.rejected ?? 0);
  const t = run.toolUse;
  return {
    tools: {
      failedPct: pct(run.wrongCalls ?? 0, made),
      screenshotPct: pct(run.screenshots ?? 0, run.calls ?? 0),
      plannedMovePct: t ? pct(t.planned, t.calls) : null,
      pressPct: t ? pct(t.presses, t.calls) : null,
      batches: t?.batches ?? null,
      loops: t?.loops ?? null,
    },
    planning: {
      flash: run.dark ? run.dark.flashAt != null : null,
      deathsPerBadge: run.badges ? Math.round((10 * (run.deaths ?? 0)) / run.badges) / 10 : null,
    },
    knowledge: {
      steps: stepCallsOf(run.objectiveCalls, run.reached),
    },
  };
}
