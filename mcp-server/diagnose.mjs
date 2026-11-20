// Behavioral diagnostics over recorded run logs (and optional transcripts): tags recurring
// failure patterns — spatial loops, tool-error loops, screenshot bursts, post-compaction amnesia,
// combat death causes, and rule violations — without touching anything the model sees.

import { UNCOUNTED } from "./call-budget.mjs";
import { callsOf } from "./friction.mjs";
import { GEN1 } from "./games/index.mjs";
import { contextStats, summarize } from "./report.mjs";

const READ_ONLY_TOOLS = new Set(["get_state", "get_map", "get_screen", "read_screen_text", "routes", "notes", "get_rules", "policies"]);
const BRACKET_MAP = /\[([A-Z0-9_]+)\]/;
const PLAIN_MAP = /^([A-Z0-9_]+)(?=\s*\(|\s*\|)/;
const XY_RE = /x(-?\d+)\s+y(-?\d+)|\((-?\d+),(-?\d+)\)/;
const YOU_HP_RE = /🟢 you: [^\n]*?(\d+)\/(\d+)HP/;

/** Map constant from a log entry's `where` line (or last traversed map), or null. */
function mapOf(c) {
  const w = c.where ?? "";
  return BRACKET_MAP.exec(w)?.[1] ?? PLAIN_MAP.exec(w)?.[1] ?? c.maps?.at(-1) ?? null;
}

/** Exact tile key `"MAP:x,y"` from `pos: [x, y]` or coordinates in `where`, or null. */
function tileOf(c) {
  const map = mapOf(c);
  if (!map) return null;
  if (Array.isArray(c.pos) && c.pos.length >= 2) return `${map}:${c.pos[0]},${c.pos[1]}`;
  const m = XY_RE.exec(c.where ?? "");
  if (!m) return null;
  const x = m[1] ?? m[3];
  const y = m[2] ?? m[4];
  return `${map}:${x},${y}`;
}

const inBattle = (c) => /battle:\s*(wild|trainer)/i.test(c.where ?? "");
const inTrainerBattle = (c) => /battle:\s*trainer/i.test(c.where ?? "");

/** True when the entry called `name` directly or as a step inside `do`. */
function usedTool(c, name) {
  if (c.tool === name) return true;
  if (c.tool !== "do" || !Array.isArray(c.args?.steps)) return false;
  return c.args.steps.some((s) => s?.tool === name || s?.name === name || (typeof s === "object" && s !== null && name in s));
}

/**
 * Extracts the player's visible HP fraction right before each 1-based call index from a transcript.
 * Returns a Map from call number `n` to `{ hp, maxHp, pct }`.
 */
export function hpBeforeCall(transcript) {
  const map = new Map();
  if (!transcript) return map;
  const calls = callsOf(transcript);
  let lastHp = null;
  for (const c of calls) {
    if (lastHp) map.set(c.i, lastHp);
    const m = YOU_HP_RE.exec(c.result ?? "");
    if (m) {
      const hp = Number(m[1]);
      const maxHp = Number(m[2]);
      if (maxHp > 0) lastHp = { hp, maxHp, pct: hp / maxHp };
    }
  }
  return map;
}

/**
 * Detects spatial navigation failures:
 * - `ping-pong`: 4+ transitions bouncing between 2 maps within 25 non-battle calls
 * - `tile-spin`: revisiting the exact same `(map, x, y)` >= 5 times in 20 non-battle calls
 * - `stall` / `stall-at-end`: >= 60 calls without a new map, badge, or won trainer fight
 */
export function detectSpatialLoops(calls) {
  const incidents = [];
  let lastProgress = 0;
  let maxBadges = 0;
  let lastPingPong = -30;
  let lastSpin = -30;
  const seenMaps = new Set();

  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    const m = mapOf(c);
    const passedNew = (c.maps ?? []).some((x) => !seenMaps.has(x));
    const progressed =
      (c.badges != null && c.badges > maxBadges) ||
      (m != null && !seenMaps.has(m)) ||
      passedNew ||
      c.fight?.result === "won";

    if (c.badges != null && c.badges > maxBadges) maxBadges = c.badges;
    if (m) seenMaps.add(m);
    for (const passed of c.maps ?? []) seenMaps.add(passed);

    if (progressed) {
      if (i - lastProgress >= 60) {
        incidents.push({ kind: "stall", call: calls[lastProgress].n, span: i - lastProgress, map: mapOf(calls[lastProgress]) });
      }
      lastProgress = i;
    }

    if (i >= 24) {
      const slice = calls.slice(i - 24, i + 1);
      const nonBattle = slice.filter((x) => !inBattle(x));
      if (i - lastPingPong >= 20 && !slice.some((x) => x.fight?.result === "won")) {
        const seq = nonBattle.map(mapOf).filter(Boolean).filter((x, k, a) => k === 0 || x !== a[k - 1]);
        if (seq.length >= 5 && new Set(seq).size <= 2) {
          incidents.push({ kind: "ping-pong", call: nonBattle[0].n, maps: [...new Set(seq)], transitions: seq.length - 1 });
          lastPingPong = i;
        }
      }
      if (i - lastSpin >= 20) {
        const counts = new Map();
        for (const t of nonBattle.slice(-20).map(tileOf).filter(Boolean)) counts.set(t, (counts.get(t) ?? 0) + 1);
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
        if (top && top[1] >= 5) {
          incidents.push({ kind: "tile-spin", call: nonBattle[Math.max(0, nonBattle.length - 20)].n, tile: top[0], visits: top[1] });
          lastSpin = i;
        }
      }
    }
  }

  if (calls.length > 0 && calls.length - 1 - lastProgress >= 60) {
    incidents.push({ kind: "stall-at-end", call: calls[lastProgress].n, span: calls.length - 1 - lastProgress, map: mapOf(calls.at(-1)) });
  }
  return incidents;
}

