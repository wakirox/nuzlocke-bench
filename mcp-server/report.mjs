// Benchmark results from run logs (run-log.mjs): one summary per attempt — how it went
// (outcome, badges, deaths, violations, game time, badge splits) and what it took (tool calls,
// time, result size). A log covers one server session; each successful new_run starts a new
// attempt within it.

/** Parses a run log's text into its session header and call entries. */
import { harnessLabel } from "./provenance.mjs";
import { GEN1 } from "./games/index.mjs";

/** Gen 1's milestones and hard areas: the dashboard and tables list these (games/gen1.mjs). */
export const OBJECTIVES = GEN1.objectives;
export const HARD_AREAS = GEN1.hardAreas;

export function parseLog(text) {
  const lines = text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const session = lines.find((l) => l.type === "session") ?? null;
  const calls = lines.filter((l) => l.type !== "session");
  return { session, calls };
}

/** Splits a session's calls into attempts: a successful new_run starts the next one. */
export function attempts({ session, calls }) {
  const out = [];
  let cur = [];
  for (const c of calls) {
    if (c.tool === "new_run" && !c.error && cur.length) {
      out.push(cur);
      cur = [];
    }
    cur.push(c);
  }
  if (cur.length) out.push(cur);
  return out.map((cs) => ({ session, calls: cs }));
}

const seconds = (hms) => {
  if (!hms) return null;
  const [h, m, s] = hms.split(":").map(Number);
  return h * 3600 + m * 60 + s;
};

/** One attempt → its summary. */
export function summarize({ session, calls }, game = GEN1) {
  const tools = {};
  const splits = [];
  let chars = 0, errors = 0, badges = 0, deaths = 0, violations = 0, outcome = null, busyMs = 0, playTime = null;
  // Rare Candies and level caps: null in logs from before the page reported them.
  const caps = { candies: null, candiedToCap: null, overCap: null, capViolations: null };
  let firstRival = null;
  const first = calls[0] ? Date.parse(calls[0].t) : null;
  for (const c of calls) {
    tools[c.tool] = (tools[c.tool] ?? 0) + 1;
    chars += c.chars ?? 0;
    busyMs += c.ms ?? 0;
    if (c.error) errors++;
    if (c.badges != null && c.badges > badges) {
      for (let b = badges + 1; b <= c.badges; b++) {
        splits.push({ badge: b, call: c.n, playTime: c.playTime ?? null, wallMs: Date.parse(c.t) + (c.ms ?? 0) - first });
      }
      badges = c.badges;
    }
    if (c.deaths != null) deaths = c.deaths;
    if (c.violations != null) violations = c.violations;
    for (const k of Object.keys(caps)) if (c[k] != null) caps[k] = c[k];
    if (c.firstRival) firstRival = c.firstRival;
    if (c.playTime && (playTime == null || seconds(c.playTime) >= seconds(playTime))) playTime = c.playTime;
    if (c.outcome) outcome = c.outcome;
  }
  const last = calls.at(-1) ? Date.parse(calls.at(-1).t) + (calls.at(-1).ms ?? 0) : null;
  return {
    preset: session?.benchmark?.id ?? null,
    harness: harnessLabel(session?.harness),
    outcome: outcome ?? "unfinished",
    // A victory only counts without violations (when they don't end the run, they can still happen).
    victory: /^victory/.test(outcome ?? "") && violations === 0,
    disqualified: /^disqualified/.test(outcome ?? ""),
    badges,
    deaths,
    violations,
    playTime,
    splits,
    calls: calls.length,
    errors,
    wallMs: first != null && last != null ? last - first : 0,
    busyMs,
    chars,
    charsPerCall: calls.length ? Math.round(chars / calls.length) : 0,
    topTools: Object.entries(tools).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, n]) => `${t}×${n}`).join(", "),
    play: playStats(calls),
    caps,
    firstRival: firstRival ?? firstRivalFromCalls(calls, outcome, game),
  };
}


/**
 * How the first rival battle went, for logs from before the page reported it: lost when the run
 * was wiped in the lab, won once the player got out of the home town (it can't be left before that
 * fight), else not known (null).
 */
