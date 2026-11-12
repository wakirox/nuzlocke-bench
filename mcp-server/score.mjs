// The score, see docs/scoring.md. It has no maximum and no floor.

export const POINTS = {
  badge: 60,
  milestone: 30,
  champion: 130,
  death: -15,
  disqualified: -100,
  // Any other early end (a wipe, lost, gave up, out of calls): one flat cost, whatever the team size.
  ended: -45,
  // After the last milestone only: this many calls under the budget are worth a point.
  callsPerPoint: 10,
  // Speed, every run: up to 29 (under a milestone, so it never outweighs getting further).
  speed: 29,
  // Using Flash in the dark tunnel.
  flash: 30,
  // Every run (since 2026-11-12): each screenshot asked for, and each failed tool call.
  screenshot: -3,
  wrongCall: -1,
};
export const CALL_BUDGET = 6000;
// Where each speed bonus reaches 0: calls per milestone over the whole run, the cottage step's calls
// (second badge to leaving the town south or east), the dark tunnel's calls (crossed only).
export const SPEED_ZERO = { pace: 300, cottage: 400, tunnel: 1500 };

const bonus = (calls, zero) => (calls == null ? 0 : Math.round(POINTS.speed * Math.min(1, Math.max(0, 1 - calls / zero))));

/**
 * A run's score and what it's made of. `reached`: its milestone ids, as in report.mjs's OBJECTIVES;
 * `objectiveCalls`: the call that first reached each; `lastBattleDeaths`: a wipe's deaths in its last
 * battle (the wipe itself, charged once as `ended`); `dark`: report.mjs's darkTunnelOf.
 * Screenshots (-3) and failed calls (-1) count again since 2026-11-12, for every run: with a Champion
 * reached, a clean run has to beat a messy one (docs/scoring.md).
 */
export function scoreRun({ reached = [], deaths = 0, outcome = "", calls = 0, objectiveCalls = {}, lastBattleDeaths = 0, dark = null, screenshots = 0, wrongCalls = 0 }) {
  let progress = 0;
  for (const id of reached) progress += id === "champion" ? POINTS.champion : id.startsWith("badge") ? POINTS.badge : POINTS.milestone;
  const finished = reached.includes("champion");
  const ids = Object.keys(objectiveCalls).filter((id) => reached.includes(id));
  const toFurthest = ids.length ? Math.max(...ids.map((id) => objectiveCalls[id])) : null;
  const cottage = objectiveCalls.cottageDone != null && objectiveCalls.badge2 != null ? objectiveCalls.cottageDone - objectiveCalls.badge2 : null;
  const crossed = dark && /^crossed/.test(dark.result);
  const parts = {
    progress,
    speed: toFurthest != null && reached.length ? bonus(toFurthest / reached.length, SPEED_ZERO.pace) : 0,
    cottageSpeed: cottage != null && cottage >= 0 ? bonus(cottage, SPEED_ZERO.cottage) : 0,
    tunnelSpeed: crossed ? bonus(dark.calls, SPEED_ZERO.tunnel) : 0,
    flash: dark?.flashAt != null ? POINTS.flash : 0,
    efficiency: finished ? Math.floor(Math.max(0, CALL_BUDGET - calls) / POINTS.callsPerPoint) : 0,
    deaths: (Math.max(0, deaths - (outcome === "wipe" ? lastBattleDeaths : 0)) * POINTS.death) || 0,  // || 0: no -0
    ended: !finished && ["wipe", "lost", "gave up", "out of calls"].includes(outcome) ? POINTS.ended : 0,
    disqualified: outcome === "disqualified" ? POINTS.disqualified : 0,
    screenshots: (screenshots * POINTS.screenshot) || 0,
    wrongCalls: (wrongCalls * POINTS.wrongCall) || 0,
  };
  return { total: Object.values(parts).reduce((a, b) => a + b, 0), ...parts };
}
