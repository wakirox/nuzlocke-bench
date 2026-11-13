// The runs dashboard's data: no game names, and a run continued in other folders counts once.

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { capturesOf, dashboardRuns, joinHardAreas, fightsOf, outcomeKind, renderDashboard, throwsOf } from "../../mcp-server/dashboard.mjs";
// @ts-expect-error plain ESM module without type declarations
import { OFFICIAL } from "../../mcp-server/benchmark.mjs";

const agent = { model: "claude-sonnet-5-5", effort: "low", tokens: { total: 5_000_000 } };
const row = (name: string, extra: Record<string, unknown> = {}) => ({
  name, agent, preset: "full", harness: "0.1.0@abc", outcome: "unfinished", badges: 0, deaths: 0, calls: 100, playTime: "1:00:00",
  objectives: {}, darkTunnel: null, game: "red", ...extra,
});

describe("outcomeKind", () => {
  it("keeps the kind and drops the text naming who did it", () => {
    expect(outcomeKind("wipe: Team wiped by SOMEMON Lv14 at SOMEWHERE", agent)).toBe("wipe");
    expect(outcomeKind("disqualified: Disqualified: SOMEMON is dead", agent)).toBe("disqualified");
  });

  it("reads why a run with no outcome ended from the runner's record", () => {
    expect(outcomeKind("unfinished", { gaveUp: true })).toBe("gave up");
    expect(outcomeKind("unfinished", { stopped: "still not over after 10 nudges" })).toBe("gave up");
    expect(outcomeKind("unfinished", { stopped: "stopped by hand (SIGTERM)" })).toBe("stopped by hand");
    expect(outcomeKind("unfinished", null)).toBe("unfinished");
  });
});

