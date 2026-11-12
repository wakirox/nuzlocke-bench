// Finished runs keep their transcript gzipped (mcp-server/run-folder.mjs): readers take either form.

import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error plain ESM module without type declarations
import { compressTranscript, readTranscript } from "../../mcp-server/run-folder.mjs";

describe("compressed transcripts", () => {
  it("gzips a transcript, removes the plain file, and reads back the same text", () => {
    const file = join(mkdtempSync(join(tmpdir(), "run-")), "transcript.jsonl");
    const text = Array.from({ length: 500 }, (_, i) => JSON.stringify({ type: "user", n: i, text: "📍 ROUTE 1 · walk up 3/3 — arrived" })).join("\n") + "\n";
    writeFileSync(file, text);
    const sizes = compressTranscript(file);
    expect(sizes.before).toBe(Buffer.byteLength(text));
    expect(sizes.after).toBeLessThan(sizes.before / 4);
    expect(existsSync(file)).toBe(false);
    expect(existsSync(`${file}.gz`)).toBe(true);
    expect(readTranscript(file)).toBe(text);
  });

  it("reads the plain file while it's there (a live run), and has nothing to do without one", () => {
    const dir = mkdtempSync(join(tmpdir(), "run-"));
    const file = join(dir, "transcript.jsonl");
    expect(readTranscript(file)).toBeNull();
    expect(compressTranscript(file)).toBeNull();
    writeFileSync(file, "line\n");
    expect(readTranscript(file)).toBe("line\n");
    expect(readFileSync(file, "utf8")).toBe("line\n");
  });
});
