// The runs dashboard's data: one entry per run, continued runs joined up, from bench-report's rows.
// Numbers, ids and outcome kinds, plus each run's captures and big fights, the parts with game names:
// dashboardRuns' names: false leaves those out, for a page to publish.

import { OBJECTIVES, teamChange } from "./report.mjs";
import { scoreRun } from "./score.mjs";
import { capabilitiesOf, joinToolUse } from "./capabilities.mjs";
import { OFFICIAL } from "./benchmark.mjs";
import { COMPACT_WINDOW, DEFAULT_MAX_TOKENS, GIVE_UP_AFTER } from "./bench-runner.mjs";
import { isExperimental } from "./games/index.mjs";

/** Below this many calls, a run that nothing ended is a stray start, not a result. */
const SHORT_RUN = 50;

/** The ways a run ends by the rules: the only ones an official result can have. */
const RULE_ENDINGS = new Set(["victory", "wipe", "lost", "disqualified", "out of calls", "gave up"]);

/** What the runner recorded about a leg: agent.json, or player.json for one stopped before that was written. */
const recordOf = (leg) => leg.agent ?? leg.player ?? null;

/**
 * Why a run isn't an official result, or null when it is (docs/scoring.md): the official rules and
 * game on every leg (a continued leg can be given other options), a new game (every leg of a
 * continued run on record), ended by the rules, nothing that helps or steers the model.
 */
export function notOfficial({ date, preset, game, outcome, first, legs }) {
  if (isExperimental(game)) return "experimental game";
  if (date < OFFICIAL.since) return "before official runs";
  if (preset !== OFFICIAL.preset || legs.some((l) => (l.preset ?? preset) !== OFFICIAL.preset)) return "other rules";
  if (game !== OFFICIAL.game) return "other game";
  if (recordOf(first)?.resumedFrom) return "not from a new game";
  if (legs.some((l) => recordOf(l)?.playtest)) return "playtest";
  if (legs.some((l) => recordOf(l)?.narrated)) return "narrated";
  // The model's tools, from each leg's transcript: the game's only (docs/benchmark.md, "Official results").
  const tools = legs.filter((l) => l.extras !== null).map((l) => l.extras?.otherTools);
  if (!tools.length || tools.some((t) => !Array.isArray(t))) return "tools not on record";
  if (tools.some((t) => t.length)) return "other tools";
  const off = legs.map(offDefaults).find(Boolean);
  if (off) return off;
  if (!RULE_ENDINGS.has(outcome)) return outcome;
  return null;
}

/**
 * What a leg ran with that the official run doesn't (docs/benchmark.md, "Official results"; docs/scoring.md):
 * a harness that isn't a commit (uncommitted changes, or a page built from elsewhere), another client
 * than Claude Code, a 1M-token context, or a runner option off its default. Null when it's all standard.
 * Settings a leg didn't record are taken as the defaults they were then.
 */
