// The status line's note on an area whose first encounter is unused: which wild Pokémon would
// count here, in the grass and while surfing (a sea route has only the second).

import { describe, expect, it } from "vitest";
import { thisAreaNote } from "../../src/bridge/summary";
import type { Tracker } from "../../src/tracker/tracker";
import { gen1Fixture } from "../games/gen1/fixture";

const GRASSMON = 1, SEAMON = 2, OWNED = 3;
const NAMES: Record<number, string> = { [GRASSMON]: "GRASSMON", [SEAMON]: "SEAMON", [OWNED]: "OWNEDMON" };
/** Only what the note uses: names, and OWNED is a dupe. */
const t = { name: (id: number) => NAMES[id], isDupe: (id: number) => id === OWNED } as unknown as Tracker;
const slots = (...species: number[]) => species.map((s) => ({ species: s, level: 20 }));
const note = (over: object) => thisAreaNote(t, gen1Fixture().state(over));

describe("this area's note", () => {
  it("names what would count in the grass, as before", () => {
    expect(note({ grassRate: 25, grassMons: slots(GRASSMON, OWNED) })).toBe("first encounter still available — would count: GRASSMON");
  });

  it("names what would count while surfing on a sea route", () => {
    expect(note({ waterRate: 5, waterMons: slots(SEAMON, OWNED) })).toBe("first encounter still available — would count while surfing: SEAMON");
  });

  it("names both where a map has grass and water", () => {
    expect(note({ grassMons: slots(GRASSMON), grassRate: 25, waterRate: 5, waterMons: slots(SEAMON) }))
      .toBe("first encounter still available — would count: GRASSMON (grass); SEAMON (surfing)");
    expect(note({ grassMons: slots(OWNED), grassRate: 25, waterRate: 5, waterMons: slots(SEAMON) }))
      .toBe("first encounter still available — would count: nothing in the grass: all dupes; SEAMON (surfing)");
  });

  it("says when every Pokémon here, grass and water, is a dupe", () => {
    expect(note({ grassMons: slots(OWNED), grassRate: 25, waterRate: 5, waterMons: slots(OWNED) }))
      .toBe("every Pokémon here is a dupe (OWNEDMON) — nothing to catch, skip it");
  });

  it("says when the map has no wild Pokémon at all", () => {
    expect(note({})).toBe("first encounter still available (no grass, cave or surfing encounters on this map)");
  });
});
