// The model's notes: a numbered list it adds to, removes entries from, or clears.

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { entriesOf, NOTES_MAX, numbered, updateNotes } from "../../mcp-server/notes.mjs";

describe("notes", () => {
  it("adds entries at the end, one line each", () => {
    let n = updateNotes("", { add: "Badge 1 done" });
    n = updateNotes(n, { add: ["Cap 21 next", "Line one\nline two"] });
    expect(entriesOf(n)).toEqual(["Badge 1 done", "Cap 21 next", "Line one / line two"]);
    expect(numbered(entriesOf(n))).toBe("1. Badge 1 done\n2. Cap 21 next\n3. Line one / line two");
  });

  it("removes entries by number, as last listed", () => {
    const n = updateNotes("a\nb\nc\nd", { remove: [2, 4] });
    expect(entriesOf(n)).toEqual(["a", "c"]);
    expect(() => updateNotes("a\nb", { remove: [3] })).toThrow(/No entry 3/);
  });

  it("clears, then removes, then adds, in one call", () => {
    expect(entriesOf(updateNotes("a\nb", { clear: true, add: "fresh" }))).toEqual(["fresh"]);
    expect(entriesOf(updateNotes("a\nb\nc", { remove: [1], add: "d" }))).toEqual(["b", "c", "d"]);
  });

  it("reads older notes (appended lines) as entries, and keeps the size limit", () => {
    expect(entriesOf("Team: SPROUT\n\nNext: TOWN 2\n")).toEqual(["Team: SPROUT", "Next: TOWN 2"]);
    expect(() => updateNotes("", { add: "x".repeat(NOTES_MAX + 1) })).toThrow(/limited/);
  });
});
