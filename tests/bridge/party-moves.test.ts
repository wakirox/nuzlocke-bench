// get_state's party: every member's moves in one short string each (summary.ts moveLine), with the
// multiplier where the effectiveness switch takes it out.

import { describe, expect, it } from "vitest";
import { moveLine } from "../../src/bridge/summary";
// @ts-expect-error plain ESM module without type declarations
import { hideEffectiveness } from "../../mcp-server/format.mjs";

describe("party moves", () => {
  it("writes name, type, power, multiplier and PP, the name ending at a colon", () => {
    expect(moveLine({ name: "HYPER BEAM", type: "NORMAL", power: 150, pp: 4, maxPp: 5, effectiveness: 0.5 })).toBe("HYPER BEAM: NORMAL 150 0.5× 4/5pp");
    expect(moveLine({ name: "GROWL", type: "NORMAL", power: 0, pp: 40, maxPp: 40 })).toBe("GROWL: NORMAL status 40/40pp");
    expect(moveLine({ name: "TACKLE", type: "NORMAL", power: 35, pp: 35, maxPp: 35, effectiveness: 0 })).toBe("TACKLE: NORMAL 35 no effect 35/35pp");
  });

  it("loses the multiplier with effectiveness off, like the lead's", () => {
    const party = JSON.stringify({ moves: ["SURF: WATER 95 2× 15/15pp", "BITE: NORMAL 60 no effect 25/25pp"] });
    expect(hideEffectiveness(party)).toBe(JSON.stringify({ moves: ["SURF: WATER 95 15/15pp", "BITE: NORMAL 60 25/25pp"] }));
  });
});
