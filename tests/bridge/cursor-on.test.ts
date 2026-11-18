// Menus.cursorOn: is the ▶ on the option asked for? An option may be named by the start of its
// label, but never when that start is another option on the same screen (a move question asked
// to forget BUBBLE must not forget BUBBLEBEAM).

import { describe, expect, it } from "vitest";
import { cursorOnOption } from "../../src/bridge/screen-state";

const moves = (cursorRow: number) => {
  const rows = ["BUBBLEBEAM", "BUBBLE", "TACKLE", "TAIL WHIP"].map((m, i) => `│${i === cursorRow ? "▶" : " "}${m.padEnd(11)}│`);
  return ["┌────────────┐", ...rows, "└────────────┘"];
};

describe("cursorOn", () => {
  it("doesn't take a longer name under the cursor for an option listed by itself", () => {
    expect(cursorOnOption(moves(0), "BUBBLE")).toBe(false);
    expect(cursorOnOption(moves(1), "BUBBLE")).toBe(true);
    expect(cursorOnOption(moves(0), "BUBBLEBEAM")).toBe(true);
  });

  it("still takes the start of a label when nothing else on screen is named that", () => {
    const start = ["┌────────┐", "│▶POKéMON│", "│ ITEM   │", "└────────┘"];
    expect(cursorOnOption(start, "POKé")).toBe(true);
    expect(cursorOnOption(start, "ITEM")).toBe(false);
    // A price or count after the name, one space apart, is part of the same cell.
    expect(cursorOnOption(["│▶POTION ¥300 │", "│ ANTIDOTE ¥100│"], "POTION")).toBe(true);
  });

  it("matches nothing for an option with no letters or digits", () => {
    expect(cursorOnOption(moves(0), "---")).toBe(false);
    expect(cursorOnOption(moves(0), "?")).toBe(false);
  });

  it("exactly: only the option itself (BERRY can be further down a list that shows BERRY JUICE)", () => {
    const bag = ["┌────────────┐", "│▶BERRY JUICE│", "│ ANTIDOTE   │", "└────────────┘"];
    expect(cursorOnOption(bag, "BERRY")).toBe(true);
    expect(cursorOnOption(bag, "BERRY", true)).toBe(false);
    expect(cursorOnOption(bag, "BERRY JUICE", true)).toBe(true);
    // A price or count one space after the name still matches it exactly.
    expect(cursorOnOption(["│▶POTION ¥300 │"], "POTION", true)).toBe(true);
    expect(cursorOnOption(["│▶MAX REVIVE ×1│"], "MAX REVIVE", true)).toBe(true);
  });
});
