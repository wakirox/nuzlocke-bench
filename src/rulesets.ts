// The rulesets, in one place: what each one is, what it offers at setup, whether it counts for
// the benchmark, and its rules engine. The app, the bridge and the tracker ask the ruleset
// instead of testing for a particular one, so another ruleset plugs in here (plus its rules
// engine in tracker/rules/ and its rules page in index.html).

import { NuzlockeRules } from "./tracker/rules/nuzlocke";
import type { RuleModule } from "./tracker/rules/types";
import type { Tracker } from "./tracker/tracker";

/** A ruleset's id (stored with each run, its history and its recordings). */
export type ChallengeMode = "nuzlocke";

export interface Ruleset {
  id: ChallengeMode;
  label: string;
  /** Results count for the benchmark (comparable across runs). */
  benchmark: boolean;
  /** The bottomless Rare Candies option. */
  rareCandies: boolean;
  /** Optional rules this ruleset offers. */
  options: { hardLevelCaps: boolean; firstRivalFree: boolean };
  /** Whether a violation ends the run unless the player turns that off. */
  endOnViolationByDefault: boolean;
  /** Its rules engine. */
  rules(t: Tracker, options: RunOptions): RuleModule;
}

/** Optional rules chosen for a run. */
export interface RunOptions {
  /** Hardcore Nuzlocke: a Pokémon at the cap gains no more levels (the game's own code stops it: the game adapter's hard caps). */
  hardLevelCaps?: boolean;
  /** Hardcore Nuzlocke: the first rival battle doesn't count — a Pokémon that faints in it isn't dead (the usual exception). */
  firstRivalFree?: boolean;
  /** The first violation ends the run (outcome "disqualified"). */
  endOnViolation?: boolean;
  /** Rule ids whose violations are only logged, never disqualifying (for tuning the harness). */
  lenientRules?: string[];
  /** Short run: winning this many badges wins the run (1–8). Missing = becoming Champion. */
  goalBadges?: number;
}

/** What wins a run with these options, in words. */
export function goalText(options: RunOptions): string {
  const n = options.goalBadges;
  return n ? `win ${n === 1 ? "the first badge" : `${n} badges`}` : "become Champion";
}

export const RULESETS: Record<ChallengeMode, Ruleset> = {
  nuzlocke: {
    id: "nuzlocke", label: "Hardcore Nuzlocke", benchmark: true, rareCandies: true,
    options: { hardLevelCaps: true, firstRivalFree: true }, endOnViolationByDefault: true,
    rules: (t, options) => new NuzlockeRules(t, !!options.hardLevelCaps),
  },
};

/** The ruleset ids this version knows. Saves from rulesets that were removed carry other ids. */
export const RULESET_IDS = Object.keys(RULESETS) as ChallengeMode[];

/** Whether a stored ruleset id (a saved run's, a recording's) is one this version can play. */
export function isKnownRuleset(id: unknown): id is ChallengeMode {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(RULESETS, id);
}
