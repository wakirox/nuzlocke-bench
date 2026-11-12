// Reads Crystal's game state out of emulator memory. Addresses from pret's pokecrystal.sym
// (symbols branch). Most of the state sits in work-RAM bank 1 ($D000-$DFFF), which the game
// banks out now and then (palettes, decompression): those reads go to bank 1 directly when the
// emulator offers it (MemoryReader.readWram).

import type { BattleMonState, BattlerHp, GameState, MemoryReader, MonState, Position } from "../types";
import { charFor, decodeText } from "./text";
import { MAP_CONSTANTS_CRYSTAL } from "./map-constants";
import { currentBoxCount, readPcMons } from "./boxes";

export const A = {
  // Bank 0 ($C000-$CFFF).
  tilemap: 0xc4a0, battleMonNick: 0xc621, battleMon: 0xc62c, enemyMonNick: 0xc616,
  playerStatLevels: 0xc6cc, enemyStatLevels: 0xc6d4, curPlayerMove: 0xc6e3, curEnemyMove: 0xc6e4,
  menuCursorY: 0xcfa9, joypadDisable: 0xcfbe, options: 0xcfcc,
  // Bank 1 ($D000-$DFFF).
  curBattleMon: 0xd0d4,
  mapHeight: 0xd19e, mapWidth: 0xd19f, mapTileset: 0xd199,
  enemyMon: 0xd206, battleMode: 0xd22d, otherTrainerClass: 0xd22f, battleType: 0xd230, otherTrainerId: 0xd231,
  timeOfDay: 0xd269, morningRate: 0xd25a,
  otPartyCount: 0xd280, otPartyMons: 0xd288,
  scriptRunning: 0xd438, playerName: 0xd47d,
  gameTimeHours: 0xd4c4, gameTimeMinutes: 0xd4c6, gameTimeSeconds: 0xd4c7,
  playerDirection: 0xd4de, timeOfDayPalset: 0xd847, statusFlags: 0xd84c,
  money: 0xd84e, johtoBadges: 0xd857,
  numItems: 0xd892, items: 0xd893, numKeyItems: 0xd8bc, keyItems: 0xd8bd, numBalls: 0xd8d7, balls: 0xd8d8,
  hallOfFameCount: 0xd95e, curBox: 0xdb72, eventFlags: 0xda72, cherrygroveScene: 0xd98a, mrPokemonsHouseScene: 0xd98b,
  mapGroup: 0xdcb5, mapNumber: 0xdcb6, yCoord: 0xdcb7, xCoord: 0xdcb8,
  partyCount: 0xdcd7, partyMons: 0xdcdf, partyNicks: 0xde41, pokedexCaught: 0xde99,
};

const PARTY_MON_SIZE = 48;
const NAME_LENGTH = 11;
const MAX_ITEMS = 20;
const MAX_KEY_ITEMS = 25;
const MAX_BALLS = 12;

/** EVENT_GOT_A_POKEMON_FROM_ELM (constants/event_flags.asm): the opening scene in the lab is done. */
const EVENT_GOT_A_POKEMON_FROM_ELM = 0x1a;
/** Cherrygrove's scene after the rival battle there (SCENE_CHERRYGROVECITY_NOOP is 0, the battle 1). */
const SCENE_CHERRYGROVE_RIVAL = 1;
/** wTimeOfDayPalset in a dark cave without Flash (DARKNESS_PALSET). */
const DARKNESS_PALSET = 0xff;
/** wBattleType: the catching demonstration (BATTLETYPE_TUTORIAL). */
export const BATTLETYPE_TUTORIAL = 3;

/** One byte: bank 1 for $D000-$DFFF (whichever bank is switched in), else as the CPU sees it. */
export function rd(mem: MemoryReader, addr: number): number {
  return addr >= 0xd000 && addr < 0xe000 && mem.readWram ? mem.readWram(1, addr) : mem.read8(addr);
}
function rdBytes(mem: MemoryReader, addr: number, len: number): Uint8Array {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = rd(mem, addr + i);
  return out;
}
const rd16 = (mem: MemoryReader, addr: number) => (rd(mem, addr) << 8) | rd(mem, addr + 1);
/** A little-endian word (pointers, event flag numbers). */
export const rd16le = (mem: MemoryReader, addr: number) => rd(mem, addr) | (rd(mem, addr + 1) << 8);

const hex = (bytes: number[]) => bytes.map((x) => x.toString(16).padStart(2, "0")).join("");

