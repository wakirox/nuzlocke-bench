// The model's side of a run, for the page's conversation panel: bench-run writes Claude Code's
// stream-json transcript next to the run log, and the page polls GET /transcript?from=<offset>
// for what's new: what the model says and thinks, each tool call with its whole result (maps and
// screens included, as the model saw them), and the runner's nudges.

import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { TokenMeter } from "./bench-runner.mjs";

const TOOL_PREFIX = /^mcp__nuzlocke-bench__/;

/**
 * One stream-json line as panel events: { kind, text, tool?, id?, at?, error?, images? }.
 * kind: say | think | call | result | user (the runner's nudge) | summary (what a compaction left the
 * model) | compact | end. A call and its result share `id` (the tool_use id), so the panel can put
 * each result under its call; `at` is the event's time (ISO), when the line has one.
 */
export function feedEvents(line) {
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    return [];
  }
  const out = [];
  const at = e.timestamp ?? e.t;
  const stamp = at ? { at } : {};
  const content = e.message?.content;
  if (e.type === "assistant" && Array.isArray(content)) {
    for (const b of content) {
      if (b.type === "text" && b.text?.trim()) out.push({ kind: "say", text: b.text.trim(), ...stamp });
      else if (b.type === "thinking" && b.thinking?.trim()) out.push({ kind: "think", text: b.thinking.trim(), ...stamp });
      else if (b.type === "tool_use") out.push({ kind: "call", tool: String(b.name).replace(TOOL_PREFIX, ""), text: JSON.stringify(b.input ?? {}), ...(b.id ? { id: b.id } : {}), ...stamp });
    }
  } else if (e.type === "user") {
    // Claude Code's own user turns (the summary a compaction leaves) are marked synthetic.
    const kind = e.isSynthetic ? "summary" : "user";
    if (typeof content === "string" && content.trim()) out.push({ kind, text: content.trim(), ...stamp });
    for (const b of Array.isArray(content) ? content : []) {
      if (b.type === "text" && b.text?.trim()) out.push({ kind, text: b.text.trim(), ...stamp });
      if (b.type !== "tool_result") continue;
      const parts = typeof b.content === "string" ? [{ type: "text", text: b.content }] : b.content ?? [];
      const text = parts.filter((p) => p.type === "text").map((p) => p.text).join("\n");
      // Screenshots as the model got them (stream-json keeps the image: { source: { media_type, data } }).
      const images = parts.filter((p) => p.type === "image" && p.source?.data).map((p) => ({ mime: p.source.media_type ?? "image/png", data: p.source.data }));
      out.push({ kind: "result", text, error: !!b.is_error, ...(b.tool_use_id ? { id: b.tool_use_id } : {}), ...stamp, ...(images.length ? { images } : {}) });
    }
  } else if (e.type === "nudge" && e.text?.trim()) {
    // bench-run writes its nudges itself (claude doesn't echo user turns on stdin).
    out.push({ kind: "user", text: e.text.trim(), ...stamp });
  } else if (e.type === "system" && e.subtype === "compact_boundary") {
    const m = e.compact_metadata ?? {};
    const sizes = m.pre_tokens && m.post_tokens ? ` (${m.pre_tokens.toLocaleString("en-US")} → ${m.post_tokens.toLocaleString("en-US")} tokens)` : "";
    out.push({ kind: "compact", text: `Context compacted${sizes}`, ...stamp });
  } else if (e.type === "result") {
    // The turn's last text is already in the feed as the model's own message.
    out.push({ kind: "end", text: "Turn ended.", ...stamp });
  }
  return out;
}

/** New events in `file` from byte `from` on (complete lines only): { events, next }. */
export function readFeed(file, from = 0, maxBytes = 512 * 1024) {
  if (!file || !existsSync(file)) return { events: [], next: 0, missing: true };
  const size = statSync(file).size;
  // A fresh page asks from 0: start near the end of a long transcript.
  let start = !Number.isFinite(from) || from < 0 || from > size ? 0 : Math.floor(from);
  if (start === 0 && size > maxBytes) start = size - maxBytes;
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(Math.min(size - start, maxBytes));
    const n = readSync(fd, buf, 0, buf.length, start);
    // Lines end at a newline byte, counted in bytes: decoding first would shift the offset when the
    // read starts inside a multi-byte character.
    const bytes = buf.subarray(0, n);
    const end = bytes.lastIndexOf(0x0a);
    if (end < 0) return { events: [], next: start };
    let lines = bytes.subarray(0, end).toString("utf8").split("\n");
    if (start > 0 && from === 0) lines = lines.slice(1); // started mid-line
    return { events: lines.flatMap(feedEvents), next: start + end + 1 };
  } finally {
    closeSync(fd);
  }
}

/**
 * The model and effort the run was started with: bench-run's agent.json (written when the run ends),
 * else its player.json (written as it starts).
 */
function agentOf(file) {
  for (const name of ["agent.json", "player.json"]) {
    try {
      const a = JSON.parse(readFileSync(join(dirname(file), name), "utf8"));
      return { model: typeof a.model === "string" ? a.model : null, effort: typeof a.effort === "string" ? a.effort : null };
    } catch {
      /* not there (yet) */
    }
  }
  return { model: null, effort: null };
}

/**
 * Tokens and turns of the whole transcript so far (counted like the runner's: once per message), and
 * the model: agent.json's when there is one, else the transcript's init event's (no effort there).
 */
const usage = { file: null, offset: 0, rest: "", meter: new TokenMeter(), model: null };
export function readUsage(file) {
  if (!file || !existsSync(file)) return null;
  const size = statSync(file).size;
  if (usage.file !== file || size < usage.offset) Object.assign(usage, { file, offset: 0, rest: "", meter: new TokenMeter(), model: null });
  if (size > usage.offset) {
    const fd = openSync(file, "r");
    try {
      const buf = Buffer.alloc(size - usage.offset);
      const n = readSync(fd, buf, 0, buf.length, usage.offset);
      usage.offset += n;
      const lines = (usage.rest + buf.subarray(0, n).toString("utf8")).split("\n");
      usage.rest = lines.pop() ?? "";
      for (const line of lines) {
        const init = line.includes('"subtype":"init"');
        if (!init && !line.includes('"usage"')) continue;
        try {
          const ev = JSON.parse(line);
          if (init && ev.type === "system" && ev.subtype === "init" && ev.model) usage.model = ev.model;
          usage.meter.add(ev);
        } catch {
          /* not a whole event */
        }
      }
    } finally {
      closeSync(fd);
    }
  }
  const t = usage.meter.totals();
  const agent = agentOf(file);
  return { tokens: t.total, turns: t.turns, model: agent.model ?? usage.model, effort: agent.effort };
}