describe("dashboardRuns", () => {
  it("names the furthest milestone reached", () => {
    const [run] = dashboardRuns([row("2026-11-06T01", { objectives: { badge1: "0:20:00", badge2: "1:00:00" } })]);
    expect(run.reached).toEqual(["badge1", "badge2"]);
    expect(run.furthest).toBe(3); // the milestones start: rival 1, badge 1, the first cave, badge 2
    expect(run.model).toBe("sonnet-5-5");
  });

  it("joins a continued run into one, adding calls and tokens", () => {
    const runs = dashboardRuns([
      row("2026-11-06T01", { objectives: { badge1: "x" }, badges: 1, deaths: 1 }),
      row("2026-11-06T02", { agent: { ...agent, resumedFrom: "2026-11-06T01" }, objectives: { badge2: "x" }, badges: 2, deaths: 3, outcome: "wipe: X" }),
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ id: "2026-11-06T01", calls: 200, tokens: 10_000_000, badges: 2, deaths: 4, outcome: "wipe", continued: true, tokensPartial: false });
    expect(runs[0].reached.sort()).toEqual(["badge1", "badge2"]);
  });

  it("marks tokens as partial when a leg went unrecorded", () => {
    const runs = dashboardRuns([
      row("2026-11-06T01", { agent: { ...agent, tokens: undefined } }),
      row("2026-11-06T02", { agent: { ...agent, resumedFrom: "2026-11-06T01" } }),
    ]);
    expect(runs[0]).toMatchObject({ tokens: 5_000_000, tokensPartial: true });
  });

  it("uses player.json for a run stopped before agent.json, and skips runs with nobody recorded", () => {
    const runs = dashboardRuns([row("a", { agent: null, player: { model: "claude-haiku-5-5", effort: "low" } }), row("b", { agent: null })]);
    expect(runs.map((r: { id: string }) => r.id)).toEqual(["a"]);
    expect(runs[0].model).toBe("haiku-5-5");
  });

  it("flags a stray short run that was stopped by hand, but not a short wipe", () => {
    const stopped = { ...agent, stopped: "stopped by hand (SIGTERM)" };
    const [stray, wipe] = dashboardRuns([row("2", { agent: stopped, calls: 6 }), row("1", { calls: 6, outcome: "wipe: X" })]);
    expect(stray.short).toBe(true);
    expect(wipe.short).toBe(false);
  });

  it("flags a short run nothing ended, but not a longer one", () => {
    const runs = dashboardRuns([row("2", { calls: 40 }), row("1", { calls: 60 })]);
    expect(runs.map((r: { short: boolean }) => r.short)).toEqual([true, false]);
  });

  it("counts a wipe's last Pokémon as a death and scores the run", () => {
    const [run] = dashboardRuns([row("a", { outcome: "wipe: X", deaths: 2, screenshots: 3, objectives: { badge1: "x" } })]);
    expect(run.deaths).toBe(3);
    // The last Pokémon is the wipe itself (the run ends as "ended"); the two before it cost points.
    expect(run.score).toMatchObject({ deaths: -30, ended: -45, screenshots: -9, total: 60 - 30 - 45 - 9 });
  });

  it("counts failed calls (run-log errors plus calls the server rejected), -4 per percentage point of the calls", () => {
    const [run] = dashboardRuns([row("a", { calls: 100, errors: 3, extras: { rejected: 2 }, objectives: { badge1: "x" } })]);
    expect(run.wrongCalls).toBe(5);
    expect(run.score.wrongCalls).toBe(-20);
  });

  it("marks official runs: the official rules on Red, from a new game, ended by the rules", () => {
    const off = (name: string, extra: Record<string, unknown> = {}) => row(name, { preset: OFFICIAL.preset, game: OFFICIAL.game, outcome: "wipe: X", ...extra });
    const reason = (rows: unknown[]) => dashboardRuns(rows)[0].notOfficial;
    expect(reason([off("2026-11-08T10-00")])).toBeNull();
    expect(reason([off("2026-11-07T23-59")])).toBe("before official runs");
    expect(reason([off("2026-11-08T10-00", { agent: { ...agent, gaveUp: true }, outcome: "unfinished" })])).toBeNull();
    expect(reason([off("2026-11-08T10-00", { preset: `${OFFICIAL.preset}+hints` })])).toBe("other rules");
    expect(reason([off("2026-11-08T10-00", { game: "yellow" })])).toBe("other game");
    expect(reason([off("2026-11-08T10-00", { agent: { ...agent, resumedFrom: "mansion-save" } })])).toBe("not from a new game");
    expect(reason([off("2026-11-08T10-00", { agent: { ...agent, playtest: true } })])).toBe("playtest");
    expect(reason([off("2026-11-08T10-00", { agent: { ...agent, narrated: true } })])).toBe("narrated");
    expect(reason([off("2026-11-08T10-00", { agent: { ...agent, stopped: "stopped by hand (SIGTERM)" }, outcome: "unfinished" })])).toBe("stopped by hand");
    expect(reason([off("2026-11-08T10-00", { outcome: "unfinished" })])).toBe("unfinished");
  });

  it("leaves Crystal runs out: an experimental game isn't on the dashboard yet", () => {
    const runs = dashboardRuns([
      row("2026-11-08T10-00", { preset: OFFICIAL.preset, game: "crystal", outcome: "wipe: X" }),
      row("2026-11-08T11-00", { preset: OFFICIAL.preset, game: "red", outcome: "wipe: X" }),
    ]);
    expect(runs.map((r: { game: string }) => r.game)).toEqual(["red"]);
  });

  it("keeps a continued run official when every leg is on record", () => {
    const off = { preset: OFFICIAL.preset, game: OFFICIAL.game };
    const [run] = dashboardRuns([
      row("2026-11-08T01", { ...off, agent: { ...agent, stopped: "stopped by hand (reboot)" } }),
      row("2026-11-08T02", { ...off, agent: { ...agent, resumedFrom: "2026-11-08T01" }, outcome: "wipe: X" }),
    ]);
    expect(run.notOfficial).toBeNull();
  });

  it("isn't official when a later leg played under other rules, or was a playtest known only from player.json", () => {
    const off = { preset: OFFICIAL.preset, game: OFFICIAL.game };
    const legs = (second: Record<string, unknown>) => dashboardRuns([
      row("2026-11-08T01", { ...off, agent: { ...agent, stopped: "stopped by hand (reboot)" } }),
      row("2026-11-08T02", { ...off, agent: { ...agent, resumedFrom: "2026-11-08T01" }, outcome: "wipe: X", ...second }),
    ]);
    expect(legs({ preset: `${OFFICIAL.preset}+hints` })[0].notOfficial).toBe("other rules");
    expect(legs({ agent: null, player: { model: "m", resumedFrom: "2026-11-08T01", playtest: true } })[0].notOfficial).toBe("playtest");
  });

  it("follows a leg that left only player.json back to the run it continued", () => {
    const off = { preset: OFFICIAL.preset, game: OFFICIAL.game };
    const runs = dashboardRuns([
      row("2026-11-08T01", { ...off, objectives: { badge1: "x" } }),
      row("2026-11-08T02", { ...off, agent: null, player: { model: "m", resumedFrom: "2026-11-08T01" } }),
      row("2026-11-08T03", { ...off, agent: { ...agent, resumedFrom: "2026-11-08T02" }, outcome: "wipe: X" }),
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ id: "2026-11-08T01", calls: 300, reached: ["badge1"], notOfficial: null });
    // On its own, a leg continued from elsewhere isn't from a new game, agent.json or not.
    const [alone] = dashboardRuns([row("2026-11-08T02", { ...off, agent: null, player: { model: "m", resumedFrom: "some-save" }, outcome: "wipe: X" })]);
    expect(alone.notOfficial).toBe("not from a new game");
  });

  it("keeps a leg continued twice in the newest way through; the older branch is its own run", () => {
    const off = { preset: OFFICIAL.preset, game: OFFICIAL.game };
    const from = (name: string) => ({ ...agent, resumedFrom: name });
    const runs = dashboardRuns([
      row("2026-11-08T01", { ...off, objectives: { badge1: "x" } }),
      row("2026-11-08T02", { ...off, agent: from("2026-11-08T01"), objectives: { badge2: "x" }, deaths: 4, outcome: "out of calls: X" }),
      row("2026-11-08T03", { ...off, agent: from("2026-11-08T01"), deaths: 1, outcome: "wipe: X" }),
    ]);
    expect(runs.map((r: { id: string }) => r.id)).toEqual(["2026-11-08T02", "2026-11-08T01"]);
    expect(runs[1]).toMatchObject({ calls: 200, reached: ["badge1"], deaths: 2, outcome: "wipe", notOfficial: null });
    expect(runs[0]).toMatchObject({ calls: 100, reached: ["badge2"], notOfficial: "not from a new game" });
  });

  it("hides a run marked as no result, however long", () => {
    const [run] = dashboardRuns([row("a", { calls: 500, agent: { ...agent, notAResult: "started by mistake" } })]);
    expect(run.short).toBe(true);
  });

  it("carries no text from the game", () => {
    const text = JSON.stringify(dashboardRuns([row("a", { outcome: "wipe: Team wiped by SOMEMON at SOMEWHERE" })]));
    expect(text).not.toMatch(/SOMEMON|SOMEWHERE/);
  });
});