/** Map id: group << 8 | number. */
export const currentMap = (mem: MemoryReader) => (rd(mem, A.mapGroup) << 8) | rd(mem, A.mapNumber);
export const mapSize = (mem: MemoryReader) => ({ w: rd(mem, A.mapWidth) * 2, h: rd(mem, A.mapHeight) * 2 });

export function eventSet(mem: MemoryReader, event: number): boolean {
  return (rd(mem, A.eventFlags + (event >> 3)) & (1 << (event & 7))) !== 0;
}

export const ledIntoLab = (mem: MemoryReader) => eventSet(mem, EVENT_GOT_A_POKEMON_FROM_ELM);
/**
 * The first rival battle (Cherrygrove) is over, won or lost. Mr. Pokémon's script ends by setting
 * his house's scene to NOOP (1) and, in the same frame, Cherrygrove's to MEET_RIVAL (1); the
 * rival's script puts Cherrygrove back to NOOP (0). (The egg's event flag comes earlier in that
 * script, before the rival waits: a run on 2026-11-11 read "fought" in the house from it.)
 */
export const firstRivalBattleFought = (mem: MemoryReader) =>
  rd(mem, A.mrPokemonsHouseScene) === SCENE_MRPOKEMONSHOUSE_NOOP && rd(mem, A.cherrygroveScene) !== SCENE_CHERRYGROVE_RIVAL;
const SCENE_MRPOKEMONSHOUSE_NOOP = 1;

export const isDark = (mem: MemoryReader) => rd(mem, A.timeOfDayPalset) === DARKNESS_PALSET;

/** Party mon struct (48 bytes): species, item, moves, OT id, exp, stat exp, DVs, PP, … level, status, HP, stats. */
function readPartyMon(mem: MemoryReader, base: number, nickAddr: number): MonState {
  const b = rdBytes(mem, base, PARTY_MON_SIZE);
  const w = (o: number) => (b[o] << 8) | b[o + 1];
  return {
    species: b[0],
    uid: hex([b[6], b[7], b[21], b[22]]),
    nickname: decodeText(rdBytes(mem, nickAddr, NAME_LENGTH)),
    moves: [b[2], b[3], b[4], b[5]],
    exp: (b[8] << 16) | (b[9] << 8) | b[10],
    pp: [b[23] & 0x3f, b[24] & 0x3f, b[25] & 0x3f, b[26] & 0x3f],
    level: b[31],
    status: b[32],
    hp: w(34),
    maxHp: w(36),
    stats: { atk: w(38), def: w(40), spd: w(42), spc: w(44), spdef: w(46) },
  };
}

/**
 * Battle struct (32 bytes): species, item, moves, DVs, PP, happiness, level, status, unused,
 * HP, max HP, atk, def, spd, sp.atk, sp.def, types. Stat levels: atk, def, spd, sp.atk,
 * sp.def, acc, eva (7 = neutral); the stages come out as atk, def, spd, spc (sp.atk), acc, eva, sp.def.
 */
function readBattleMon(mem: MemoryReader, base: number, nickAddr: number, statLevels: number): BattleMonState {
  const b = rdBytes(mem, base, 32);
  const w = (o: number) => (b[o] << 8) | b[o + 1];
  const l = Array.from(rdBytes(mem, statLevels, 7), (m) => m - 7);
  return {
    species: b[0],
    uid: "",
    nickname: decodeText(rdBytes(mem, nickAddr, NAME_LENGTH)),
    moves: [b[2], b[3], b[4], b[5]],
    pp: [b[8] & 0x3f, b[9] & 0x3f, b[10] & 0x3f, b[11] & 0x3f],
    level: b[13],
    status: b[14],
    hp: w(16),
    maxHp: w(18),
    stats: { atk: w(20), def: w(22), spd: w(24), spc: w(26), spdef: w(28) },
    exp: 0,
    stages: [l[0], l[1], l[2], l[3], l[5], l[6], l[4]],
  };
}

const inBattle = (mem: MemoryReader) => {
  const party = rd(mem, A.partyCount);
  return party >= 1 && party <= 6 && rd(mem, A.battleMode) !== 0;
};

export function readBattleHp(mem: MemoryReader): { you: BattlerHp; foe: BattlerHp } | null {
  if (!inBattle(mem)) return null;
  const one = (base: number, nick: number): BattlerHp => ({
    name: decodeText(rdBytes(mem, nick, NAME_LENGTH)), species: rd(mem, base), hp: rd16(mem, base + 16), maxHp: rd16(mem, base + 18),
  });
  return { you: one(A.battleMon, A.battleMonNick), foe: one(A.enemyMon, A.enemyMonNick) };
}

