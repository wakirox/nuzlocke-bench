// Gen 1 (Pokémon Red) for the shared suites. Ids are the games' own (pret/pokered constants),
// maps come from the Gen 1 game adapter; the engine is the app's Tracker, given just the data
// these scenarios use.

import type { GameFixture, Place } from "../../harness/game-fixture";
import { gameFor } from "../../../src/games";
import type { GameAdapter } from "../../../src/games/adapter";
import type { GameVersion, SpeciesData, TrackerData } from "../../../src/rom/types";
import type { BattleMonState, GameState, MonState } from "../../../src/games/types";
import { ITEM } from "../../../src/games/gen1/data";
import { Tracker } from "../../../src/tracker/tracker";
import type { ChallengeMode, RunOptions } from "../../../src/rulesets";

// Internal species ids (as stored in RAM), pret constants/pokemon_constants.asm. The names
// here and below are made up: the tests only need ids and a family that evolves.
export const SPECIES = {
  STARTER: 0xb0,
  FAMILY_BASE: 0x24,
  FAMILY_EVOLVED: 0x96,
  WILD_A: 0xa5,
  WILD_B: 0x05,
} as const;

const place = (game: GameAdapter, mapConst: string): Place => {
  const map = game.mapConstants.indexOf(mapConst);
  if (map < 0) throw new Error(`No Gen 1 map ${mapConst}`);
  return { map, mapConst };
};

function species(id: number, dex: number, name: string, evolvesTo?: number): SpeciesData {
  return {
    id, dex, name, types: ["NORMAL"], base: { hp: 40, atk: 40, def: 40, spd: 40, spc: 40 }, bst: 200, curve: "MEDIUM_FAST",
    learnset: [], evolutions: evolvesTo ? [{ to: evolvesTo, method: "level", level: 18 }] : [],
  };
}

/** The game's boss levels: gyms in badge order, Elite Four, Champion. */
const RED_LEVEL_CAPS = { gyms: [14, 21, 24, 29, 43, 43, 47, 50], elite: [56, 58, 60, 62], champion: 65 };

export function trackerData(version: GameVersion): TrackerData {
  const list = [
    species(SPECIES.STARTER, 4, "STARTERMON"),
    species(SPECIES.FAMILY_BASE, 16, "BASEMON", SPECIES.FAMILY_EVOLVED),
    species(SPECIES.FAMILY_EVOLVED, 17, "EVOMON"),
    species(SPECIES.WILD_A, 19, "WILDMON"),
    species(SPECIES.WILD_B, 21, "OTHERMON"),
  ];
  const items: string[] = [];
  items[ITEM.POKE_BALL] = "ORB";
  items[ITEM.POTION] = "TONIC";
  return {
    version, romName: "test", species: Object.fromEntries(list.map((s) => [s.id, s])), moves: {}, items, mapNames: [],
    levelCaps: RED_LEVEL_CAPS,
  };
}

/** The app's Tracker for a Gen 1 ruleset, with this fixture's data. */
export function gen1Tracker(
  mode: ChallengeMode,
  version: GameVersion = "red",
  options: RunOptions = {},
): Tracker {
  return new Tracker(trackerData(version), mode, null, () => {}, options);
}

let uidSeq = 0;

export function gen1Fixture(version: GameVersion = "red"): GameFixture {
  const adapter = gameFor(version);
  const data = trackerData(version);
  const mon = (over: Partial<MonState> = {}): MonState => ({
    species: SPECIES.STARTER, uid: `uid${(++uidSeq).toString(16).padStart(6, "0")}`, nickname: "NOVA",
    level: 5, hp: 20, maxHp: 20, status: 0, moves: [0x0a, 0x2d, 0, 0], pp: [35, 40, 0, 0],
    stats: { atk: 10, def: 10, spd: 10, spc: 10 }, exp: 135, ...over,
  });
  const battleMon = (from: Partial<MonState>, over: Partial<BattleMonState> = {}): BattleMonState => ({
    ...mon(from), uid: "", exp: 0, stages: [0, 0, 0, 0, 0, 0], ...over,
  });
  const start = place(adapter, "PALLET_TOWN");
  return {
    id: `gen1-${version}`,
    name: `Pokémon ${version[0].toUpperCase()}${version.slice(1)} (Gen 1)`,
    adapter,
    nuzlockeEngine: (options = {}) => new Tracker(data, "nuzlocke", null, () => {}, options),
    ids: {
      ball: ITEM.POKE_BALL, potion: ITEM.POTION, starter: SPECIES.STARTER,
      family: [SPECIES.FAMILY_BASE, SPECIES.FAMILY_EVOLVED], wildA: SPECIES.WILD_A, wildB: SPECIES.WILD_B,
    },
    places: {
      start, route: place(adapter, "ROUTE_1"), route2: place(adapter, "ROUTE_2"),
      sameAreaFloors: [place(adapter, "MT_MOON_1F"), place(adapter, "MT_MOON_B1F")], hallOfFame: place(adapter, "HALL_OF_FAME"), leagueUnderway: place(adapter, "BRUNOS_ROOM"),
    },
    caps: { first: { level: 14, who: "Gym 1" }, second: { level: 21, who: "Gym 2" }, league: { level: 62, who: "Elite Four 4" }, firstBadge: 0b1 },
    speciesName: (id) => data.species[id]?.name ?? `#${id}`,
    mon,
    battleMon,
    state: (over: Partial<GameState> = {}): GameState => ({
      version, started: true, playerName: "PLAYER", map: start.map, mapConst: start.mapConst, x: 5, y: 6,
      badges: 0, money: 3000, playTime: { h: 0, m: 10, s: 0 }, party: [mon()], boxCount: 0, dexOwned: 1,
      bag: [{ id: ITEM.POKE_BALL, qty: 5 }, { id: ITEM.POTION, qty: 3 }],
      battle: 0, battleMon: null, activeIndex: 0, enemy: null, enemyTrainer: null, playerUsedMove: 0, enemyUsedMove: 0,
      grassMons: [], grassRate: 0, hofTeams: 0, options: 0x40, boxText: "",
      ...over,
    }),
  };
}
