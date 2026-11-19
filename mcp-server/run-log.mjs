// Run log: one JSON line per tool call — what was called, how long it took, where the
// player was and how the run stood — the raw data for comparing runs and models.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { UNCOUNTED_RESULT } from "./call-budget.mjs";

/** The run outcome in a get_state result ({ run: { outcome: { kind, detail } } }). */
export function stateOutcome(text) {
  if (!text.startsWith("{")) return undefined;
  try {
    const o = JSON.parse(text)?.run?.outcome;
    return o ? `${o.kind}: ${o.detail}` : undefined;
  } catch {
    return undefined;
  }
}

/** The log entry for one finished call (result undefined = the handler threw); `status` is the page's latest status line. */
export function logEntry({ n, name, args, started, ended, result, status }) {
  const content = result?.content ?? [];
  const text = content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  const line = (prefix) => text.split("\n").find((l) => l.startsWith(prefix))?.slice(prefix.length).trim();
  return {
    n,
    t: new Date(started).toISOString(),
    ms: ended - started,
    tool: name,
    args: args ?? {},
    error: result?.isError ? text.slice(0, 500) : result ? undefined : "no result (threw)",
    where: line("📍"),
    // In a dark map (the bridge's status says so; the 📍 line has coordinates in the dark too).
    dark: status?.dark || undefined,
    outcome: line("🏁 RUN ENDED —") ?? stateOutcome(text),
    chars: text.length,
    images: content.filter((c) => c.type === "image").length || undefined,
    badges: status?.badges,
    deaths: status?.deaths,
    violations: status?.violations,
    candies: status?.candies,
    candiedToCap: status?.candiedToCap,
    overCap: status?.overCap,
    capViolations: status?.capViolations,
    firstRival: status?.firstRival,
    playTime: status?.playTime,
  };
}

/**
 * One call as transcript lines in the shape bench-run records Claude Code's (stream-json): the call as
 * an assistant tool_use, the result as a user tool_result. For a client the bench doesn't run itself
 * (NUZLOCKE_SERVER_TRANSCRIPT=1): the server sees the calls and results, never the model's words.
 */
export function transcriptLines({ n, name, args, started, result }) {
  const id = `call-${n}`;
  const timestamp = new Date(started).toISOString();
  const parts = (result?.content ?? []).map((c) =>
    c.type === "image" ? { type: "image", source: { type: "base64", media_type: c.mimeType ?? "image/png", data: c.data } } : c);
  return [
    { type: "assistant", timestamp, message: { role: "assistant", content: [{ type: "tool_use", id, name: `mcp__nuzlocke-bench__${name}`, input: args ?? {} }] } },
    { type: "user", timestamp, message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: result ? parts : [{ type: "text", text: "no result (threw)" }], ...(result?.isError || !result ? { is_error: true } : {}) }] } },
  ];
}

/**
 * Creates a per-call run logger (`wrap(name, handler)`) that writes one JSON line per call to
 * `file` (null = don't log). The first line is a session header (`session`: benchmark preset,
 * harness version…); `status()` gives the latest game status, `mapsEntered()` the maps entered
 * since it was last called.
 * @param {{ file: string | null, log?: (...args: any[]) => void, now?: () => number, status?: () => any, mapsEntered?: () => any[], session?: any, onEntry?: ((entry: any) => any) | null, transcript?: string | null }} opts
 */
export function createToolLogger({ file, log = () => {}, now = Date.now, status = () => null, mapsEntered = () => [], session = null, onEntry = null, transcript = null }) {
  let ready = false;
  const write = (entry) => {
    if (!file) return;
    try {
      if (!ready) {
        mkdirSync(dirname(file), { recursive: true });
        ready = true;
        log(`run log: ${file}`);
        const header = typeof session === "function" ? session() : session;
        if (header) appendFileSync(file, JSON.stringify({ type: "session", t: new Date(now()).toISOString(), ...header }) + "\n");
      }
      appendFileSync(file, JSON.stringify(entry) + "\n");
    } catch (e) {
      log("run log write failed:", e.message);
    }
  };
  let seq = 0;
  let lastWhere;
  let lastFight = null;
  return (name, handler) => async (args, ...rest) => {
    const started = now();
    const n = ++seq;
    let result;
    let refused = false;
    try {
      result = await handler(args, ...rest);
      // Refused before any of it ran (call-budget.mjs): logged as such, so the run's call count
      // leaves it out the way the budget does. The mark stops here, short of the MCP result.
      if (result?.[UNCOUNTED_RESULT]) {
        refused = true;
        const { [UNCOUNTED_RESULT]: _, ...rest } = result;
        result = rest;
      }
      return result;
    } finally {
      const entry = logEntry({ n, name, args, started, ended: now(), result, status: status() });
      if (refused) entry.uncounted = true;
      // A failed call (or a report) shows no location: it happened where the game is now.
      const game = status();
      if (!entry.where && game?.location) entry.where = `${game.location} | battle: ${game.battle ?? "?"}`;
      if (name === "report_issue" && !entry.where) entry.where = lastWhere;
      if (entry.where) lastWhere = entry.where;
      // Maps the call passed through on the way (go_to, travel, do): a milestone map among them counts.
      const passed = mapsEntered();
      if (passed.length) entry.maps = passed;
      // A trainer battle began or ended during this call: the teams as it began, and how it went.
      const fight = status()?.lastFight;
      const fightJson = fight ? JSON.stringify(fight) : null;
      if (fightJson && fightJson !== lastFight) {
        entry.fight = fight;
        lastFight = fightJson;
      }
      write(entry);
      if (transcript) {
        try {
          appendFileSync(transcript, transcriptLines({ n, name, args, started, result }).map((l) => JSON.stringify(l) + "\n").join(""));
        } catch (e) {
          log("transcript write failed:", e.message);
        }
      }
      if (onEntry) {
        try {
          await onEntry(entry);
        } catch (e) {
          log("after the run log entry:", e.message);
        }
      }
    }
  };
}
