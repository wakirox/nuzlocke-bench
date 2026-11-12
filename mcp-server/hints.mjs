// The hint tool (preset option "hints"): the next story step, for models that can play but lose
// the thread of the story. A hint says where to go and what starts the next step, never how to
// play it. Runs with hints are their own group (the option is in the preset id).
//
// Texts name no characters, places or species: they say "the professor", "the next town".
// Steps are checked in order; the first one not done yet is the hint.

/** Map ids seen in a run log's "where" lines ("PALLET TOWN [PALLET_TOWN] x5 y6 …"). */
import { GEN1 } from "./games/index.mjs";

/** Gen 1's key items by id (games/gen1.mjs), for tests and callers. */
export const ITEM = GEN1.hintItems;

export function visitedMaps(runLogText) {
  const maps = new Set();
  for (const line of (runLogText ?? "").split("\n")) {
    const m = /"where":"[^"]*?\[([A-Z0-9_]+)\]/.exec(line);
    if (m) maps.add(m[1]);
  }
  return maps;
}

/** Whether the first rival battle has been fought, from the run log (the page records it). */
export const firstRivalFought = (runLogText) => /"firstRival":"/.test(runLogText ?? "");



/**
 * The hint for a state: `party` (how many Pokémon), `badges`, `visited` (map ids), `rivalFought`,
 * `has(itemId)`. Past the steps written out, the next milestone (report.mjs's OBJECTIVES) is named.
 */
export function nextHint(s, objectives = [], reached = new Set(), game = GEN1) {
  for (const step of game.hintSteps) if (step.when(s)) return step.text;
  const next = objectives.find((o) => !reached.has(o.id));
  return next ? `Next goal: ${next.label}.` : "You've reached every goal there is: become Champion.";
}

/**
 * The hint state from get_state's result, the bridge's hint_facts (bag item ids, the first rival fight)
 * and the run log so far. Maps visited only count as far as the log goes (a resumed run's starts
 * later), so the steps also take later progress (badges, key items) as proof of the earlier ones.
 */
export function hintState(state, runLogText, facts = {}) {
  const bagIds = facts.bag ?? [];
  const visited = visitedMaps(runLogText);
  if (state?.location?.id) visited.add(state.location.id);
  const badges = Array.isArray(state?.badges) ? state.badges.length : Number(state?.badges ?? 0);
  const ids = new Set(bagIds);
  return {
    has: (id) => (Array.isArray(id) ? id.some((i) => ids.has(i)) : ids.has(id)),
    party: (state?.party ?? []).length,
    badges,
    visited,
    rivalFought: !!facts.rivalFought || firstRivalFought(runLogText),
    // From the game when the bridge says (hint_facts), else from having been in the lab.
    ledIntoLab: facts.ledIntoLab ?? visited.has("OAKS_LAB"),
  };
}