describe("capturesOf", () => {
  const species = {
    1: { id: 1, name: "ALPHA", evolutions: [{ to: 2 }] },
    2: { id: 2, name: "ALPHA2", evolutions: [] },
    3: { id: 3, name: "BETA", evolutions: [] },
    4: { id: 4, name: "GAMMA", evolutions: [] },
    5: { id: 5, name: "STARTER", evolutions: [] },
    6: { id: 6, name: "DELTA", evolutions: [] },
  };
  const tracker = {
    catches: [
      { t: 100, mapConst: "ROUTE_A", species: 1, level: 3, gift: false },
      { t: 200, mapConst: "MT_B_1F", species: 3, level: 5, gift: false },
      { t: 300, mapConst: "HOUSE", species: 4, level: 10, gift: true },
      { t: 400, mapConst: "ROUTE_A", species: 6, level: 8, gift: false },
    ],
    areas: { ROUTE_A: { label: "ROUTE A" } },
    trainerFights: [
      { team: [{ nickname: "ACE", species: "ALPHA", level: 8 }] },
      { team: [{ nickname: "ACE", species: "ALPHA2", level: 20 }, { nickname: "FIRST", species: "STARTER", level: 22 }] },
    ],
    dead: [{ species: 3, level: 7, nickname: "BEE", cause: "poison" }],
  };
  const throws = [{ t: 90, nickname: "ACE" }, { t: 150, nickname: "MISSED" }, { t: 190, nickname: "BEE" }];

  it("names catches from their throws, and follows them through evolution", () => {
    expect(capturesOf({ tracker, species, starter: "STARTER", throws })).toEqual([
      { species: "STARTER", nickname: "FIRST", lastLevel: 22, died: null, where: "starter", level: 5 },
      { species: "ALPHA", nickname: "ACE", lastLevel: 20, died: null, where: "ROUTE A", level: 3 },
      { species: "BETA", nickname: "BEE", lastLevel: 7, died: "poison", where: "MT B 1F", level: 5 },
      { species: "GAMMA", nickname: null, lastLevel: null, died: null, where: "gift", level: 10 },
      { species: "DELTA", nickname: null, lastLevel: null, died: null, where: "ROUTE A", level: 8 },
    ]);
  });

  it("doesn't take a throw from before the last catch for the next one", () => {
    const [, second] = capturesOf({ tracker: { catches: tracker.catches.slice(0, 2) }, species, throws: [{ t: 90, nickname: "ACE" }] });
    expect(second.nickname).toBeNull();
  });

  it("doesn't list the starter twice, and copes with no save", () => {
    expect(capturesOf({ tracker, species, starter: "ALPHA", throws }).filter((c: { species: string }) => c.species === "ALPHA")).toHaveLength(1);
    expect(capturesOf({ tracker: null, species, starter: "STARTER" })).toEqual([]);
  });
});

