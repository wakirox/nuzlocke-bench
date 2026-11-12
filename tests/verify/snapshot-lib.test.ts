// The call -> poll mapping of scripts/snapshot-run.mjs.

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { callTarget, compareWithLog, firstMatch, parsePlayTime, parseWhere } from "../../scripts/snapshot-lib.mjs";

const sample = (o: object = {}) => ({ sec: 8342, mapConst: "ROUTE_10", x: 6, y: 25, battle: "none", released: true, ...o });

describe("snapshot call mapping", () => {
  it("reads where and the game time", () => {
    expect(parseWhere("ROUTE 10 [ROUTE_10] x6 y25 facing up | battle: none")).toMatchObject({ mapConst: "ROUTE_10", x: 6, y: 25, facing: "up", battle: "none" });
    expect(parseWhere("CAVE (2) [CAVE_1F] | battle: trainer")).toMatchObject({ mapConst: "CAVE_1F", x: null, battle: "trainer" });
    expect(parseWhere("nonsense")).toBeNull();
    expect(parsePlayTime("2:19:02")).toBe(8342);
  });

  it("picks the first poll with the call's second, map, position and battle, buttons let go", () => {
    const target = callTarget({ n: 910, where: "ROUTE 10 [ROUTE_10] x6 y25 facing up | battle: none", playTime: "2:19:02" });
    const polls = [
      sample({ sec: 8341 }),
      sample({ x: 5 }),
      sample({ released: false }),
      sample({ battle: "trainer" }),
      sample({ mapConst: "ROUTE_9" }),
      sample(),
      sample(),
    ];
    expect(firstMatch(target, polls)).toBe(5);
  });

  it("ignores x/y in the dark and finds a second alone", () => {
    const dark = callTarget({ n: 912, where: "CAVE (2) [CAVE_1F] | battle: none", playTime: "2:19:02" });
    expect(firstMatch(dark, [sample(), sample({ mapConst: "CAVE_1F", x: 9, y: 9 })])).toBe(1);
    expect(firstMatch({ sec: 8342 }, [sample({ sec: 8341 }), sample({ mapConst: "X" })])).toBe(1);
    expect(firstMatch(dark, [sample({ sec: 1 })])).toBe(-1);
  });

  it("compares the log's counters with what was found", () => {
    const rows = compareWithLog({ where: "A [B] | battle: none", playTime: "0:00:01", badges: 3 }, { playTime: "0:00:01", mapConst: "B", battle: "none", badges: 2 });
    expect(rows.filter((r: { ok: boolean }) => !r.ok).map((r: { label: string }) => r.label)).toEqual(["badges"]);
  });
});
