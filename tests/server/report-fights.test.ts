// The report's big fights: the team a run brought to each rival, gym leader and Elite Four battle.

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { bigFights, bigFightsTable, teamChange } from "../../mcp-server/report.mjs";

const mon = (nickname: string, species: string, level: number, hp = 20) => ({ nickname, species, level, hp, maxHp: 20, moves: ["CLAW"] });
const fight = (trainerClass: number, trainer: string, team: (ReturnType<typeof mon> & { dead?: boolean })[], extra: object = {}) => ({
  trainerClass, trainer, number: 1, map: "SOMEWHERE", badges: 0, levelCap: 12, playTime: "0:30:00",
  foe: [{ species: "BOSSMON", level: 12 }], team, deadBefore: 0, ...extra,
});

describe("big fights", () => {
  it("keeps the rival, gym leader and Elite Four battles, not ordinary trainers", () => {
    const tracker = { trainerFights: [fight(0x19, "RIVAL", [mon("NOVA", "STARTER", 5)], { result: "won" }), fight(0x03, "WALKER", []), fight(0x22, "LEADER1", [], { result: "won" })], dead: [] };
    expect(bigFights(tracker).map((f: { trainer: string }) => f.trainer)).toEqual(["RIVAL", "LEADER1"]);
  });

  it("counts the fight a run ended in as lost, with the deaths since it began", () => {
    const tracker = { trainerFights: [fight(0x23, "LEADER2", [mon("NOVA", "STARTER", 21)], { deadBefore: 1 })], dead: [{ nickname: "OLD" }, { nickname: "NOVA" }], outcome: { kind: "wipe" } };
    expect(bigFights(tracker)[0]).toMatchObject({ result: "lost", died: ["NOVA"] });
  });

  it("says what changed in the team between two big fights", () => {
    const a = fight(0x22, "LEADER1", [mon("NOVA", "STARTER", 12), mon("BUZZ", "BUG", 9)]);
    const b = fight(0x23, "LEADER2", [mon("SPARK", "ZAP", 18), mon("NOVA", "STARTER", 20)]);
    expect(teamChange(null, a)).toBe("—");
    expect(teamChange(a, b)).toBe("+SPARK, −BUZZ, lead NOVA→SPARK, +8 levels");
    expect(teamChange(b, b)).toBe("same team");
  });

  it("counts a dead Pokémon still in the party as gone from the team, and shows it carried", () => {
    const a = fight(0x22, "LEADER1", [mon("NOVA", "STARTER", 12), mon("BUZZ", "BUG", 30)]);
    const b = fight(0x23, "LEADER2", [mon("NOVA", "STARTER", 14), { ...mon("BUZZ", "BUG", 30), dead: true }]);
    expect(teamChange(a, b)).toBe("−BUZZ, +2 levels");
    const table = bigFightsTable([{ name: "run-1", extras: { fights: [a, { ...b, result: "won", died: [] }] } }]);
    expect(table).toContain("| NOVA (STARTER) Lv14, BUZZ (BUG) Lv30 (dead) | 12 (top Lv14) |");
  });

  it("lists each fight once, even when a continued run's saves repeat the earlier ones", () => {
    const f = { ...fight(0x22, "LEADER1", [mon("NOVA", "STARTER", 12)]), result: "won", died: [] };
    const table = bigFightsTable([{ name: "run-1", extras: { fights: [f] } }, { name: "run-1-continued", extras: { fights: [f] } }]);
    expect(table.split("\n").filter((l: string) => l.includes("LEADER1"))).toHaveLength(1);
    expect(table).toContain("| run-1 | LEADER1 (SOMEWHERE) | 0 · 0:30:00 | BOSSMON Lv12 | NOVA (STARTER) Lv12 | 12 (top Lv12) | — | won | — |");
  });
});
