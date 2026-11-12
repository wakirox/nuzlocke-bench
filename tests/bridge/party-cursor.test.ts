// Steering the party screen's cursor (src/bridge/party-cursor.ts) on a simulated screen that
// fades in and drops presses, as the game does right after an item's USE.

import { describe, expect, it } from "vitest";
import { steerPartyCursor, type PartyCursorIo } from "../../src/bridge/party-cursor";

/** A party screen: hidden for `fade` waits, then the ▶ on `start`; presses listed in `dropped` (by number) are lost. */
function screen(o: { size: number; start: number; fade: number; dropped?: number[] }) {
  let waits = 0;
  let presses = 0;
  let at = o.start;
  const shown = () => waits >= o.fade;
  const io: PartyCursorIo = {
    cursor: () => (shown() ? at : -1),
    wait: async () => void waits++,
    press: async (dir) => {
      presses++;
      // Before the screen is up nothing registers; after, only the presses not listed as dropped.
      if (!shown() || o.dropped?.includes(presses)) return;
      at = Math.max(0, Math.min(o.size - 1, at + (dir === "down" ? 1 : -1)));
    },
  };
  return { io, cursor: () => at, presses: () => presses };
}

describe("party cursor", () => {
  it("waits for the screen to be drawn before pressing, then lands on the slot", async () => {
    const s = screen({ size: 5, start: 0, fade: 3 });
    expect(await steerPartyCursor(s.io, 4)).toBe(true);
    expect(s.cursor()).toBe(4);
    expect(s.presses()).toBe(4); // none wasted during the fade
  });

  it("makes up for dropped presses by looking after each one", async () => {
    const s = screen({ size: 5, start: 0, fade: 0, dropped: [1, 3] });
    expect(await steerPartyCursor(s.io, 4)).toBe(true);
    expect(s.cursor()).toBe(4);
  });

  it("goes up from wherever the cursor opened", async () => {
    const s = screen({ size: 6, start: 5, fade: 1 });
    expect(await steerPartyCursor(s.io, 1)).toBe(true);
    expect(s.cursor()).toBe(1);
  });

  it("says so when the screen never shows the cursor, without pressing", async () => {
    const s = screen({ size: 5, start: 0, fade: 1000 });
    expect(await steerPartyCursor(s.io, 2)).toBe(false);
    expect(s.presses()).toBe(0);
  });

  it("says so when the cursor can't reach the slot", async () => {
    const s = screen({ size: 3, start: 0, fade: 0 });
    expect(await steerPartyCursor(s.io, 4)).toBe(false);
  });
});