export function firstRivalFromCalls(calls, outcome, game = GEN1) {
  const maps = calls.map((c) => /\[([A-Z0-9_]+)\]/.exec(c.where ?? "")?.[1]).filter(Boolean);
  if (/^wipe/.test(outcome ?? "") && maps.at(-1) === "OAKS_LAB") return "lost";
  return maps.some((m) => !game.home.has(m)) ? "won" : null;
}

/**
 * How the attempt was played, from its calls: the model's own route book and notes, screenshots,
 * how much of the world it saw, and its longest stretch of calls without reaching a new map
 * (lost in a cave, stuck on a blocker…).
 */
export function playStats(calls) {
  const seen = new Set();
  let furthest = null, sinceNew = 0, longestStuck = 0, routesSaved = 0, routeTrips = 0, notesWritten = 0, screenshots = 0;
  for (const c of calls) {
    if (c.tool === "note_route" && !c.error) routesSaved++;
    if (c.tool === "go_to" && !c.error) routeTrips++;
    if (c.tool === "notes" && !c.error && (c.args?.add != null || c.args?.remove?.length || c.args?.clear || c.args?.append != null || c.args?.replace != null)) notesWritten++;
    if (c.tool === "get_screen") screenshots++;
    const map = /\[([A-Z0-9_]+)\]/.exec(c.where ?? "")?.[1];
    if (map && !seen.has(map)) {
      seen.add(map);
      furthest = (c.where ?? "").replace(/ \[.*$/, "");
      sinceNew = 0;
    } else {
      longestStuck = Math.max(longestStuck, ++sinceNew);
    }
  }
  return { mapsVisited: seen.size, furthest, longestStuck, routesSaved, routeTrips, notesWritten, screenshots };
}

/**
 * What the run's own files add (a run folder from scripts/bench-run.mjs): the starter (from the
 * transcript), catches, deaths with their causes and Pokémon Center heals (the tracker's saved
 * snapshot, with names as the game showed them) and the model's notes.
 */
/**
 * Tool calls the MCP server rejected before they ran (arguments that don't match the tool's schema):
 * the run log never sees them, only the transcript's error results.
 */
export function rejectedCalls(transcript) {
  let n = 0;
  for (const line of (transcript ?? "").split("\n")) {
    if (!line.includes("Input validation error")) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type !== "user") continue;
    for (const c of Array.isArray(e.message?.content) ? e.message.content : []) {
      if (c.type !== "tool_result" || !c.is_error) continue;
      const text = typeof c.content === "string" ? c.content : (c.content ?? []).map((p) => p.text ?? "").join("\n");
      if (/Input validation error/.test(text)) n++;
    }
  }
  return n;
}

export function runExtras({ tracker, transcript, notes, game = GEN1 }) {
  const events = (tracker?.events ?? []).map((e) => e.text ?? "");
  // "PLAYER received a MONA!" in a result's messages (one line each), not the rival's.
  const joined = (transcript ?? "").replace(/\\n\s*•\s*/g, " ");
  // Else the first lead any result's status line shows ("🟢 you: X Lv5", or "NICK (X) Lv5"): before any catch, the starter.
  const starter = /(?<!RIVAL )received a ([A-Z][A-Z♀♂.' -]*?)!/.exec(joined)?.[1] ?? /🟢 you: (?:[^(\n]*? \()?([A-Z][A-Z♀♂.' -]*?)\)? Lv/.exec(transcript ?? "")?.[1] ?? null;
  return {
    starter,
    caught: events.filter((e) => /^Caught /.test(e)).map((e) => e.replace(/^Caught /, "").replace(/\.$/, "")),
    deaths: [...new Set(events.filter((e) => / died \(/.test(e)).map((e) => e.replace(/\. (Box|It can).*$/, "")))],
    pcHeals: tracker?.pcHeals ?? null,
    fights: bigFights(tracker, game),
    notes: notes?.trim() || null,
    context: contextStats(transcript),
    rejected: rejectedCalls(transcript),
  };
}

