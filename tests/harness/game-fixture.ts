// The contract a game implements to plug into the shared test suites.
//
// The rules suites (tests/rules/*.suite.ts) never use a game's raw ids or RAM layout: they
// play scenarios through a GameFixture, which knows that game's species, items, maps and
// level caps and builds GameStates for it. Adding a game = its game adapter (src/games/<game>/,
// which the app runs it through) plus one fixture built on it (see tests/games/gen1/fixture.ts),
// listed in tests/games/index.ts; every suite then runs against it unchanged.

import type { GameAdapter } from "../../src/games/adapter";
import type { GameState, MonState, BattleMonState } from "../../src/games/types";
import type { Tracker } from "../../src/tracker/tracker";
import type { RunOptions } from "../../src/rulesets";

/** A map, as the game identifies it. */
export interface Place {
  map: number;
  mapConst: string;
}

/**
 * The rules engine the suites drive: the app's Tracker. Every game shares it (it takes a game's
 * items, maps and data from the game's adapter), so a game's fixture hands out a Tracker made
 * with that game's data.
 */
export type RulesEngine = Tracker;

export interface GameFixture {
  /** Short id used in test names, e.g. "gen1-red". */
  id: string;
  /** Human name, e.g. "Pokémon Red (Gen 1)". */
  name: string;
  /** The game's adapter: the fixture's places are its maps, and the engine judges by its data. */
  adapter: GameAdapter;

  /** A fresh Hardcore Nuzlocke rules engine for this game, with optional rules. */
  nuzlockeEngine(options?: RunOptions): RulesEngine;

  /** This game's ids for the things scenarios talk about. */
  ids: {
    /** A ball item (throwing one doesn't count as "an item in battle"). */
    ball: number;
    /** A healing item (does). */
    potion: number;
    /** Species the run starts with. */
    starter: number;
    /** A two-stage family [base, evolution] for the dupes clause. */
    family: [number, number];
    /** Wild species unrelated to the starter, the family or each other. */
    wildA: number;
    wildB: number;
  };

  places: {
    /** Where the run starts (not a catch area). */
    start: Place;
    /** Two different routes with wild Pokémon. */
    route: Place;
    route2: Place;
    /** Two maps that count as one Nuzlocke area (floors of one cave, say). */
    sameAreaFloors: [Place, Place];
    /** Entering this map means the game is won. */
    hallOfFame: Place;
    /** A map that means the League's battles have begun. */
    leagueUnderway: Place;
  };

  /** Level caps as the game's rules define them, for the badge states the suite checks. */
  caps: {
    /** No badges yet. */
    first: { level: number; who: string };
    /** First badge won. */
    second: { level: number; who: string };
    /** Every badge won: the League's cap under the usual rule (the last Elite Four member's top level). */
    league: { level: number; who: string };
    /** Badge field value meaning "first badge won". */
    firstBadge: number;
  };

  /** Name the game gives a species (an un-nicknamed Pokémon carries this). */
  speciesName(species: number): string;

  /** A neutral overworld state: run started, standing at places.start, party = [starter], Poké Balls in the bag. */
  state(over?: Partial<GameState>): GameState;
  /** A party Pokémon (unique uid each call unless given). */
  mon(over?: Partial<MonState>): MonState;
  /** The in-battle copy of a Pokémon (battle structs carry no uid). */
  battleMon(from: Partial<MonState>, over?: Partial<BattleMonState>): BattleMonState;
}
