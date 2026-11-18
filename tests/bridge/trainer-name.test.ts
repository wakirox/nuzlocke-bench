// The trainer a trainer battle is against, as its intro names them: the class name from the ROM, the
// rival as "your rival" (the ROM's class name for it isn't what the game shows).

import { describe, expect, it } from "vitest";
import { trainerName } from "../../src/bridge/summary";
import type { Tracker } from "../../src/tracker/tracker";

const t = { data: { trainerClasses: ["YOUNGSTER", "LASS", "RIVAL1", "LEADER_A"] } } as unknown as Pick<Tracker, "data">;
const fight = (trainerClass: number) => ({ battle: 2 as const, enemyTrainer: { trainerClass, number: 1, party: [] } });

describe("trainer name", () => {
  it("is the trainer's class from the ROM (ids count from 1)", () => {
    expect(trainerName(t, fight(2))).toBe("LASS");
    expect(trainerName(t, fight(4))).toBe("LEADER_A");
  });

  it("calls the rival your rival", () => {
    expect(trainerName(t, fight(3))).toBe("your rival");
  });

  it("is null outside a trainer battle or for a class the ROM doesn't name", () => {
    expect(trainerName(t, { battle: 1, enemyTrainer: null })).toBeNull();
    expect(trainerName(t, { battle: 0, enemyTrainer: null })).toBeNull();
    expect(trainerName(t, fight(9))).toBeNull();
  });
});