/**
 * The model's context through the run, from the transcript: each compaction (Claude Code's
 * compact_boundary event: after which tool call, and how big the context was), the largest
 * context any turn read (what most of a long run's cost is), and the window the model ran with
 * (the CLI's result event: modelUsage[model].contextWindow; 1M only with the [1m] suffix).
 */
export function contextStats(transcript) {
  let calls = 0, peak = 0, window = null;
  const compactions = [];
  for (const line of (transcript ?? "").split("\n")) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type === "result") {
      for (const m of Object.values(e.modelUsage ?? {})) if (m?.contextWindow) window = Math.max(window ?? 0, m.contextWindow);
      continue;
    }
    if (e.type === "system" && e.subtype === "compact_boundary") {
      compactions.push({ afterCall: calls, tokens: e.compact_metadata?.pre_tokens ?? null });
      continue;
    }
    if (e.type !== "assistant") continue;
    for (const c of Array.isArray(e.message?.content) ? e.message.content : []) if (c.type === "tool_use") calls++;
    const u = e.message?.usage;
    if (u) peak = Math.max(peak, (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0));
  }
  return { compactions, peak: peak || null, window };
}

const kTokens = (n) => (n == null ? "—" : n >= 1e6 && n % 1e6 === 0 ? `${n / 1e6}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
// The window is the one Claude Code compacted at when the runner set it (agent.json compactWindow), else the model's.
const contextText = (c, compactWindow) => {
  const w = compactWindow ?? c?.window;
  return !c?.peak ? "—" : w ? `${kTokens(c.peak)} of ${kTokens(w)}` : kTokens(c.peak);
};
const compactionText = (c) => (!c ? "—" : c.compactions.length ? `${c.compactions.length} (after call ${c.compactions.map((x) => x.afterCall).join(", ")})` : "0");

/** How each run was played: a second table, so the first stays readable. */
export function playTable(rows) {
  const head = "| Run | Starter | First rival battle | Caught | Maps seen | Furthest | Longest stuck (calls) | Routes saved / used | Notes written | Screenshots | Center heals | Compactions | Peak context (of the window) |";
  const sep = "|---|---|---|---|---|---|---|---|---|---|---|---|---|";
  const body = rows.map((r) => {
    const p = r.play ?? {};
    const x = r.extras ?? {};
    return `| ${r.name} | ${x.starter ?? "—"} | ${rivalText(r.firstRival)} | ${x.caught ? x.caught.length : "—"} | ${p.mapsVisited ?? "—"} | ${p.furthest ?? "—"} | ${p.longestStuck ?? "—"} | ${p.routesSaved ?? 0} / ${p.routeTrips ?? 0} | ${p.notesWritten ?? 0} | ${p.screenshots ?? 0} | ${x.pcHeals ?? "—"} | ${compactionText(x.context)} | ${contextText(x.context, r.agent?.compactWindow)} |`;
  });
  return [head, sep, ...body].join("\n");
}


/**
 * The big fights in a tracker save (saves before trainer battles were recorded have none). A fight
 * the run ended in (a wipe stops the tracker before it sees the battle end) counts as lost, with the
 * deaths since it began.
 */
export function bigFights(tracker, game = GEN1) {
  const all = tracker?.trainerFights ?? [];
  return all.filter((f) => game.bigFightClasses.has(f.trainerClass)).map((f) => {
    if (f.result) return f;
    const last = f === all.at(-1);
    const ended = tracker.outcome && last;
    return {
      ...f,
      result: ended ? (tracker.outcome.kind === "victory" ? "won" : "lost") : undefined,
      died: (tracker.dead ?? []).slice(f.deadBefore).map((d) => d.nickname || `#${d.species}`),
    };
  });
}

/**
 * The same from the run log (each fight is logged as it begins and again as it ends): for runs whose
 * tracker save is missing. `outcome` is the run's, for the fight it ended in.
 */
