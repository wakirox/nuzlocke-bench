// Gen 1 (Red, Blue, Yellow) as a game adapter (src/games/adapter.ts). The work is done by this
// folder's modules — memory (ram.ts), maps (overworld.ts), data (data.ts), trainers, the PC
// boxes, hard level caps — each taking the version where Red/Blue and Yellow differ; this file
// binds them to one version.

import type { GameVersion } from "../../rom/types";
import type { GameAdapter, ScreenLayout } from "../adapter";
import { topUpItem } from "./bag";
import {
  BADGES, BOSSES, DEMO_PLAYER_NAME, HEAL_AMOUNTS, ITEM, LEAGUE_UNDERWAY_MAPS, PP_RESTORES, SPECIAL_TYPES, STATUS_HEALS, STATUS_NAMES,
  STATUS_POISON, effectiveness, expForLevel, hmsLearnable, isPokecenter,
} from "./data";
import { buryInLastBox } from "./graveyard";
import { MAX_LEVEL, candyCapInRom, levelCapInRom, setCandyCapInRom, setLevelCapInRom } from "./hard-caps";
import { MAP_CONSTANTS_RB, MAP_CONSTANTS_Y } from "./map-constants";
import { readFullMap, readView, trainerSprites } from "./overworld";
import { addressesFor, firstRivalBattleFought, fontSignature, ledIntoLab, poisonedParty, readBattleHp, readGameState, readPosition, readScreenText } from "./ram";
import { trainerParty } from "./trainers";

/**
 * Gen 1's screen, as the bridge reads it: the text box is the bottom six rows (borders on rows 12
 * and 17); the battle menu is FIGHT PKMN / ITEM RUN; the party screen's ▶ sits on each entry's HP
 * row (rows 1, 3, 5…); the move list's four moves are rows 13–16; the naming keyboard holds nine
 * letters a row (A–I, J–R, S–Z) and shows the name on row 2.
 */
const SCREEN: ScreenLayout = {
  textBox: { top: 12, bottom: 17 },
  battleMenu: {
    fight: { label: "FIGHT", at: [0, 0] },
    party: { label: "PKMN", at: [1, 0] },
    bag: { label: "ITEM", at: [0, 1] },
    run: { label: "RUN", at: [1, 1] },
  },
  startMenu: { party: "POKéMON", bag: "ITEM", dex: "POKéDEX", exit: "EXIT" },
  partyScreen: { rows: 12, slotAt: (row) => (row - 1) >> 1 },
  moveList: { rows: [12, 18], moves: [13, 17], marker: "TYPE/" },
  keyboard: { lettersPerRow: 9, nameRow: 2, confirm: ["start"] },
  dexEntry: { labels: ["HT", "WT"] },
  safariMenu: { labels: ["BALL", "BAIT"] },
  bagPockets: 1,
  balls: { poke: "POKé BALL", great: "GREAT BALL", ultra: "ULTRA BALL", master: "MASTER BALL" },
  fieldMoveRefused: /isn't anything|can't use|No SURFing/i,
  texts: {
    caught: /^(.* was )?caught!$/i,
    choosePokemon: /Choose a POK|Bring out which/,
    moveQuestion: /make room|Delete an older|forget|Abandon learning/i,
    notNow: /isn't the time/i,
    teachQuestion: /Teach|to a POK/i,
  },
};