export function readPosition(mem: MemoryReader): Position {
  const party = rd(mem, A.partyCount);
  const battle = inBattle(mem);
  const { w, h } = mapSize(mem);
  const x = rd(mem, A.xCoord);
  const y = rd(mem, A.yCoord);
  return {
    x, y, map: currentMap(mem), battle,
    scripted: !battle && (rd(mem, A.scriptRunning) !== 0 || rd(mem, A.joypadDisable) !== 0),
    inWorld: (party >= 1 && party <= 6) || (w > 0 && h > 0 && x < w && y < h),
  };
}

export function poisonedParty(mem: MemoryReader): Map<string, { slot: number; hp: number; maxHp: number }> {
  const out = new Map<string, { slot: number; hp: number; maxHp: number }>();
  const n = Math.min(rd(mem, A.partyCount), 6);
  for (let i = 0; i < n; i++) {
    const m = A.partyMons + i * PARTY_MON_SIZE;
    if (!(rd(mem, m + 32) & 0x08)) continue;
    const uid = hex([rd(mem, m + 6), rd(mem, m + 7), rd(mem, m + 21), rd(mem, m + 22)]);
    out.set(uid, { slot: i, hp: rd16(mem, m + 34), maxHp: rd16(mem, m + 36) });
  }
  return out;
}

/** A pocket of (id, quantity) pairs, or of ids alone (key items). */
function pocket(mem: MemoryReader, countAddr: number, listAddr: number, max: number, withQty: boolean) {
  const n = Math.min(rd(mem, countAddr), max);
  const out: { id: number; qty: number }[] = [];
  for (let i = 0; i < n; i++) {
    out.push(withQty ? { id: rd(mem, listAddr + i * 2), qty: rd(mem, listAddr + i * 2 + 1) } : { id: rd(mem, listAddr + i), qty: 1 });
  }
  return out;
}

// Wild grass tables (ROM bank $0A): JohtoGrassWildMons, then KantoGrassWildMons. Each entry: map
// group, map number, three encounter rates (morning, day, night), then 7 (level, species) for
// each time of day; a group of $FF ends a table.
const GRASS_TABLES = [0x0a * 0x4000 + (0x65e9 - 0x4000), 0x0a * 0x4000 + (0x7274 - 0x4000)];
const GRASS_ENTRY = 2 + 3 + 3 * 7 * 2;

/** The current map's grass/cave encounters for the time of day, and their rate, read from the ROM. */
export function grassEncounters(rom: Uint8Array, group: number, number: number, timeOfDay: number) {
  const tod = Math.min(timeOfDay, 2); // morning 0, day 1, night 2 (darkness counts as night)
  for (const start of GRASS_TABLES) {
    for (let p = start; rom[p] !== 0xff && p < rom.length; p += GRASS_ENTRY) {
      if (rom[p] !== group || rom[p + 1] !== number) continue;
      const mons = [];
      for (let i = 0; i < 7; i++) {
        const o = p + 5 + tod * 14 + i * 2;
        mons.push({ level: rom[o], species: rom[o + 1] });
      }
      return { rate: rom[p + 2 + tod], mons };
    }
  }
  return { rate: 0, mons: [] };
}

