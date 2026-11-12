// The ruleset registry: what each ruleset is, its rules engine, and what a save from a ruleset
// this version doesn't have reads as.

import { describe, expect, it } from "vitest";
import { RULESETS, RULESET_IDS, isKnownRuleset } from "../../src/rulesets";
import { NuzlockeRules } from "../../src/tracker/rules/nuzlocke";
import { gen1Tracker } from "../games/gen1/fixture";

describe("rulesets", () => {
  it("has the Hardcore Nuzlocke, which counts for the benchmark", () => {
    expect(RULESET_IDS).toEqual(["nuzlocke"]);
    expect(RULESETS.nuzlocke).toMatchObject({ id: "nuzlocke", benchmark: true, rareCandies: true, endOnViolationByDefault: true });
  });

  it("gives each ruleset its own rules engine, with the run's options", () => {
    const t = gen1Tracker("nuzlocke", "red", { hardLevelCaps: true });
    expect(t.rules).toBeInstanceOf(NuzlockeRules);
    expect(t.rules).toMatchObject({ hardLevelCaps: true });
  });

  it("knows only its own ruleset ids (saves from removed rulesets aren't resumed)", () => {
    expect(isKnownRuleset("nuzlocke")).toBe(true);
    for (const id of ["removed-ruleset", "", undefined, null, 1, "toString", "__proto__"]) expect(isKnownRuleset(id)).toBe(false);
  });
});