describe("throwsOf", () => {
  it("reads nicknames from throws and batches, skipping unnamed ones", () => {
    const calls = [
      { t: "2026-11-06T00:00:00Z", tool: "throw_ball", args: { nickname: "Ace" } },
      { t: "2026-11-06T00:00:01Z", tool: "do", args: { steps: [{ tool: "press" }, { tool: "throw_ball", args: { nickname: "bee" } }] } },
      { t: "2026-11-06T00:00:02Z", tool: "throw_ball", args: {} },
    ];
    expect(throwsOf(calls).map((x: { nickname: string }) => x.nickname)).toEqual(["ACE", "BEE"]);
  });
});

describe("fightsOf", () => {
  const mon = (nickname: string, level: number) => ({ nickname, species: "ALPHA", level, hp: 10, maxHp: 20, moves: ["HIT"] });
  const fight = (number: number, playTime: string, team: unknown[], extra = {}) => ({
    trainerClass: 34, trainer: "LEADER", number, map: "[A]REA", badges: 0, levelCap: 12, playTime, foe: [{ species: "BETA", level: 12 }], team, ...extra,
  });

  it("lists the team, what changed since the last fight and how it went", () => {
    const fights = fightsOf([{ extras: { fights: [fight(1, "0:10:00", [mon("ACE", 10)], { result: "won" }), fight(2, "0:20:00", [mon("ACE", 14), mon("BEE", 12)], { result: "lost", died: ["ACE"] })] } }]);
    expect(fights[0]).toMatchObject({ trainer: "LEADER", map: "AREA", cap: 12, result: "won", change: "—" });
    expect(fights[0].team[0]).toEqual({ nickname: "ACE", species: "ALPHA", level: 10, hp: 10, maxHp: 20, moves: ["HIT"], dead: false });
    expect(fights[1]).toMatchObject({ result: "lost", died: ["ACE"], change: "+BEE, +4 levels" });
  });

  it("keeps a fight once across a continued run's legs, in its latest form", () => {
    const first = fight(1, "0:10:00", [mon("ACE", 10)]);
    const fights = fightsOf([{ extras: { fights: [first] } }, { extras: { fights: [{ ...first, result: "won" }, fight(2, "0:20:00", [mon("ACE", 14)])] } }]);
    expect(fights).toHaveLength(2);
    expect(fights[0].result).toBe("won");
  });

  it("copes with a run that has none", () => {
    expect(fightsOf([{ extras: null }, {}])).toEqual([]);
  });
});

describe("joinHardAreas", () => {
  it("adds up an area across legs, done if any leg finished it", () => {
    const a = { id: "x", label: "X", calls: 5, entries: 1, deaths: 1, seconds: 10, done: false };
    expect(joinHardAreas([{ hardAreas: [a] }, { hardAreas: [{ ...a, done: true }] }, {}])).toEqual([{ ...a, calls: 10, entries: 2, deaths: 2, seconds: 20, done: true }]);
  });
});

describe("names: false", () => {
  it("leaves the captures out, for a page to publish", () => {
    const captureData = { tracker: { catches: [{ t: 1, mapConst: "A", species: 1, level: 3 }] }, species: { 1: { id: 1, name: "ALPHA", evolutions: [] } } };
    expect(dashboardRuns([row("a", { captureData })])[0].captures[0].species).toBe("ALPHA");
    expect(JSON.stringify(dashboardRuns([row("a", { captureData })], { names: false }))).not.toContain("ALPHA");
    const extras = { fights: [{ trainer: "LEADER", foe: [{ species: "ALPHA", level: 1 }], team: [] }] };
    expect(dashboardRuns([row("a", { extras })])[0].fights).toHaveLength(1);
    expect(JSON.stringify(dashboardRuns([row("a", { extras })], { names: false }))).not.toContain("LEADER");
  });
});

describe("renderDashboard", () => {
  it("puts the data in safely", () => {
    const html = renderDashboard("<script>const DATA = /*DATA*/null;</script>", [{ id: "</script>" }], "2026-11-06T00:00:00Z");
    expect(html).not.toContain("/*DATA*/");
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).toContain('"label":"Badge 1"');
  });
});