/**
 * Detects tool thrashing:
 * - `blind-retry`: the exact same failing `(tool, args)` >= 3 times in a row
 * - `error-storm`: >= 5 errors inside any 15-call window
 */
export function detectErrorLoops(calls) {
  const incidents = [];
  let streak = 0;
  let streakStart = 0;
  let lastSig = "";
  let lastTool = "";
  let lastErr = "";
  let lastStorm = -20;

  const flushStreak = () => {
    if (streak >= 3) incidents.push({ kind: "blind-retry", call: streakStart, tool: lastTool, count: streak, error: lastErr });
    streak = 0;
  };

  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    const sig = c.error ? `${c.tool}:${JSON.stringify(c.args ?? {})}` : "";
    if (sig && sig === lastSig) {
      streak++;
    } else {
      flushStreak();
      if (sig) {
        streak = 1;
        streakStart = c.n;
        lastSig = sig;
        lastTool = c.tool;
        lastErr = String(c.error).slice(0, 80);
      } else {
        lastSig = "";
      }
    }

    if (i >= 14 && i - lastStorm >= 15) {
      const errs = calls.slice(i - 14, i + 1).filter((x) => x.error).length;
      if (errs >= 5) {
        incidents.push({ kind: "error-storm", call: calls[i - 14].n, errors: errs, window: 15 });
        lastStorm = i;
      }
    }
  }
  flushStreak();
  return incidents;
}

/** Detects `screenshot-burst`: >= 3 screenshot calls within a 10-call window, tagged by context. */
export function detectScreenshotBursts(calls) {
  const incidents = [];
  const isShot = (c) => (c.images ?? 0) > 0 || c.tool === "get_screen";
  for (let i = 0; i < calls.length; i++) {
    if (!isShot(calls[i])) continue;
    const win = calls.slice(i, i + 10);
    const shots = win.filter(isShot);
    if (shots.length >= 3) {
      const ctx = shots.some((c) => c.dark) ? "dark" : shots.some(inBattle) ? "battle" : "overworld";
      incidents.push({ kind: "screenshot-burst", call: shots[0].n, count: shots.length, context: ctx, map: mapOf(shots[0]) });
      i += win.lastIndexOf(shots.at(-1));
    }
  }
  return incidents;
}

/**
 * Detects `compaction-amnesia` in the 20 calls immediately after each transcript compaction:
 * backtracking to a map first visited > 150 calls earlier (not visited in the 50 calls prior),
 * burning >= 6 read-only re-orientation calls, or an error spike of >= +4 vs. the 20 calls before.
 */
