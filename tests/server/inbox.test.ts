// A playtest's inbox: the maintainer's message reaches the model in its next tool result, once.

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { createInbox, inboxText, withInbox } from "../../mcp-server/inbox.mjs";

const result = (text: string) => ({ content: [{ type: "text", text }] });

describe("the playtest inbox", () => {
  it("hands a waiting message over once, after the tool's own result, and keeps what it delivered", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "inbox-")), "inbox.txt");
    const handler = withInbox(createInbox(file), async () => result("Walk: up 1/1 — arrived"));
    expect((await handler({})).content).toEqual([{ type: "text", text: "Walk: up 1/1 — arrived" }]); // no file yet
    writeFileSync(file, "What made you go left there?\n");
    const got = await handler({});
    expect(got.content.map((c: { text: string }) => c.text)).toEqual(["Walk: up 1/1 — arrived", inboxText("What made you go left there?")]);
    expect(inboxText("x")).toMatch(/^📨 From the bench's maintainer \(this run is a playtest\): x\nTo answer, call report_issue/);
    // Delivered once: the next call has nothing extra, and the file is empty.
    expect((await handler({})).content).toHaveLength(1);
    expect(readFileSync(file, "utf8")).toBe("");
    expect(readFileSync(`${file}.delivered`, "utf8")).toMatch(/ What made you go left there\?\n$/);
  });

  it("leaves a handler as it was without an inbox (every run but a playtest with one)", () => {
    const handler = async () => result("x");
    expect(withInbox(null, handler)).toBe(handler);
    expect(existsSync(join(tmpdir(), "no-such-inbox.txt"))).toBe(false);
    expect(createInbox(join(tmpdir(), "no-such-inbox.txt"))()).toBeNull();
  });

  it("never fails the tool call over the inbox file: a message it can't read waits", async () => {
    // A directory where the file should be: reading it throws.
    const dir = mkdtempSync(join(tmpdir(), "inbox-"));
    const handler = withInbox(createInbox(dir), async () => result("Walk: up 1/1 — arrived"));
    expect((await handler({})).content).toEqual([{ type: "text", text: "Walk: up 1/1 — arrived" }]);
  });
});