function offDefaults(leg) {
  const r = recordOf(leg) ?? {};
  if (/\+uncommitted changes|\(page /.test(leg.harness ?? "")) return "harness not a clean commit";
  if (r.via === "api") return "run through the API";
  if (/\[1m\]$/.test(String(r.model ?? ""))) return "1M-token context";
  if (r.effectiveness === "on") return "effectiveness shown";
  if (r.reportIssue === false) return "report_issue off";
  if (r.grid && r.grid !== "narrow") return "other grid";
  // agy keeps its own context (it can't be given a window): its runs record none.
  if (r.via !== "agy" && r.compactWindow !== undefined && r.compactWindow !== COMPACT_WINDOW) return "other context window";
  if (r.maxNudges !== undefined && r.maxNudges !== GIVE_UP_AFTER) return "other nudges";
  if (r.maxTokens !== undefined && r.maxTokens !== DEFAULT_MAX_TOKENS) return "other token limit";
  return null;
}

/** What ended a run, without the text naming who did it. */
export function outcomeKind(outcome, agent) {
  const kind = /^(victory|wipe|lost|disqualified|out of calls)/.exec(outcome ?? "")?.[1];
  if (kind) return kind;
  const stopped = String(agent?.stopped ?? "");
  if (agent?.gaveUp || /nudges/.test(stopped)) return "gave up";
  if (/stopped by hand|exited/.test(stopped)) return "stopped by hand";
  return "unfinished";
}

/** The nicknames a run's calls gave when throwing balls, by time, batched calls included. */
export function throwsOf(calls) {
  const out = [];
  for (const c of calls) {
    const steps = c.tool === "throw_ball" ? [c.args] : c.tool === "do" ? (c.args?.steps ?? []).filter((x) => x.tool === "throw_ball").map((x) => x.args) : [];
    for (const a of steps) if (a?.nickname) out.push({ t: Date.parse(c.t), nickname: String(a.nickname).toUpperCase() });
  }
  return out;
}

/**
 * What a run caught, oldest first: its name, the species caught and where, the level then, its last
 * known level, and whether and how it died. `species` is the game's table by id, for the names and
 * the evolutions: a catch fights and dies under its evolved species. A name is the nickname given
 * when it was caught, or else one from its big fights or death. The starter isn't a catch: it's put first.
 */
export function capturesOf({ tracker, species, starter, throws = [] }) {
  if (!tracker) return [];
  const nameOf = (id) => species?.[id]?.name ?? `#${id}`;
  const idOf = new Map(Object.values(species ?? {}).map((x) => [x.name, x.id]));
  const familyOf = (id, seen = new Set()) => {
    seen.add(id);
    for (const e of species?.[id]?.evolutions ?? []) if (!seen.has(e.to)) familyOf(e.to, seen);
    return seen;
  };
  const fights = tracker.trainerFights ?? [];
  const row = (id, name, extra) => {
    const family = familyOf(id);
    const same = (m) => family.has(typeof m.species === "number" ? m.species : idOf.get(m.species));
    const named = (m) => !name || !m.nickname || m.nickname === name;
    const fought = fights.flatMap((f) => f.team ?? []).filter((m) => same(m) && named(m)).at(-1);
    const died = (tracker.dead ?? []).find((d) => same(d) && named(d));
    return {
      species: nameOf(id),
      nickname: name ?? died?.nickname ?? fought?.nickname ?? null,
      lastLevel: fought?.level ?? died?.level ?? null,
      died: died ? died.cause ?? "yes" : null,
      ...extra,
    };
  };
  const where = (c) => (c.gift ? "gift" : tracker.areas?.[c.mapConst]?.label ?? String(c.mapConst ?? "").replace(/_/g, " "));
  let from = 0;
  const caught = (tracker.catches ?? []).map((c) => {
    const nick = c.gift ? null : throws.filter((x) => x.t > from && x.t <= c.t).at(-1)?.nickname ?? null;
    from = c.t;
    return row(c.species, nick, { where: where(c), level: c.level });
  });
  const first = idOf.get(starter);
  return first != null && !caught.some((c) => c.species === starter) ? [row(first, null, { where: "starter", level: 5 }), ...caught] : caught;
}

/**
 * A run's big fights, oldest first: who, when, their team, the team brought and how it went. A
 * continued run's saves carry the fights before it, so its legs' lists overlap: each is kept once,
 * in its latest form, as a later save may know how a fight ended.
 */
export function fightsOf(legs) {
  const byKey = new Map();
  for (const f of legs.flatMap((l) => l.extras?.fights ?? [])) {
    byKey.set(`${f.trainerClass}:${f.number}:${f.playTime}`, f);
  }
  let prev = null;
  return [...byKey.values()].map((f) => {
    const out = {
      trainer: f.trainer,
      map: String(f.map ?? "").replace(/[[\]]/g, ""),
      badges: f.badges ?? null,
      playTime: f.playTime ?? null,
      cap: f.levelCap ?? null,
      foe: (f.foe ?? []).map((m) => ({ species: m.species, level: m.level })),
      team: (f.team ?? []).map((m) => ({
        nickname: m.nickname || null, species: m.species, level: m.level, hp: m.hp ?? null, maxHp: m.maxHp ?? null,
        moves: m.moves ?? [], dead: !!m.dead,
      })),
      change: teamChange(prev, f),
      result: f.result ?? null,
      died: f.died ?? [],
    };
    prev = f;
    return out;
  });
}

/** A run's hard areas across its legs: costs add up, and an area is done if any leg finished it. */
export function joinHardAreas(legs) {
  const byId = new Map();
  for (const a of legs.flatMap((l) => l.hardAreas ?? [])) {
    const had = byId.get(a.id);
    byId.set(a.id, !had ? { ...a } : {
      ...had, done: had.done || a.done, calls: had.calls + a.calls, entries: had.entries + a.entries,
      deaths: had.deaths + a.deaths, seconds: (had.seconds ?? 0) + (a.seconds ?? 0),
    });
  }
  return [...byId.values()];
}

/** The rows of bench-report as the page's runs: a run continued in other folders counts once. */
export function dashboardRuns(rows, { names = true } = {}) {
  const byName = new Map(rows.map((r) => [r.name, r]));
  const parentOf = (r) => byName.get(recordOf(r)?.resumedFrom) ?? null;
  const continued = new Set(rows.map((r) => parentOf(r)?.name).filter(Boolean));
  // A run is the way back from a leg nobody continued to the start. When a leg was continued more
  // than once, the newest way through keeps it; an older branch is a run of its own from where it
  // left, not from a new game.
  const taken = new Set();
  const chains = new Map();
  const ends = rows.filter((r) => !continued.has(r.name)).sort((a, b) => (a.name < b.name ? 1 : -1));
  for (const end of ends) {
    const legs = [];
    for (let at = end, i = 0; at && i < 20 && !taken.has(at.name); at = parentOf(at), i++) legs.unshift(at);
    for (const l of legs) taken.add(l.name);
    if (legs.length) chains.set(legs[0].name, legs);
  }
  const runs = [];
  for (const [id, legs] of chains) {
    const first = legs[0];
    const last = legs.at(-1);
    const who = first.agent ?? first.player ?? last.agent ?? last.player;
    if (!who?.model) continue; // from before runs recorded who played
    // An experimental game (Crystal) isn't on the dashboard at all, not even as a run's own page.
    if (isExperimental(first.game)) continue;
    const reached = new Set(legs.flatMap((l) => Object.keys(l.objectives ?? {})));
    const furthest = OBJECTIVES.reduce((at, o, i) => (reached.has(o.id) ? i : at), -1);
    const calls = legs.reduce((n, l) => n + (l.calls ?? 0), 0);
    const outcome = outcomeKind(last.outcome, last.agent);
    // Run logs from before 2026-11-15 leave out a wipe's last Pokémon (the run ended before it was counted).
    const lastMissing = outcome === "wipe" && !last.wipeDeathsCounted ? 1 : 0;
    const deaths = (last.deaths ?? 0) + lastMissing;
    const screenshots = legs.reduce((n, l) => n + (l.screenshots ?? 0), 0);
    // Calls that failed: errors in the run log, and calls the server rejected (only in the transcript).
    const rejected = legs.reduce((n, l) => n + (l.extras?.rejected ?? 0), 0);
    const wrongCalls = legs.reduce((n, l) => n + (l.errors ?? 0), 0) + rejected;
    const tokens = legs.map((l) => l.agent?.tokens?.total).filter((t) => t != null);
    // Calls to each milestone across the legs (a continued leg's calls start after the ones before it).
    /** @type {Record<string, number>} */
    const objectiveCalls = {};
    let before = 0;
    for (const l of legs) {
      for (const [k, v] of Object.entries(l.objectiveCalls ?? {})) if (objectiveCalls[k] === undefined && v != null) objectiveCalls[k] = before + v;
      before += l.calls ?? 0;
    }
    const lastBattleDeaths = outcome === "wipe" ? (last.lastBattleDeaths ?? 0) + lastMissing : 0;  // + the last Pokémon, as above
    // A win's deaths in the Champion fight: the ones a loss there wouldn't have charged (the score's winFloor).
    const championDeaths = reached.has("champion") ? (last.finalBattleDeaths ?? 0) : 0;
    const dark = legs.map((l) => l.darkTunnel).find(Boolean) ?? null;
    runs.push({
      id,
      // A 1M-context run keeps its [1m]: it isn't the standard model's run (and isn't official).
      model: String(who.model).replace(/^claude-/, ""),
      effort: who.effort ?? null,
      // Who ran the model when it wasn't Claude Code: "agy" (the Antigravity CLI), shown with the model.
      ...(recordOf(first)?.via === "agy" ? { via: "agy" } : {}),
      game: first.game ?? null,
      preset: first.preset ?? null,
      date: id.slice(0, 10),
      harness: last.harness ?? null,
      outcome,
      badges: Math.max(...legs.map((l) => l.badges ?? 0)),
      deaths,
      calls,
      screenshots,
      wrongCalls,
      rejected,
      realMs: legs.reduce((n, l) => n + (l.wallMs ?? 0), 0),
      score: scoreRun({ reached: [...reached], deaths, outcome, calls, objectiveCalls, lastBattleDeaths: lastBattleDeaths || championDeaths, dark, screenshots, wrongCalls, rejected }),
      // Unrecorded for a leg stopped by a reboot: then it's a floor, so the page marks it.
      tokens: tokens.length ? tokens.reduce((a, b) => a + b, 0) : null,
      tokensPartial: tokens.length < legs.length,
      playTime: last.playTime ?? null,
      furthest,
      reached: [...reached],
      times: Object.assign({}, ...[...legs].reverse().map((l) => l.objectives ?? {})),
      ...(names ? { fights: fightsOf(legs) } : {}),
      ...(names ? { captures: capturesOf({ ...(last.captureData ?? {}), starter: legs[0].starter ?? null, throws: legs.flatMap((l) => l.throws ?? []) }) } : {}),
      dark,
      objectiveCalls,
      lastBattleDeaths,
      hardAreas: joinHardAreas(legs),
      toolUse: joinToolUse(legs.map((l) => l.toolUse)),
      playtest: legs.some((l) => recordOf(l)?.playtest),
      notOfficial: notOfficial({ date: id.slice(0, 10), preset: first.preset ?? null, game: first.game ?? null, outcome, first, legs }),
      continued: legs.length > 1,
      // Hidden from the page: a stray start, or a run marked as no result in its agent.json.
      short: legs.some((l) => l.agent?.notAResult) || (calls < SHORT_RUN && ["stopped by hand", "unfinished"].includes(outcome)),
    });
    // What the run shows about the model (capabilities.mjs): measured, not scored.
    const run = /** @type {any} */ (runs.at(-1));
    run.capabilities = capabilitiesOf(run);
  }
  return runs.sort((a, b) => (a.id < b.id ? 1 : -1));
}

/** The page: its template with the data in it. */
export function renderDashboard(template, runs, generatedAt) {
  const data = { generatedAt, objectives: OBJECTIVES.map((o) => ({ id: o.id, label: o.label })), runs };
  // "<" can't close the script tag it sits in.
  return template.replace("/*DATA*/null", () => JSON.stringify(data).replace(/</g, "\\u003c"));
}
