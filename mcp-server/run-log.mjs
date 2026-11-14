// Run log: one JSON line per tool call — what was called, how long it took, where the
// player was and how the run stood — the raw data for comparing runs and models.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

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
 * Wraps server.registerTool so every tool registered afterwards is logged to `file`
 * (null = don't log). Call before registering tools. The first line is a session header
 * (`session`: benchmark preset, harness version…); `status()` gives the latest game status,
 * `mapsEntered()` the maps entered since it was last called.
 */
export function instrumentTools(server, { file, log = () => {}, now = Date.now, status = () => null, mapsEntered = () => [], session = null, onEntry = null }) {
  let ready = false;
  const write = (entry) => {
    if (!file) return;
    try {
      if (!ready) {
        mkdirSync(dirname(file), { recursive: true });
        ready = true;
        log(`run log: ${file}`);
        if (session) appendFileSync(file, JSON.stringify({ type: "session", t: new Date(now()).toISOString(), ...session }) + "\n");
      }
      appendFileSync(file, JSON.stringify(entry) + "\n");
    } catch (e) {
      log("run log write failed:", e.message);
    }
  };
  let seq = 0;
  let lastWhere;
  let lastFight = null;
  const registerTool = server.registerTool.bind(server);
  // Tools registered without an inputSchema get only (extra), not (args, extra).
  server.registerTool = (name, config, handler) => registerTool(name, config, async (...cbArgs) => {
    const args = config.inputSchema ? cbArgs[0] : {};
    const started = now();
    const n = ++seq;
    let result;
    try {
      result = await handler(...cbArgs);
      return result;
    } finally {
      const entry = logEntry({ n, name, args, started, ended: now(), result, status: status() });
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
      if (onEntry) {
        try {
          await onEntry(entry);
        } catch (e) {
          log("after the run log entry:", e.message);
        }
      }
    }
  });
}
