// The score, see docs/scoring.md. It has no maximum and no floor.

export const POINTS = {
  badge: 60,
  milestone: 30,
  champion: 130,
  death: -15,
  // After beating the Champion a death costs double: among finishers, lost Pokémon should weigh more than calls.
  finisherDeath: -30,
  // Worse than a wipe a badge earlier (-45 - 60): breaking a rule never pays (since 2026-11-14; was -100).
  disqualified: -150,
  // Any other early end (a wipe, lost, gave up, out of calls): one flat cost, whatever the team size.
  ended: -45,
  // After the last milestone only: this many calls under the budget are worth a point.
  callsPerPoint: 10,
  // Speed, every run: up to 29 (under a milestone, so it never outweighs getting further).
  speed: 29,
  // Using Flash in the dark tunnel.
  flash: 30,
  // Every run: each percentage point of the calls that were screenshots (a rate since 2026-11-14, as
  // failed calls: a long run doesn't pay more than a short one that looks as often; was -3 each).
  screenshotPoint: -20,
  // Every run: each percentage point of the calls that failed (a rate since 2026-11-13, so a long run
  // doesn't pay more than a short one that fails as often).
  wrongCallPoint: -4,
};
export const CALL_BUDGET = 6000;
// Where each speed bonus reaches 0: calls per milestone over the whole run, the cottage step's calls
// (second badge to leaving the town south or east), the dark tunnel's calls (crossed only).
export const SPEED_ZERO = { pace: 300, cottage: 400, tunnel: 1500 };

const bonus = (calls, zero) => (calls == null ? 0 : Math.round(POINTS.speed * Math.min(1, Math.max(0, 1 - calls / zero))));

/**
 * A run's score and what it's made of. `reached`: its milestone ids, as in report.mjs's OBJECTIVES;
 * `objectiveCalls`: the call that first reached each; `lastBattleDeaths`: a wipe's deaths in its last
 * battle (the wipe itself, charged once as `ended`), or a win's in the Champion fight (only for `winFloor`); `dark`: report.mjs's darkTunnelOf.
 * `wrongCalls` includes `rejected`: calls the server turned down before they ran, which aren't in `calls`.
 * Screenshots (-20) and failed calls (-4), each per percentage point of the calls, count for every run:
 * with a Champion reached, a clean run has to beat a messy one (docs/scoring.md). Beating the Champion
 * always scores more than losing to him with the same run would have (`winFloor`).
 */
/**
 * @param {{ reached?: string[], deaths?: number, outcome?: string, calls?: number, objectiveCalls?: Record<string, number>, lastBattleDeaths?: number, dark?: any, screenshots?: number, wrongCalls?: number, rejected?: number }} run
 */
export function scoreRun({ reached = [], deaths = 0, outcome = "", calls = 0, objectiveCalls = {}, lastBattleDeaths = 0, dark = null, screenshots = 0, wrongCalls = 0, rejected = 0 }) {
  let progress = 0;
  for (const id of reached) progress += id === "champion" ? POINTS.champion : id.startsWith("badge") ? POINTS.badge : POINTS.milestone;
  const finished = reached.includes("champion");
  const cottage = objectiveCalls.cottageDone != null && objectiveCalls.badge2 != null ? objectiveCalls.cottageDone - objectiveCalls.badge2 : null;
  const crossed = dark && /^crossed/.test(dark.result);
  const parts = {
    progress,
    // Over all the run's calls (since 2026-11-14), not just up to its furthest milestone: calls spent
    // stuck after it count, and a quick early wipe isn't the fastest run.
    speed: reached.length && calls > 0 ? bonus(calls / reached.length, SPEED_ZERO.pace) : 0,
    cottageSpeed: cottage != null && cottage >= 0 ? bonus(cottage, SPEED_ZERO.cottage) : 0,
    tunnelSpeed: crossed ? bonus(dark.calls, SPEED_ZERO.tunnel) : 0,
    flash: dark?.flashAt != null ? POINTS.flash : 0,
    efficiency: finished ? Math.floor(Math.max(0, CALL_BUDGET - calls) / POINTS.callsPerPoint) : 0,
    deaths: (Math.max(0, deaths - (outcome === "wipe" ? lastBattleDeaths : 0)) * (finished ? POINTS.finisherDeath : POINTS.death)) || 0,  // || 0: no -0
    ended: !finished && ["wipe", "lost", "gave up", "out of calls"].includes(outcome) ? POINTS.ended : 0,
    disqualified: outcome === "disqualified" ? POINTS.disqualified : 0,
    screenshots: (calls > 0 ? Math.round((100 * Math.min(screenshots, calls) / calls) * POINTS.screenshotPoint) : 0) || 0,
    // Out of every call made: the rejected ones (in wrongCalls) never reached the run log's count.
    wrongCalls: (calls + rejected > 0 ? Math.round((100 * Math.min(wrongCalls, calls + rejected) / (calls + rejected)) * POINTS.wrongCallPoint) : 0) || 0,
  };
  // A finisher's deaths cost double, and a wipe's last battle costs none, so winning by losing Pokémon in
  // the Champion fight could score less than wiping there: what winning adds over that (the Champion, no
  // early end, efficiency, the deaths at -30 against the ones a wipe charges) is kept above 0.
  const winLead = finished ? POINTS.champion - POINTS.ended + parts.efficiency + deaths * POINTS.finisherDeath - Math.max(0, deaths - lastBattleDeaths) * POINTS.death : 1;
  const all = { ...parts, winFloor: winLead > 0 ? 0 : 1 - winLead };
  return { total: Object.values(all).reduce((a, b) => a + b, 0), ...all };
}
