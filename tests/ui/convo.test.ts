// The model log's one-line view of a closed result (src/ui/convo.ts).

import { describe, expect, it } from "vitest";
import { placeOf, summaryOf, took } from "../../src/ui/convo";

const FIGHT = `📍 CAVE 1 (3) [CAVE_1_B2F] x13 y8 | battle: trainer
🟢 you: RATTY (MONA) Lv13 14/31HP | moves: CLAW 1× 35pp
🔴 foe: OOZEMON Lv12 47%HP [POISON]
Used BLAZE.
Messages:
  • RATTY used BLAZE!`;

describe("model log summaries", () => {
  it("skips the status header for the line that says what happened", () => {
    expect(summaryOf(FIGHT)).toBe("Used BLAZE.");
    expect(summaryOf("1. walk_to\n📍 ROUTE 4 [ROUTE_4] x3 y7\nMap:\nMap exits: up, down.")).toBe("Map exits: up, down.");
  });

  it("puts a run's end or a tracker note first", () => {
    expect(summaryOf(`${FIGHT}\nTracker:\n  📋 [warning] ZIPPY (BATMON) died.`)).toBe("📋 [warning] ZIPPY (BATMON) died.");
    expect(summaryOf(`${FIGHT}\n🏁 RUN ENDED — wipe\n  📋 [warning] Team wiped`)).toBe("🏁 RUN ENDED — wipe");
  });

  it("shows an error's failed step, else its first line", () => {
    expect(summaryOf("1. walk_to: walk: up 4/4 — arrived\n2. fight_trainer ✗ No path to (0, 0)", true)).toBe("2. fight_trainer ✗ No path to (0, 0)");
    expect(summaryOf("No path to (7, 2): it's on this map.\ny  1  # # .", true)).toBe("No path to (7, 2): it's on this map.");
    expect(summaryOf("")).toBe("(no text)");
  });

  it("reads the place from the 📍 line", () => {
    expect(placeOf(FIGHT)).toBe("CAVE 1 (3)");
    expect(placeOf("1. walk_to\n📍 ROUTE 4 (Building) [CAVE_1_REST_STOP] x3 y7")).toBe("ROUTE 4 (Building)");
    expect(placeOf("{\"bag\":[]}")).toBeNull();
  });

  it("says how long a call took", () => {
    expect(took("2026-10-15T19:21:48.000Z", "2026-10-15T19:21:49.250Z")).toBe("1.3s");
    expect(took("2026-10-15T19:21:48.000Z", "2026-10-15T19:23:53.000Z")).toBe("2m 5s");
    expect(took(undefined, "2026-10-15T19:21:49.250Z")).toBe("");
  });
});