export function fightsFromCalls(calls, outcome, game = GEN1) {
  const byKey = new Map();
  for (const c of calls) if (c.fight) byKey.set(`${c.fight.trainerClass}:${c.fight.number}:${c.fight.playTime}`, c.fight);
  const kind = !outcome ? undefined : /^victory/.test(outcome) ? "victory" : "lost";
  return bigFights({ trainerFights: [...byKey.values()], dead: [], outcome: kind ? { kind } : null }, game);
}

/** A team's members that may battle (saves before the dead stayed in the party have no `dead`). */
const living = (team) => team.filter((m) => !m.dead);

/** What changed in the team between two big fights: who joined or left, the lead, levels gained. */
export function teamChange(prev, cur) {
  if (!prev) return "—";
  const id = (m) => `${m.nickname}|${m.species}`;
  // The dead may ride in the party but don't battle: they're no longer on the team.
  const was = living(prev.team);
  const now = living(cur.team);
  const before = new Map(was.map((m) => [m.nickname, m]));
  const joined = now.filter((m) => !was.some((p) => p.nickname === m.nickname)).map((m) => `+${m.nickname}`);
  const left = was.filter((p) => !now.some((m) => m.nickname === p.nickname)).map((p) => `−${p.nickname}`);
  const levels = now.reduce((n, m) => n + Math.max(0, m.level - (before.get(m.nickname)?.level ?? m.level)), 0);
  const parts = [...joined, ...left];
  if (now[0] && was[0] && id(now[0]) !== id(was[0])) parts.push(`lead ${was[0].nickname}→${now[0].nickname}`);
  if (levels) parts.push(`+${levels} levels`);
  return parts.join(", ") || "same team";
}

/** One row per big fight per run: the team brought, the cap, what changed since the last big fight, how it went. */
export function bigFightsTable(rows) {
  const seen = new Set();
  const body = [];
  for (const r of rows) {
    let prev = null;
    for (const f of r.extras?.fights ?? []) {
      // A continued run's saves carry the fights before it: list each once, under the first run.
      const key = `${f.trainerClass}:${f.number}:${f.playTime}:${f.team.map((m) => m.nickname).join(",")}`;
      const dup = seen.has(key);
      seen.add(key);
      if (!dup) {
        const team = f.team.map((m) => `${m.nickname === m.species ? m.species : `${m.nickname} (${m.species})`} Lv${m.level}${m.dead ? " (dead)" : m.hp ? "" : " ✗"}`).join(", ");
        const foe = f.foe.map((m) => `${m.species} Lv${m.level}`).join(", ");
        const top = Math.max(0, ...living(f.team).map((m) => m.level));
        body.push(`| ${r.name} | ${f.trainer} (${f.map}) | ${f.badges} · ${f.playTime} | ${foe || "—"} | ${team} | ${f.levelCap ?? "—"} (top Lv${top}) | ${teamChange(prev, f)} | ${f.result ?? "—"} | ${f.died?.length ? f.died.join(", ") : "—"} |`);
      }
      prev = f;
    }
  }
  if (!body.length) return null;
  return ["| Run | Fight | Badges · game time | Their team | Team brought (✗ fainted already; dead ones carried, not counted) | Level cap | Changed since the last big fight | Result | Died in it |",
    "|---|---|---|---|---|---|---|---|---|", ...body].join("\n");
}

/** Per run: the team it caught, who died of what, and the model's own notes. */
export function details(rows) {
  return rows.filter((r) => r.extras).map((r) => {
    const x = r.extras;
    return [
      `### ${r.name}`,
      `- **Starter:** ${x.starter ?? "?"}`,
      `- **Caught:** ${x.caught.length ? x.caught.join("; ") : "nothing"}`,
      `- **Deaths:** ${x.deaths.length ? x.deaths.join("; ") : "none"}`,
      "",
      x.notes ? `Notes:\n\n${x.notes.split("\n").map((l) => `> ${l}`).join("\n")}` : "No notes.",
    ].join("\n");
  }).join("\n\n");
}

const hms = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** The outcome as the table shows it: a model that stopped playing (scripts/bench-run.mjs) gave up. */
const rivalText = (v) => ({ won: "won", lost: "lost", "lost-free": "lost (didn't count: firstrival)" })[v] ?? "—";