export function readGameState(mem: MemoryReader & { romBytes?(): Uint8Array }): GameState {
  const partyCount = rd(mem, A.partyCount);
  const validParty = partyCount >= 1 && partyCount <= 6;
  const party: MonState[] = [];
  if (validParty) {
    for (let i = 0; i < partyCount; i++) party.push(readPartyMon(mem, A.partyMons + i * PARTY_MON_SIZE, A.partyNicks + i * NAME_LENGTH));
  }

  const bag = [
    ...pocket(mem, A.numItems, A.items, MAX_ITEMS, true),
    ...pocket(mem, A.numBalls, A.balls, MAX_BALLS, true),
    ...pocket(mem, A.numKeyItems, A.keyItems, MAX_KEY_ITEMS, false),
  ];

  const mode = validParty ? rd(mem, A.battleMode) : 0;
  // Lost = every party Pokémon is down. (wBattleResult isn't it: the faint routine writes LOSE there
  // whenever the battler faints, with others still able to fight; a test run ended as a wipe on it.)
  const allDown = party.length > 0 && party.every((m) => m.hp === 0);
  const battle: GameState["battle"] = mode === 0 ? 0 : allDown ? -1 : mode === 2 ? 2 : 1;
  let enemyTrainer: GameState["enemyTrainer"] = null;
  if (battle === 2) {
    const n = Math.min(rd(mem, A.otPartyCount), 6);
    const mons = [];
    for (let i = 0; i < n; i++) {
      const base = A.otPartyMons + i * PARTY_MON_SIZE;
      mons.push({ species: rd(mem, base), level: rd(mem, base + 31), hp: rd16(mem, base + 34) });
    }
    enemyTrainer = { trainerClass: rd(mem, A.otherTrainerClass), number: rd(mem, A.otherTrainerId), party: mons };
  }

  const group = rd(mem, A.mapGroup);
  const number = rd(mem, A.mapNumber);
  const map = (group << 8) | number;
  const rom = mem.romBytes?.();
  const wild = rom ? grassEncounters(rom, group, number, rd(mem, A.timeOfDay)) : { rate: 0, mons: [] };

  let dexOwned = 0;
  for (const byte of rdBytes(mem, A.pokedexCaught, 32)) for (let bit = 0; bit < 8; bit++) if (byte & (1 << bit)) dexOwned++;

  const money = rdBytes(mem, A.money, 3);
  // The current PC box (cartridge RAM): a catch with a full party goes there.
  const extRam = validParty ? mem.getExtRam?.() ?? null : null;

  return {
    version: "crystal",
    started: validParty,
    firstRivalFought: firstRivalBattleFought(mem),
    playerName: decodeText(rdBytes(mem, A.playerName, NAME_LENGTH)),
    map,
    mapConst: MAP_CONSTANTS_CRYSTAL[map] || `MAP_${map.toString(16)}`,
    x: rd(mem, A.xCoord),
    y: rd(mem, A.yCoord),
    // wPlayerDirection: down 0, up 4, left 8, right $C.
    facing: (["down", "up", "left", "right"] as const)[(rd(mem, A.playerDirection) >> 2) & 3],
    dark: isDark(mem),
    mapSize: mapSize(mem),
    badges: rd(mem, A.johtoBadges),
    money: (money[0] << 16) | (money[1] << 8) | money[2],
    playTime: { h: rd16(mem, A.gameTimeHours), m: rd(mem, A.gameTimeMinutes), s: rd(mem, A.gameTimeSeconds) },
    party,
    boxCount: currentBoxCount(extRam),
    dexOwned,
    bag,
    battle,
    battleMon: battle > 0 ? readBattleMon(mem, A.battleMon, A.battleMonNick, A.playerStatLevels) : null,
    activeIndex: battle > 0 ? rd(mem, A.curBattleMon) : 0,
    enemy: battle > 0 ? readBattleMon(mem, A.enemyMon, A.enemyMonNick, A.enemyStatLevels) : null,
    enemyTrainer,
    playerUsedMove: rd(mem, A.curPlayerMove),
    enemyUsedMove: rd(mem, A.curEnemyMove),
    grassMons: wild.mons,
    grassRate: wild.rate,
    hofTeams: rd(mem, A.hallOfFameCount),
    options: rd(mem, A.options),
    boxText: readBoxText(mem),
    battleType: rd(mem, A.battleType),
    pcMons: () => {
      const ram = mem.getExtRam?.();
      return ram ? readPcMons(ram, rd(mem, A.curBox)) : [];
    },
  };
}

/** The two text lines of the bottom text box from the game's tile buffer (rows 14 and 16), or "". */
function readBoxText(mem: MemoryReader): string {
  const box = mem.readBytes(A.tilemap + 12 * 20, 6 * 20);
  if (box[0] !== 0x79) return "";
  const line = (row: number) => {
    let s = "";
    for (let c = 1; c < 19; c++) {
      const ch = charFor(box[(row - 12) * 20 + c]);
      s += ch.length ? ch : " ";
    }
    return s.trim();
  };
  return `${line(14)} ${line(16)}`.trim();
}

// The font (Font, bank $3E) is 1bpp: the game copies each byte into both bitplanes of tiles $80+.
const FONT_ROM_OFFSET = 0x3e * 0x4000 + (0x4200 - 0x4000);

/** VRAM bytes tiles $80-$81 ("A", "B") hold while the text font is loaded. */
export function fontSignature(rom: Uint8Array): Uint8Array {
  const sig = new Uint8Array(32);
  for (let i = 0; i < 16; i++) sig[2 * i] = sig[2 * i + 1] = rom[FONT_ROM_OFFSET + i];
  return sig;
}
