// The model panel's feed (mcp-server/transcript-feed.mjs): stream-json lines as panel events, and the
// run's usage and model.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { feedEvents, readFeed, readUsage } from "../../mcp-server/transcript-feed.mjs";

const line = (o: object) => JSON.stringify(o);
const AT = "2026-10-15T19:21:48.254Z";

describe("transcript feed", () => {
  it("gives a call and its result the same id, and each event its time", () => {
    const call = feedEvents(line({
      type: "assistant", timestamp: AT,
      message: { content: [{ type: "text", text: " Heading north. " }, { type: "tool_use", id: "toolu_1", name: "mcp__nuzlocke-bench__walk_to", input: { x: 3, y: 4 } }] },
    }));
    expect(call).toEqual([
      { kind: "say", text: "Heading north.", at: AT },
      { kind: "call", tool: "walk_to", text: '{"x":3,"y":4}', id: "toolu_1", at: AT },
    ]);
    const result = feedEvents(line({
      type: "user", timestamp: AT,
      message: { content: [{ type: "tool_result", tool_use_id: "toolu_1", is_error: true, content: [{ type: "text", text: "No path" }, { type: "image", source: { media_type: "image/png", data: "AAA" } }] }] },
    }));
    expect(result).toEqual([{ kind: "result", text: "No path", error: true, id: "toolu_1", at: AT, images: [{ mime: "image/png", data: "AAA" }] }]);
  });

  it("keeps a result's whole text", () => {
    const text = "📍 ROUTE 1 [ROUTE_1] x3 y4\n".repeat(200);
    const [r] = feedEvents(line({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t", content: text }] } }));
    expect(r.text).toBe(text);
    expect(r.at).toBeUndefined();
  });

  it("shows the runner's nudges, the compaction summary and the compaction itself", () => {
    expect(feedEvents(line({ type: "nudge", text: "Keep playing.", t: AT }))).toEqual([{ kind: "user", text: "Keep playing.", at: AT }]);
    expect(feedEvents(line({ type: "user", isSynthetic: true, timestamp: AT, message: { content: [{ type: "text", text: "This session is being continued…" }] } })))
      .toEqual([{ kind: "summary", text: "This session is being continued…", at: AT }]);
    expect(feedEvents(line({ type: "system", subtype: "compact_boundary", compact_metadata: { pre_tokens: 167211, post_tokens: 2286 } })))
      .toEqual([{ kind: "compact", text: "Context compacted (167,211 → 2,286 tokens)" }]);
    expect(feedEvents(line({ type: "system", subtype: "thinking_tokens" }))).toEqual([]);
    expect(feedEvents("not json")).toEqual([]);
  });

  it("reads new events from an offset", () => {
    const dir = mkdtempSync(join(tmpdir(), "feed-"));
    const file = join(dir, "transcript.jsonl");
    const first = line({ type: "nudge", text: "one" }) + "\n";
    writeFileSync(file, first + line({ type: "nudge", text: "two" }) + "\n" + '{"type":"nud');
    const all = readFeed(file, 0);
    expect(all.events.map((e: { text: string }) => e.text)).toEqual(["one", "two"]);
    expect(readFeed(file, Buffer.byteLength(first)).events.map((e: { text: string }) => e.text)).toEqual(["two"]);
    expect(readFeed(join(dir, "none.jsonl"), 0)).toMatchObject({ missing: true });
  });
});

describe("transcript usage", () => {
  const assistant = (id: string) => line({ type: "assistant", message: { id, content: [], usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 85 } } });

  it("counts tokens and turns, and names the model from the init event", () => {
    const file = join(mkdtempSync(join(tmpdir(), "usage-")), "transcript.jsonl");
    writeFileSync(file, [line({ type: "system", subtype: "init", model: "claude-haiku-5-5" }), assistant("m1"), assistant("m1"), assistant("m2")].join("\n") + "\n");
    expect(readUsage(file)).toEqual({ tokens: 200, turns: 2, model: "claude-haiku-5-5", effort: null });
  });

  it("takes the model and effort from agent.json when the run wrote one", () => {
    const dir = mkdtempSync(join(tmpdir(), "usage-"));
    const file = join(dir, "transcript.jsonl");
    writeFileSync(file, [line({ type: "system", subtype: "init", model: "claude-haiku-5-5" }), assistant("m1")].join("\n") + "\n");
    writeFileSync(join(dir, "agent.json"), JSON.stringify({ model: "haiku", effort: "low" }));
    expect(readUsage(file)).toMatchObject({ model: "haiku", effort: "low" });
    expect(readUsage(join(dir, "none.jsonl"))).toBeNull();
  });

  it("takes them from player.json while the run is live (no agent.json yet)", () => {
    const dir = mkdtempSync(join(tmpdir(), "usage-"));
    const file = join(dir, "transcript.jsonl");
    writeFileSync(file, [line({ type: "system", subtype: "init", model: "claude-haiku-5-5" }), assistant("m1")].join("\n") + "\n");
    writeFileSync(join(dir, "player.json"), JSON.stringify({ model: "claude-haiku-5-5", effort: "low" }));
    expect(readUsage(file)).toMatchObject({ model: "claude-haiku-5-5", effort: "low" });
  });
});

describe("reading the transcript in pieces", () => {
  const say = (text: string) => JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text }] } });

  it("continues at the next line's first byte when a fresh read starts inside a multi-byte character", () => {
    const file = join(mkdtempSync(join(tmpdir(), "feed-")), "transcript.jsonl");
    const lines = [say("ÉÉÉÉ first"), say("second ✓✓"), say("third")];
    const all = lines.join("\n") + "\n";
    writeFileSync(file, all);
    // A fresh page (from 0) reads only the last maxBytes: make that window start on the second byte of an É.
    const midChar = Buffer.byteLength(lines[0].slice(0, lines[0].indexOf("É"))) + 1;
    const first = readFeed(file, 0, Buffer.byteLength(all) - midChar);
    expect(first.next).toBe(Buffer.byteLength(all)); // exactly the end of the file, not a byte or two off
    expect(first.events.map((e: { text: string }) => e.text)).toEqual(["second ✓✓", "third"]);
    writeFileSync(file, all + say("fourth") + "\n");
    expect(readFeed(file, first.next).events.map((e: { text: string }) => e.text)).toEqual(["fourth"]);
  });

  it("treats a negative or odd starting point as the start", () => {
    const file = join(mkdtempSync(join(tmpdir(), "feed-")), "transcript.jsonl");
    writeFileSync(file, say("only") + "\n");
    expect(readFeed(file, -1).events.map((e: { text: string }) => e.text)).toEqual(["only"]);
    expect(readFeed(file, Number.NaN).events).toHaveLength(1);
  });
});