function outcomeText(r) {
  // A loss the firstrival option excused still shows next to how the run ended.
  const rival = r.firstRival === "lost-free" ? " · lost the first rival battle (didn't count)" : "";
  if (/^victory/.test(r.outcome) && !r.victory) return `${r.outcome} (doesn't count: ${r.violations} violations)${rival}`;
  if (r.outcome === "unfinished" && r.agent?.gaveUp) return `gave up (stopped playing after nudges)${rival}`;
  return `${r.outcome}${rival}`;
}

/** Summaries → a Markdown table. */
export function table(rows) {
  const head = "| Run | Model | Preset | Harness | Outcome | Badges | Deaths | Violations | Game time | Calls | Errors | Nudges | Tokens (turns) | Real time | Result chars (avg) | Most used |";
  const sep = "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|";
  // Who played comes from scripts/bench-run.mjs (runs/<id>.agent.json); runs played otherwise show —.
  // A run continued from another's saves, or (older runs) told to narrate, isn't a clean benchmark result: say so.
  const who = (a) => (a?.model ? `${a.model}${a.effort ? ` (${a.effort})` : ""}${a.via === "api" ? " · via API" : ""}${a.maps === "always" ? " · maps after every move" : ""}${a.effectiveness === "on" && !String(a.preset ?? "").includes("+hints") ? " · effectiveness shown" : ""}${a.resumedFrom ? ` · continued from ${a.resumedFrom}` : ""}${a.narrated ? " · narrated" : ""}${a.playtest ? " · playtest (not a result)" : ""}` : "—");
  const body = rows.map((r) =>
    `| ${r.name} | ${who(r.agent)} | ${r.preset ?? "—"} | ${r.harness ?? "—"} | ${outcomeText(r)} | ${r.badges} | ${r.deaths} | ${r.violations} | ${r.playTime ?? "—"} | ${r.calls} | ${r.errors} | ${r.agent?.nudges ?? "—"} | ${r.agent?.tokens ? `${(r.agent.tokens.total / 1e6).toFixed(1)}M (${r.agent.tokens.turns})` : "—"} | ${hms(r.wallMs)} | ${r.chars} (${r.charsPerCall}) | ${r.topTools} |`);
  return [head, sep, ...body].join("\n");
}

/**
 * Rare Candies and level caps: candies used, Pokémon candied to exactly the cap, Pokémon that
 * went over the cap (by candy or in battle) and level-cap violations. Empty when no run has them.
 */
export function capsTable(rows) {
  if (!rows.some((r) => r.caps?.candies != null)) return "";
  const head = "| Run | Rare Candies used | Room left after each use (levels below the cap) | Candied to the cap | Went over the cap | Level-cap violations |";
  const sep = "|---|---|---|---|---|---|";
  const cell = (v) => v ?? "—";
  const body = rows.map((r) => {
    const c = r.caps ?? {};
    return `| ${r.name} | ${cell(c.candies)} | ${roomText(c.roomLeft)} | ${cell(c.candiedToCap)} | ${cell(c.overCap)} | ${cell(c.capViolations)} |`;
  });
  return [head, sep, ...body].join("\n");
}

/** "0×9, 2×1 (avg 0.2)": how many levels below the cap each Rare Candy use stopped. */
function roomText(room) {
  if (!room?.length) return "—";
  const n = {};
  for (const r of room) n[r] = (n[r] ?? 0) + 1;
  const avg = room.reduce((a, b) => a + b, 0) / room.length;
  return `${Object.keys(n).map(Number).sort((a, b) => a - b).map((k) => `${k}×${n[k]}`).join(", ")} (avg ${avg.toFixed(1)})`;
}

/**
 * Rare Candies and level caps read back from a run's transcript, for runs logged before the page
 * counted them, plus how far below the cap each use stopped (never logged). `calls` are the run
 * log's: the k-th rare_candy result goes with the k-th logged rare_candy call, for its badges;
 * `levelCaps` is the run's own (saves/run.json). The cap is taken as the next gym's in order.
 */
