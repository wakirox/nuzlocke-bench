// A battler's types as the battle structs hold them (two type ids; one type stored twice).

import { describe, expect, it } from "vitest";
import { battleTypes } from "../../src/games/battle-types";

describe("battle types", () => {
  it("names both types, and one type once", () => {
    expect(battleTypes(0x17, 0x09)).toEqual(["ELECTRIC", "STEEL"]);
    expect(battleTypes(0x00, 0x00)).toEqual(["NORMAL"]);
    expect(battleTypes(0x1b, 0x19)).toEqual(["DARK", "ICE"]);
  });

  it("gives nothing for a byte that isn't a type (the species' types are used then)", () => {
    expect(battleTypes(0x06, 0x00)).toBeUndefined(); // Gen 2's unused bird type slot
    expect(battleTypes(0xff, 0xff)).toBeUndefined();
  });
});