export function detectCompactionAmnesia(calls, compactions) {
  if (!compactions?.length || !calls.length) return [];
  const incidents = [];
  const firstVisit = new Map();
  for (const c of calls) {
    for (const m of [mapOf(c), ...(c.maps ?? [])]) {
      if (m && !firstVisit.has(m)) firstVisit.set(m, c.n);
    }
  }

  for (const { afterCall } of compactions) {
    const idx = calls.findIndex((c) => c.n > afterCall);
    if (idx < 0) continue;
    const before = calls.slice(Math.max(0, idx - 20), idx);
    const after = calls.slice(idx, idx + 20);
    const reorientCalls = after.filter((c) => READ_ONLY_TOOLS.has(c.tool)).length;
    const errDelta = after.filter((c) => c.error).length - before.filter((c) => c.error).length;

    const recentMaps = new Set();
    for (const c of calls.slice(Math.max(0, idx - 50), idx)) {
      const m = mapOf(c);
      if (m) recentMaps.add(m);
      for (const passed of c.maps ?? []) recentMaps.add(passed);
    }
    const backtracked = after.find((c) => {
      const m = mapOf(c);
      return m != null && !recentMaps.has(m) && (firstVisit.get(m) ?? Infinity) < afterCall - 150;
    });

    if (backtracked || reorientCalls >= 6 || errDelta >= 4) {
      incidents.push({
        kind: "compaction-amnesia",
        call: afterCall,
        reorientCalls,
        errDelta,
        backtrackMap: backtracked ? mapOf(backtracked) : null,
      });
    }
  }
  return incidents;
}

/**
 * Classifies each death increment (`cascade-wipe`, `underleveled-boss-death`, `no-switch-death`,
 * `boss-death`, `wild-or-trash-death`) and violation increment (`cap-violation`, `rule-violation`).
 * @param {any[]} calls
 * @param {any} [game]
 * @param {{ hpBefore?: Map<number, { hp: number, maxHp: number, pct: number }> | null }} [opts]
 */
export function detectDeathCauses(calls, game = GEN1, { hpBefore = null } = {}) {
  const incidents = [];
  let prevDeaths = 0;
  let prevViolations = 0;
  let prevCapViolations = 0;
  let activeFight = null;

  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    if (c.fight) activeFight = c.fight;
    else if (!inTrainerBattle(c) || (activeFight?.map && mapOf(c) && mapOf(c) !== activeFight.map)) activeFight = null;

    const deaths = c.deaths ?? prevDeaths;
    if (deaths > prevDeaths) {
      const delta = deaths - prevDeaths;
      const curMap = mapOf(c);
      const curTrainer = inTrainerBattle(c);
      const prev5 = [];
      for (let j = i; j >= Math.max(0, i - 5); j--) {
        if (mapOf(calls[j]) !== curMap || inTrainerBattle(calls[j]) !== curTrainer) break;
        prev5.push(calls[j]);
      }
      const switched = prev5.some((x) => usedTool(x, "switch_pokemon"));
      const offensiveCount = prev5.filter((x) => usedTool(x, "fight")).length;
      const hp = hpBefore?.get(c.n) ?? null;
      const lowHpNoSwitch = hp != null
        ? hp.pct < 0.35 && !switched && usedTool(c, "fight")
        : offensiveCount >= 2 && !switched;

      const fight = c.fight ?? activeFight;
      const bigFight = Boolean(fight && game?.bigFightClasses?.has(fight.trainerClass));
      const aliveLevels = (fight?.team ?? []).filter((m) => !m.dead && m.level != null).map((m) => m.level);
      const underleveled = bigFight && fight?.levelCap != null && aliveLevels.length > 0 && fight.levelCap - Math.max(...aliveLevels) >= 4;

      const kind =
        delta >= 3 ? "cascade-wipe"
        : underleveled ? "underleveled-boss-death"
        : lowHpNoSwitch ? "no-switch-death"
        : bigFight ? "boss-death"
        : "wild-or-trash-death";

      incidents.push({
        kind,
        call: c.n,
        lost: delta,
        map: mapOf(c),
        ...(hp ? { hpPct: Math.round(hp.pct * 100) } : {}),
      });
      prevDeaths = deaths;
    }

    const violations = c.violations ?? prevViolations;
    const capViolations = c.capViolations ?? prevCapViolations;
    if (violations > prevViolations) {
      incidents.push({
        kind: capViolations > prevCapViolations ? "cap-violation" : "rule-violation",
        call: c.n,
        map: mapOf(c),
      });
      prevViolations = violations;
    }
    if (capViolations > prevCapViolations) prevCapViolations = capViolations;
  }
  return incidents;
}

/**
 * Runs all detectors on one parsed attempt `{ session, calls }`.
 * @param {any} attempt
 * @param {{ game?: any, transcript?: string | null, name?: string, model?: string | null }} [opts]
 */