export function capsFromTranscript({ transcript, calls, levelCaps }) {
  const lines = (transcript ?? "").split("\n").filter((l) => l.trim());
  const named = new Map();
  const results = [];
  for (const l of lines) {
    let ev;
    try { ev = JSON.parse(l); } catch { continue; }
    for (const c of Array.isArray(ev.message?.content) ? ev.message.content : []) {
      if (c.type === "tool_use") named.set(c.id, c.name.split("__").pop());
      else if (c.type === "tool_result") {
        const text = typeof c.content === "string" ? c.content : (c.content ?? []).map((x) => x.text ?? "").join("\n");
        results.push({ tool: named.get(c.tool_use_id), text, refused: !!c.is_error && /MCP error -32602|Input validation error/.test(text) });
      }
    }
  }
  const capFor = (badges) => (badges < 8 ? levelCaps?.gyms?.[badges] : levelCaps?.elite?.at(-1)) ?? null;
  const candyCalls = calls.filter((c) => c.tool === "rare_candy");
  let k = 0, candies = 0;
  const roomLeft = [], toCap = new Set(), over = new Set(), violations = new Set();
  for (const r of results) {
    for (const e of r.text.split("\n").map((x) => x.trim()).filter((x) => x.startsWith("📋"))) {
      const o = /\] (.+?) is Lv\d+, over the level cap \(Lv(\d+)/.exec(e);
      if (o) over.add(`${o[1]}:${o[2]}`);
      if (/^📋 \[violation\].*level cap/.test(e)) violations.add(e);
    }
    if (r.tool !== "rare_candy" || r.refused) continue;
    const call = candyCalls[k++];
    const gained = (r.text.match(/grew to level \d+/g) ?? []).length;
    const done = /• (.+?) is Lv(\d+)\./.exec(r.text);
    if (!gained || !done) continue;
    candies += gained;
    const cap = call ? capFor(call.badges ?? 0) : null;
    if (cap == null) continue;
    roomLeft.push(cap - Number(done[2]));
    if (Number(done[2]) === cap) toCap.add(`${done[1]}:${cap}`);
  }
  return { candies, candiedToCap: toCap.size, overCap: over.size, capViolations: violations.size, roomLeft };
}

/** Badge splits: when each badge came, in game time, real time and tool calls. */
export function splitsTable(rows) {
  const withSplits = rows.filter((r) => r.splits.length);
  if (!withSplits.length) return "";
  const head = "| Run | " + Array.from({ length: 8 }, (_, i) => `Badge ${i + 1}`).join(" | ") + " |";
  const sep = "|---|" + "---|".repeat(8);
  const body = withSplits.map((r) => {
    const cells = Array.from({ length: 8 }, (_, i) => {
      const s = r.splits.find((x) => x.badge === i + 1);
      return s ? `${s.playTime ?? "?"} (call ${s.call}, ${hms(s.wallMs)} real)` : "";
    });
    return `| ${r.name} | ${cells.join(" | ")} |`;
  });
  return [head, sep, ...body].join("\n");
}


/** Which objectives a run's calls reached: { id: game time when first reached }. */

export function objectivesOf(calls, game = GEN1) {
  return reachedBy(calls, game, (c) => c.playTime ?? null);
}

/** The same, as the number of calls it took: { id: 1-based call that first reached it } (for the speed points). */
export function objectiveCallsOf(calls, game = GEN1) {
  return reachedBy(calls, game, (c, i) => i + 1);
}

function reachedBy(calls, game, value) {
  const reached = {};
  calls.forEach((c, i) => {
    const map = /\[([A-Z0-9_]+)\]/.exec(c.where ?? "")?.[1];
    // The maps the call passed through on the way count too (a log from before they were recorded has none).
    const passed = [...(c.maps ?? []), map].filter(Boolean);
    for (const o of game.objectives) {
      if (reached[o.id] !== undefined) continue;
      const beatRival = o.rival === map && c.fight?.result === "won" && game.rivalClasses.has(c.fight.trainerClass) && (!o.rivalClass || c.fight.trainerClass === o.rivalClass);
      if ((o.badges && (c.badges ?? 0) >= o.badges) || (o.maps && passed.some((m) => o.maps.includes(m))) || beatRival) reached[o.id] = value(c, i);
    }
  });
  // A log from before fights were recorded can't show rival wins: a run past a rival fought it and won.
  if (!calls.some((c) => c.fight)) {
    game.objectives.forEach((o, i) => {
      if (!o.rival) return;
      const later = game.objectives.slice(i + 1).find((x) => !x.rival && reached[x.id] !== undefined);
      if (later) reached[o.id] = reached[later.id];
    });
  }
  return reached;
}