const DATA: GameAdapter["data"] = {
  effectiveness,
  specialTypes: SPECIAL_TYPES,
  statusName: STATUS_NAMES,
  isPoisoned: (status) => (status & STATUS_POISON) !== 0,
  poisonFaintsWhileWalking: true,
  fixedDamage: (_id, power) => power === 1,
  expForLevel,
  maxLevel: MAX_LEVEL,
  badges: BADGES,
  bosses: BOSSES,
  items: {
    rareCandy: ITEM.RARE_CANDY,
    fullRestore: ITEM.FULL_RESTORE,
    healAmounts: HEAL_AMOUNTS,
    statusHeals: STATUS_HEALS,
    ppRestores: PP_RESTORES,
    revives: new Set<number>([ITEM.REVIVE, ITEM.MAX_REVIVE]),
    // The five ball items (ids 1–4 and 8).
    balls: new Set([0x01, 0x02, 0x03, 0x04, 0x08]),
  },
  isPokecenter,
  isHallOfFame: (mapConst) => mapConst === "HALL_OF_FAME",
  leagueUnderway: (mapConst) => LEAGUE_UNDERWAY_MAPS.includes(mapConst),
  isDemoBattle: (s) => s.playerName === DEMO_PLAYER_NAME,
  // wOptions bit 6: battle style SET.
  battleStyleSet: (s) => (s.options & 0x40) !== 0,
};

/** The Gen 1 adapter for one version. */
export function gen1Adapter(version: GameVersion): GameAdapter {
  const A = addressesFor(version);
  return {
    game: "gen1",
    version,

    readGameState: (mem) => readGameState(mem, version),
    position: (mem) => readPosition(mem, version),
    readBattleHp: (mem) => readBattleHp(mem, version),
    firstRivalBattleFought: (mem) => firstRivalBattleFought(mem, version),
    ledIntoLab: (mem) => ledIntoLab(mem, version),
    currentMap: (mem) => mem.read8(A.curMap),
    // Gen 1 never calls the RST vectors at $00-$3F (they hold RST $38, a runaway loop), nor runs code in RAM.
    crashedAt: (pc) => pc < 0x40 || (pc >= 0x8000 && pc < 0xff80),
    menuCursor: (mem) => mem.read8(A.currentMenuItem),
    mapSize: (mem) => ({ w: mem.read8(A.curMapWidth) * 2, h: mem.read8(A.curMapHeight) * 2 }),
    poisonedParty: (mem) => poisonedParty(mem, version),

    fontSignature: (rom) => fontSignature(rom, version),
    readScreenText,
    screen: SCREEN,

    isDark: (mem) => mem.read8(A.mapPalOffset) !== 0,
    readView: (mem, x, y, beaten, rom) => readView(mem, version, x, y, beaten, rom),
    readFullMap: (mem, rom, x, y, beaten) => readFullMap(mem, rom, version, x, y, beaten),
    trainerSprites: (mem, x, y) => trainerSprites(mem, version, x, y),
    // wMapSpriteExtraData: a trainer's class (+200) and its number in the class, per sprite.
    spriteTrainer: (mem, sprite) => ({
      trainerClass: mem.read8(A.mapSpriteExtra + (sprite - 1) * 2) - 200,
      number: mem.read8(A.mapSpriteExtra + (sprite - 1) * 2 + 1),
    }),
    trainerParty: (rom, cls, number) => trainerParty(rom, version, cls, number),
    mapConstants: version === "yellow" ? MAP_CONSTANTS_Y : MAP_CONSTANTS_RB,

    data: DATA,
    hmsLearnable: (rom, sp) => hmsLearnable(rom, version, sp),

    topUpItem: (mem, item) => topUpItem(mem, version, item),
    buryInLastBox: (gb, slot) => buryInLastBox(gb, version, slot),
    levelCapInRom,
    setLevelCapInRom,
    candyCapInRom,
    setCandyCapInRom,
  };
}

/** "Red", "Blue" or "Yellow" from the ROM header's title, or null for anything else. */
export function detectVersion(rom: Uint8Array): string | null {
  const title = String.fromCharCode(...rom.subarray(0x134, 0x143)).replace(/\0.*$/, "");
  if (title.startsWith("POKEMON RED")) return "Red";
  if (title.startsWith("POKEMON BLUE")) return "Blue";
  if (title.startsWith("POKEMON YELLOW")) return "Yellow";
  return null;
}
