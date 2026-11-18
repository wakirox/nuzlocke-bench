// Menus.cursorOn: is the ▶ on the option asked for? An option may be named by the start of its
// label, but never when that start is another option on the same screen (a move question asked
// to forget BUBBLE must not forget BUBBLEBEAM).

import { describe, expect, it } from "vitest";
import { cursorOnOption } from "../../src/bridge/menus";

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
});