/**
 * The dark tunnel as a milestone: did the run get through, in the dark or with light, and what did
 * that cost? Null if it never got there. Calls and deaths count from the first call inside to the
 * first call past it (or the run's end), trips out included. A location with no x y outside battle
 * is a dark one: older runs always show them, as their tools ignored the dark ("lit tools").
 */
/**
 * Deaths in the run's last battle, for a wipe: those are the wipe itself, which the score charges as one
 * end-of-run penalty instead of per Pokémon (a big team wiping cost more than a lone starter). Counts from
 * the last call made outside a battle.
 */
export function lastBattleDeathsOf(calls) {
  let i = calls.length - 1;
  while (i >= 0 && !/battle: none/.test(calls[i].where ?? "")) i--;
  const before = i >= 0 ? (calls[i].deaths ?? 0) : 0;
  return Math.max(0, (calls.at(-1)?.deaths ?? 0) - before);
}

export function darkTunnelOf(calls, game = GEN1) {
  const mapOf = (c) => /\[([A-Z0-9_]+)\]/.exec(c.where ?? "")?.[1];
  const start = calls.findIndex((c) => game.darkMaps.has(mapOf(c)));
  if (start < 0) return null;
  let end = calls.findIndex((c, i) => i > start && mapOf(c) === game.afterTheDark);
  const crossed = end >= 0;
  if (!crossed) end = calls.length;
  const inside = calls.slice(start, end);
  const flash = inside.find((c) => !c.error && game.darkMaps.has(mapOf(c)) && /FLASH/i.test(JSON.stringify(c.args ?? {})) && /field_move|do|walk/.test(c.tool));
  const darkRules = inside.some((c) => game.darkMaps.has(mapOf(c)) && /battle: none/.test(c.where) && !/\bx\d+ y\d+/.test(c.where));
  const result = !darkRules ? "lit tools"
    : crossed ? (flash ? "crossed with light" : "crossed in the dark")
    : flash ? "not crossed, had light" : "not crossed";
  const deaths = (inside.at(-1)?.deaths ?? 0) - (inside[0]?.deaths ?? 0);
  return { result, calls: inside.length, deaths, flashAt: flash ? calls.indexOf(flash) - start + 1 : null };
}


const clockSeconds = (t) => (t ? t.split(":").reduce((a, b) => a * 60 + Number(b), 0) : null);

/**
 * What each hard area cost a run: from the first call inside to the milestone that ends it, or to
 * the run's end. Trips out on the way count, as they're part of the cost; `entries` says how many
 * times it went in.
 */
export function hardAreasOf(calls, game = GEN1) {
  const out = [];
  const reached = objectivesOf(calls, game);
  for (const area of game.hardAreas) {
    const inside = (c) => {
      const map = /\[([A-Z0-9_]+)\]/.exec(c.where ?? "")?.[1] ?? "";
      return map.startsWith(area.prefix) && map !== area.not;
    };
    const start = calls.findIndex(inside);
    if (start < 0) continue;
    const doneAt = reached[area.done];
    let end = calls.length;
    if (doneAt !== undefined) {
      const objective = game.objectives.find((o) => o.id === area.done);
      const hit = calls.findIndex((c, i) => i > start && objective.maps?.includes(/\[([A-Z0-9_]+)\]/.exec(c.where ?? "")?.[1]));
      if (hit >= 0) end = hit;
    }
    const span = calls.slice(start, end);
    if (!span.length) continue;
    let entries = 0;
    span.forEach((c, i) => { if (inside(c) && (i === 0 || !inside(span[i - 1]))) entries++; });
    const times = span.map((c) => clockSeconds(c.playTime)).filter((t) => t != null);
    out.push({
      id: area.id, label: area.label, done: doneAt !== undefined, calls: span.length, entries,
      deaths: (span.at(-1).deaths ?? 0) - (span[0].deaths ?? 0),
      seconds: times.length ? times.at(-1) - times[0] : null,
    });
  }
  return out;
}

