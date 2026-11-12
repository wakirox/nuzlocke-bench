// Friction report: spots in recorded runs where the tools may have let the model down, found
// from the transcripts without watching them. A spot where several runs trip is likely ours (a
// map or tool problem); one where a single run trips is likely the model. Playtest runs add the
// model's own report_issue calls.

const WHERE = /\[([A-Z0-9_]+)\](?: x(-?\d+) y(-?\d+))?/g;
const BLOCKED = /(up|down|left|right) \d+\/\d+ — stopped: blocked/;

/** The text of a tool_result block. */
const resultText = (c) => (typeof c === "string" ? c : (c ?? []).filter((x) => x.type === "text").map((x) => x.text).join("\n"));

/** The last 📍 position a result shows: { map, x, y }, or null. No x or y in the dark, or in a battle. */
export function whereOf(text) {
  let last = null;
  for (const m of String(text ?? "").matchAll(WHERE)) last = { map: m[1], x: m[2] == null ? null : Number(m[2]), y: m[3] == null ? null : Number(m[3]) };
  return last;
}

const spot = (w) => (w?.x == null ? "(no coordinates)" : `(${w.x},${w.y})`);

/**
 * A transcript (stream-json lines) as the model's calls, in order: tool, args, result text, error
 * flag, and `said`: what the model wrote between the previous call and this one.
 */
export function callsOf(transcript) {
  const calls = [];
  const byId = new Map();
  let said = [];
  for (const line of String(transcript ?? "").split("\n")) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const content = Array.isArray(e?.message?.content) ? e.message.content : [];
    for (const b of content) {
      if (b.type === "text" && e.type === "assistant" && b.text?.trim()) said.push(b.text.trim());
      if (b.type === "tool_use") {
        const call = { i: calls.length + 1, tool: String(b.name).split("__").pop(), args: b.input ?? {}, result: null, isError: false, images: 0, said: said.join(" ") };
        said = [];
        calls.push(call);
        byId.set(b.id, call);
      } else if (b.type === "tool_result" && byId.has(b.tool_use_id)) {
        const call = byId.get(b.tool_use_id);
        call.result = resultText(b.content);
        call.isError = !!b.is_error;
        call.images = Array.isArray(b.content) ? b.content.filter((x) => x.type === "image").length : 0;
      }
    }
  }
  return calls;
}

/** "walk_to ✗ No path to (27, 3) on this map." → "No path to (#, #) on this map" */
const errorKey = (text) => {
  const line = String(text).split("\n").find((l) => l.includes("✗")) ?? String(text).split("\n")[0];
  const msg = line.includes("✗") ? line.slice(line.indexOf("✗") + 1) : line;
  return msg.trim().replace(/-?\d+/g, "#").replace(/\s+/g, " ").slice(0, 120);
};

/**
 * One run's findings: { kind, key, call, map, detail }. Kinds: blocked (a walk stopped by
 * something it planned to cross), error, empty (a result with nothing in it), screenshot (the
 * text wasn't enough), repeat (the same call three times running).
 */
export function findingsOf(calls) {
  const out = [];
  let where = null;
  let streak = 0;
  calls.forEach((c, k) => {
    const prev = calls[k - 1];
    const text = c.result ?? "";
    const here = whereOf(text) ?? where;
    const map = here?.map ?? where?.map ?? "?";
    // A walk cut short because a trainer walked up to fight isn't something in the way: that's the game.
    const blocked = /\| battle: trainer\b/.test(text) ? null : text.match(BLOCKED);
    if (blocked && !/retry:.*arrived/.test(text)) {
      out.push({ kind: "blocked", key: `${map} ${spot(here)} going ${blocked[1]}`, call: c.i, map, detail: c.tool });
    } else if (blocked) {
      out.push({ kind: "blocked", key: `${where?.map ?? map} ${spot(where)} going ${blocked[1]}, then a retry got there`, call: c.i, map: where?.map ?? map, detail: c.tool });
    }
    if (c.isError || /✗/.test(text)) out.push({ kind: "error", key: `${c.tool}: ${errorKey(text)}`, call: c.i, map, detail: "" });
    if (c.result != null && !c.images && (!text.trim() || /completed with no output/.test(text))) {
      out.push({ kind: "empty", key: `${c.tool} returned nothing`, call: c.i, map, detail: "" });
    }
    if (c.tool === "get_screen") {
      const before = prev ? `${prev.tool}: ${String(prev.result ?? "").split("\n").find((l) => l.trim() && !l.startsWith("📍")) ?? ""}`.slice(0, 140) : "";
      out.push({ kind: "screenshot", key: map, call: c.i, map, detail: before });
    }
    // The same move turn after turn, or text and waiting, is normal play.
    const same = prev && !["fight", "advance_text", "wait"].includes(c.tool) && prev.tool === c.tool && JSON.stringify(prev.args) === JSON.stringify(c.args);
    streak = same ? streak + 1 : 0;
    if (streak === 2) out.push({ kind: "repeat", key: `${c.tool} ${JSON.stringify(c.args).slice(0, 80)}`, call: c.i, map, detail: "" });
    where = here;
  });
  return out;
}

/** Calls made on each map in one run, from the run log's `where` (or the transcript's positions). */
export function callsPerMap(calls) {
  const per = {};
  let map = null;
  for (const c of calls) {
    map = whereOf(c.result)?.map ?? map;
    if (map) per[map] = (per[map] ?? 0) + 1;
  }
  return per;
}

