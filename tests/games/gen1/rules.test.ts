// Gen 1 quirks the shared suite can't express in game-neutral terms.

import { describe, expect, it } from "vitest";
import { Run } from "../../harness/scenario";
import { SPECIES, gen1Fixture } from "./fixture";

const game = gen1Fixture("red");

describe("Gen 1 Nuzlocke quirks", () => {
  it("doesn't count the old man's catching demo as your encounter", () => {
    // During the demo the game swaps the player's name for his.
    const run = new Run(game).goTo(game.places.route).poll({ playerName: "OLD MAN" })
      .wildBattle(game.ids.wildA).endBattle().poll({ playerName: "PLAYER" });
    expect(Object.values(run.engine.snap.areas)).toEqual([]);
  });

  it("records each trainer battle: both teams as it began, and how it went", () => {
    const run = new Run(game).goTo(game.places.route)
      .trainerBattle(SPECIES.WILD_A, 12)
      .poll({ enemyTrainer: { trainerClass: 0x22, number: 1, party: [{ species: SPECIES.WILD_A, level: 12, hp: 30 }] } })
      .endBattle();
    const [fight] = run.engine.snap.trainerFights ?? [];
    expect(fight).toMatchObject({ trainerClass: 0x22, number: 1, badges: 0, result: "won", died: [] });
    expect(fight.foe).toEqual([{ species: expect.any(String), level: 12 }]);
    expect(fight.team).toHaveLength(run.s.party.length);
    expect(fight.team[0]).toMatchObject({ level: run.s.party[0].level, moves: expect.any(Array) });
  });

  it("uses the lowest unbeaten gym for the cap when badges come out of order", () => {
    const run = new Run(game);
    // Gyms 1-4 and 6 (Lv43) beaten, gym 5 (Lv43) not: the cap stays at 43, set by gym 5.
    run.poll({ badges: 0b0011_1111 & ~(1 << 4) });
    expect(run.engine.levelCap(run.s)).toEqual({ level: 43, who: "Gym 5" });
  });

  const league = (mapConst: string) => ({ badges: 0xff, map: game.adapter.mapConstants.indexOf(mapConst), mapConst });

  it("caps the whole League at the last Elite Four member's top level, and lets it be passed once the League has begun", () => {
    const run = new Run(game, league("LORELEIS_ROOM"));
    expect(run.engine.levelCap(run.s)).toEqual({ level: 62, who: "Elite Four 4" });
    run.setMon(0, { level: 63 }).trainerBattle(SPECIES.WILD_A, 54);
    expect(run.violations()).toHaveLength(1); // entering the League over the cap
    const later = new Run(game, league("BRUNOS_ROOM")).setMon(0, { level: 63 }).trainerBattle(SPECIES.WILD_A, 56);
    expect(later.violations()).toEqual([]); // past the first member: the cap may be passed
  });
});
