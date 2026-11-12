// Gen 2 (Crystal) as a game adapter (src/games/adapter.ts). Memory in ram.ts, static data in
// data.ts, map ids in map-constants.ts.
//
// Maps, people and trainers in overworld.ts, hard caps in hard-caps.ts, the candy stack in bag.ts.
// Not done: burying in the PC (only older Gen 1 recordings use it).

import type { GameAdapter, ScreenLayout } from "../adapter";
import { readScreenText } from "../gen1/ram";
import { charFor } from "./text";
import {
  BADGES, BALLS, BOSSES, FIXED_DAMAGE_MOVES, HEAL_AMOUNTS, ITEM, LEAGUE_UNDERWAY_MAPS, PP_RESTORES, REVIVES, SPECIAL_TYPES, STATUS_HEALS,
  STATUS_POISON, effectiveness, hmsLearnable, isPokecenter, statusName,
} from "./data";
import { expForLevel } from "../gen1/data";
import { topUpItem } from "./bag";
import { MAX_LEVEL, candyCapInRom, levelCapInRom, setCandyCapInRom, setLevelCapInRom } from "./hard-caps";
import { MAP_CONSTANTS_CRYSTAL } from "./map-constants";
import { readFullMap, readView, spriteTrainer, trainerParty, trainerSprites } from "./overworld";
import {
  A, BATTLETYPE_TUTORIAL, currentMap, firstRivalBattleFought, fontSignature, isDark, ledIntoLab, mapSize, poisonedParty, readBattleHp,
  readGameState, readPosition,
} from "./ram";


/** Crystal's screen, as the bridge reads it. */
const SCREEN: ScreenLayout = {
  textBox: { top: 12, bottom: 17 },
  battleMenu: {
    fight: { label: "FIGHT", at: [0, 0] },
    party: { label: "PKMN", at: [1, 0] },
    bag: { label: "PACK", at: [0, 1] },
    run: { label: "RUN", at: [1, 1] },
  },
  startMenu: { party: "POKéMON", bag: "PACK", dex: "POKéDEX", exit: "EXIT" },
  partyScreen: { rows: 12, slotAt: (row) => (row - 1) >> 1 },
  moveList: { rows: [12, 18], moves: [13, 17], marker: "TYPE/" },
  keyboard: { lettersPerRow: 9, nameRow: 6, confirm: ["start", "a"] },
  dexEntry: { labels: ["HT", "WT"] },
  // No game reserve in Crystal: labels that never show.
  safariMenu: { labels: ["\u0000", "\u0000"] },
  bagPockets: 4,
  balls: { poke: "POKé BALL", great: "GREAT BALL", ultra: "ULTRA BALL", master: "MASTER BALL" },
  fieldMoveRefused: /isn't anything|can't use|nothing to/i,
  // pokecrystal data/text: "Gotcha! X / was caught!", "Which PKMN?" after a faint, "Stop learning X?".
  texts: {
    caught: /^((.* )?was )?caught!$/i,
    choosePokemon: /Choose a POK|Which PKMN/,
    moveQuestion: /make room|Delete an older|forget|Stop learning/i,
    notNow: /isn't the time/i,
    teachQuestion: /teach|to a POK/i,
  },
};

const DATA: GameAdapter["data"] = {
  effectiveness,
  specialTypes: SPECIAL_TYPES,
  statusName,
  isPoisoned: (status) => (status & STATUS_POISON) !== 0,
  // Out of battle Crystal's poison stops at 1 HP and wears off: no reason to stop a walk.
  poisonFaintsWhileWalking: false,
  fixedDamage: (id) => FIXED_DAMAGE_MOVES.has(id),
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
    revives: REVIVES,
    balls: BALLS,
  },
  isPokecenter,
  isHallOfFame: (mapConst) => mapConst === "HALL_OF_FAME",
  leagueUnderway: (mapConst) => LEAGUE_UNDERWAY_MAPS.includes(mapConst),
  isDemoBattle: (s) => s.battleType === BATTLETYPE_TUTORIAL,
  // wOptions bit 6: battle style SET.
  battleStyleSet: (s) => (s.options & 0x40) !== 0,
};

/** wBillsPC_CursorPosition: the PC box list's highlighted row (0-4), valid while that list is up. */
const BILLS_PC_CURSOR = 0xcb2b;

/**
 * The PC's box list (WITHDRAW, DEPOSIT, MOVE) marks its selection with a sprite, not a text ▶:
 * read as text it had no cursor, so the bridge saw "no text on screen" and couldn't pick a
 * Pokémon by name (run 7 took screenshots there). While that list is up (the box name panel over
 * it, "Choose a PKMN." below), the highlighted row gets a ▶ on its left border.
 */
function withPcCursor(mem: Parameters<typeof readScreenText>[0], lines: string[]): string[] {
  const listUp = lines.some((l) => l.includes("Choose a PKMN")) && lines[0]?.[8] === "┌" && lines[4]?.[8] === "│";
  if (!listUp) return lines;
  const row = 4 + 2 * mem.read8(BILLS_PC_CURSOR);
  const line = lines[row];
  if (row > 12 || !line || line[8] !== "│") return lines;
  return lines.map((l, i) => (i === row ? `${l.slice(0, 8)}▶${l.slice(9)}` : l));
}

const notYet = (what: string) => (): never => {
  throw new Error(`${what} isn't supported for Crystal yet.`);
};

export function gen2Adapter(): GameAdapter {
  return {
    game: "gen2",
    version: "crystal",

    readGameState,
    position: readPosition,
    readBattleHp,
    firstRivalBattleFought,
    ledIntoLab,
    currentMap,
    // Crystal calls three RST vectors all the time: FarCall ($08), Bankswitch ($10), JumpTable ($28).
    // $00 (NULL) and $38 (RST $38 on $FF filler) are a runaway, as is code in RAM.
    crashedAt: (pc) => pc < 0x08 || (pc >= 0x38 && pc < 0x40) || (pc >= 0x8000 && pc < 0xff80),
    menuCursor: (mem) => mem.read8(A.menuCursorY),
    // wCurPocket: items 0, balls 1, key items 2, TMs/HMs 3.
    bagPocket: (mem) => mem.read8(0xcf65) & 3,
    mapSize,
    poisonedParty,

    fontSignature,
    readScreenText: (mem, fontSig) => withPcCursor(mem, readScreenText(mem, fontSig, charFor)),
    screen: SCREEN,

    isDark,
    readView,
    readFullMap,
    trainerSprites,
    spriteTrainer: (mem, sprite) => spriteTrainer(mem, (mem as { romBytes?(): Uint8Array }).romBytes?.() ?? null, sprite),
    trainerParty,
    mapConstants: MAP_CONSTANTS_CRYSTAL,

    data: DATA,
    hmsLearnable,

    topUpItem,
    buryInLastBox: notYet("Burying in the PC"),
    levelCapInRom,
    setLevelCapInRom,
    candyCapInRom,
    setCandyCapInRom,
  };
}

/** For tests: the PC list cursor marking alone. */
export const withPcCursorForTest = withPcCursor;

/** "Crystal" from the ROM header's title, or null. */
export function detectVersion(rom: Uint8Array): string | null {
  const title = String.fromCharCode(...rom.subarray(0x134, 0x143)).replace(/\0.*$/, "");
  return title.startsWith("PM_CRYSTAL") ? "Crystal" : null;
}