export function diagnoseAttempt(attempt, { game = GEN1, transcript = null, name = "run", model = null } = {}) {
  const counted = attempt.calls.filter((c) => !UNCOUNTED.has(c.tool) && !c.uncounted);
  const summary = summarize({ session: attempt.session, calls: counted }, game);
  const ctx = transcript ? contextStats(transcript) : null;
  const hpBefore = transcript ? hpBeforeCall(transcript) : null;

  const incidents = [
    ...detectSpatialLoops(counted),
    ...detectErrorLoops(counted),
    ...detectScreenshotBursts(counted),
    ...detectCompactionAmnesia(counted, ctx?.compactions),
    ...detectDeathCauses(counted, game, { hpBefore }),
  ].sort((a, b) => a.call - b.call);

  const lastCall = counted.at(-1)?.n ?? 0;
  const endCause = incidents.filter((x) => x.call >= lastCall - 40).map((x) => x.kind);
  const tags = [...new Set(incidents.map((x) => x.kind))];

  return {
    name,
    model: model ?? "unknown",
    outcome: summary.outcome,
    victory: summary.victory,
    badges: summary.badges,
    deaths: summary.deaths,
    calls: summary.calls,
    compactions: ctx?.compactions.length ?? 0,
    incidents,
    endCause: [...new Set(endCause)],
    tags,
  };
}

const fmtIncident = (inc) => {
  switch (inc.kind) {
    case "stall":
    case "stall-at-end":
      return `${inc.kind} (${inc.span} calls at ${inc.map ?? "?"})`;
    case "ping-pong":
      return `ping-pong (${inc.maps.join(" ↔ ")}, ${inc.transitions} transitions)`;
    case "tile-spin":
      return `tile-spin (${inc.tile}, ${inc.visits} visits)`;
    case "blind-retry":
      return `blind-retry (${inc.tool} ×${inc.count}: ${inc.error})`;
    case "error-storm":
      return `error-storm (${inc.errors}/${inc.window} calls failed)`;
    case "screenshot-burst":
      return `screenshot-burst (${inc.count} shots in ${inc.context}, ${inc.map ?? "?"})`;
    case "compaction-amnesia": {
      const parts = [`reorient ${inc.reorientCalls}`, `errDelta ${inc.errDelta >= 0 ? `+${inc.errDelta}` : inc.errDelta}`];
      if (inc.backtrackMap) parts.push(`backtracked to ${inc.backtrackMap}`);
      return `compaction-amnesia (${parts.join(", ")})`;
    }
    default:
      return `${inc.kind}${inc.lost ? ` (lost ${inc.lost}${inc.hpPct != null ? `, prior HP ${inc.hpPct}%` : ""})` : ""}${inc.map ? ` at ${inc.map}` : ""}`;
  }
};

/** Formats diagnosed runs as a per-model Markdown profile table plus optional per-run timelines. */
export function diagnoseReport(runs, { details = false } = {}) {
  if (!runs.length) return "No runs to diagnose.";
  const groups = new Map();
  for (const r of runs) {
    const g = groups.get(r.model) ?? [];
    g.push(r);
    groups.set(r.model, g);
  }
  const avg = (rs, kinds) => {
    const total = rs.reduce((s, r) => s + r.incidents.filter((i) => kinds.includes(i.kind)).length, 0);
    return (total / rs.length).toFixed(1);
  };

  const lines = [
    `# Run diagnostics: ${runs.length} run(s)`,
    "",
    "| Model | Runs | Wins | Stalls/run | Loops/run | ErrLoops | ShotBursts | Amnesia | NoSwitch | Underlv | WildDeaths | Violations |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];

  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  for (const [model, rs] of sorted) {
    const wins = rs.filter((r) => r.victory).length;
    lines.push(
      `| ${model} | ${rs.length} | ${wins} | ${avg(rs, ["stall", "stall-at-end"])} | ${avg(rs, ["ping-pong", "tile-spin"])} | ${avg(rs, ["blind-retry", "error-storm"])} | ${avg(rs, ["screenshot-burst"])} | ${avg(rs, ["compaction-amnesia"])} | ${avg(rs, ["no-switch-death"])} | ${avg(rs, ["underleveled-boss-death"])} | ${avg(rs, ["wild-or-trash-death"])} | ${avg(rs, ["cap-violation", "rule-violation"])} |`,
    );
  }

  if (details || runs.length <= 10) {
    lines.push("", "## Per-run incident timelines");
    for (const r of runs) {
      lines.push("", `### ${r.name} — ${r.model} (${r.outcome}, ${r.badges} badges, ${r.calls} calls, ${r.deaths} deaths, ${r.compactions} compactions)`);
      if (!r.incidents.length) {
        lines.push("- No failure incidents flagged.");
      } else {
        for (const inc of r.incidents) lines.push(`- call ${inc.call}: ${fmtIncident(inc)}`);
      }
      if (r.endCause.length && !r.victory) lines.push(`- **Near end:** ${r.endCause.join(", ")}`);
    }
  }
  return lines.join("\n");
}