/** Screenshots the model took, its own calls and the ones in a batch. */
export function screenshotsOf(calls) {
  let n = 0;
  for (const c of calls) {
    if (c.tool === "get_screen") n++;
    else if (c.tool === "do") n += (JSON.stringify(c.args ?? {}).match(/get_screen/g) ?? []).length;
  }
  return n;
}

/** The dark tunnel, one row per run that reached it. */
export function darkTunnelTable(rows) {
  const reached = rows.filter((r) => r.darkTunnel);
  if (!reached.length) return "";
  return [
    "| Run | Result | Calls | Deaths | Flash at call |",
    "|---|---|---|---|---|",
    ...reached.map((r) => `| ${r.name} | ${r.darkTunnel.result} | ${r.darkTunnel.calls} | ${r.darkTunnel.deaths} | ${r.darkTunnel.flashAt ?? ""} |`),
  ].join("\n");
}

/** "haiku-5-5 medium" (+ " api", " maps-always" when turned back on, " playtest"): runs are compared within these groups. */
const groupOf = (agent) => agent?.model
  ? `${String(agent.model).replace(/^claude-/, "").replace(/\[1m\]$/, "")}${agent.effort ? ` ${agent.effort}` : ""}${agent.via === "api" ? " api" : ""}${agent.maps === "always" ? " maps-always" : ""}${agent.effectiveness === "on" && !String(agent.preset ?? "").includes("+hints") ? " effectiveness" : ""}${agent.playtest ? " playtest" : ""}`
  : "unknown";

/**
 * Objectives by model: how many runs reached each, and where runs stopped (the first objective
 * not reached). A run continued in another folder (--resume) counts once, with its first part.
 */
export function objectivesTable(rows) {
  const byName = new Map(rows.map((r) => [r.name, r]));
  const rootOf = (r) => {
    let at = r;
    for (let i = 0; i < 20 && at.agent?.resumedFrom && byName.has(at.agent.resumedFrom); i++) at = byName.get(at.agent.resumedFrom);
    return at;
  };
  const runs = new Map();
  for (const r of rows) {
    const root = rootOf(r);
    const run = runs.get(root.name) ?? { group: `${groupOf(root.agent)}${root.preset ? ` · ${root.preset}` : ""}`, reached: {} };
    for (const [k, v] of Object.entries(r.objectives ?? {})) if (run.reached[k] === undefined) run.reached[k] = v;
    runs.set(root.name, run);
  }
  const groups = [...new Set([...runs.values()].map((r) => r.group))].sort();
  if (!groups.length) return "";
  const inGroup = (g) => [...runs.values()].filter((r) => r.group === g);
  const pct = (n, d) => `${n}/${d}${d ? ` (${Math.round((100 * n) / d)}%)` : ""}`;
  const head = `| Objective | ${groups.join(" | ")} |`;
  const sep = `|---|${groups.map(() => "---|").join("")}`;
  const body = OBJECTIVES.map((o) => `| ${o.label} | ${groups.map((g) => { const rs = inGroup(g); return pct(rs.filter((r) => r.reached[o.id] !== undefined).length, rs.length); }).join(" | ")} |`);
  const stopped = groups.map((g) => {
    const counts = {};
    for (const r of inGroup(g)) {
      const next = OBJECTIVES.find((o) => !o.rival && r.reached[o.id] === undefined);
      const at = next ? next.label : "finished";
      counts[at] = (counts[at] ?? 0) + 1;
    }
    return `- **${g}** stopped before: ${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ")}`;
  });
  return [head, sep, ...body, "", ...stopped].join("\n");
}