/** One line for a call: its tool and arguments, and the first line of its result that says something. */
const oneLine = (c) => {
  const args = JSON.stringify(c.args ?? {});
  const lines = String(c.result ?? "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("📍") && !/^\d+\. \w+$/.test(l));
  // What tells most: an error or a stop, then what the screen showed, else the first line.
  const result = lines.find((l) => /✗|stopped|Couldn't|No path/.test(l)) ?? lines.find((l) => /^(Screen|Text|Menu):\s*\S|^\(No text/.test(l)) ?? lines[0] ?? "";
  return `${c.tool} ${args.length > 120 ? `${args.slice(0, 117)}…` : args} → ${result.slice(0, 160)}${c.isError ? " (error)" : ""}`;
};
const clip = (t, n = 240) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/**
 * Every screenshot with what led to it: the two calls before (each with its result's first
 * line), what the model wrote before taking it, and what it did next. A screenshot means the
 * text results didn't tell the model enough, so the lead-up is where to look for the gap.
 */
export function screenshotsOf(calls) {
  const out = [];
  let where = null;
  calls.forEach((c, k) => {
    where = whereOf(c.result) ?? where;
    if (c.tool !== "get_screen") return;
    const next = calls.slice(k + 1).find((n) => n.tool !== "get_screen");
    out.push({
      call: c.i,
      map: where?.map ?? "?",
      before: calls.slice(Math.max(0, k - 2), k).map(oneLine),
      said: clip(c.said ?? ""),
      after: next ? { said: clip(next.said ?? ""), call: oneLine(next) } : null,
    });
  });
  return out;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/**
 * The report over runs [{ name, model, calls, issues }]: the same spot across runs first. Maps
 * where a run spent far more calls than the others did are listed too (at least 3× the median
 * of the runs that went there, and 40 calls).
 */
export function frictionReport(runs, { top = 15 } = {}) {
  const kinds = { blocked: "Walks stopped by something in the way", error: "Errors", empty: "Empty results", screenshot: "Screenshots (by map)", repeat: "The same call three times running" };
  const lines = [`# Friction report: ${runs.length} run(s)`, ""];
  const short = (r) => `${r.name.slice(5, 16)} ${r.model ?? "?"}`;

  const issues = runs.flatMap((r) => (r.issues ?? []).map((i) => ({ ...i, run: r })));
  if (issues.length) {
    lines.push(`## Reported by the model (${issues.length}; its own words, not checked)`, "");
    for (const i of issues) lines.push(`- **${i.where ?? "?"}** (${short(i.run)}, call ${i.n}): did ${i.did}; expected ${i.expected}; got ${i.happened}`);
    lines.push("");
  }

  const all = runs.flatMap((r) => findingsOf(r.calls).map((f) => ({ ...f, run: r })));
  for (const [kind, title] of Object.entries(kinds)) {
    const groups = new Map();
    for (const f of all.filter((f) => f.kind === kind)) {
      const g = groups.get(f.key) ?? { key: f.key, hits: [], runs: new Set() };
      g.hits.push(f);
      g.runs.add(f.run.name);
      groups.set(f.key, g);
    }
    if (!groups.size) continue;
    const ranked = [...groups.values()].sort((a, b) => b.runs.size - a.runs.size || b.hits.length - a.hits.length).slice(0, top);
    lines.push(`## ${title}`, "", "| Where / what | Runs | Times | Examples |", "|---|---|---|---|");
    for (const g of ranked) {
      const ex = g.hits.slice(0, 3).map((f) => `${short(f.run)} #${f.call}${f.detail && kind === "screenshot" ? ` after ${f.detail.replace(/\|/g, "/")}` : ""}`).join("<br>");
      lines.push(`| ${g.key.replace(/\|/g, "/")} | ${g.runs.size} | ${g.hits.length} | ${ex} |`);
    }
    lines.push("");
  }

  const shots = runs.flatMap((r) => screenshotsOf(r.calls).map((s) => ({ ...s, run: r })));
  if (shots.length) {
    lines.push(`## Screenshots, one by one (${shots.length}): what led to each`, "");
    for (const s of shots.slice(0, top * 3)) {
      lines.push(`- **${s.map}** (${short(s.run)}, call ${s.call})`);
      for (const b of s.before) lines.push(`  - before: ${b}`);
      if (s.said) lines.push(`  - the model: “${s.said}”`);
      if (s.after) lines.push(`  - next: ${s.after.said ? `“${s.after.said}” ` : ""}${s.after.call}`);
    }
    if (shots.length > top * 3) lines.push(`- … ${shots.length - top * 3} more (--top raises the limit)`);
    lines.push("");
  }

  const perRun = runs.map((r) => ({ r, per: callsPerMap(r.calls) }));
  const maps = new Set(perRun.flatMap((p) => Object.keys(p.per)));
  const slow = [];
  for (const m of maps) {
    const visits = perRun.filter((p) => p.per[m]);
    if (visits.length < 2) continue;
    const med = median(visits.map((p) => p.per[m]));
    for (const p of visits) if (p.per[m] >= 40 && p.per[m] >= 3 * med) slow.push({ m, run: p.r, n: p.per[m], med });
  }
  if (slow.length) {
    lines.push("## Maps where one run spent far longer than the others", "", "| Map | Run | Calls | Median of runs there |", "|---|---|---|---|");
    for (const s of slow.sort((a, b) => b.n / b.med - a.n / a.med).slice(0, top)) lines.push(`| ${s.m} | ${short(s.run)} | ${s.n} | ${s.med} |`);
    lines.push("");
  }
  return lines.join("\n");
}
