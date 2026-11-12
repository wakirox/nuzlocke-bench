// Reads Gen 1 game state out of emulator memory.
// Addresses come from pret's pokered/pokeyellow symbol files (symbols branch).
// Yellow's WRAM layout is shifted by one byte in most places.

import type { GameVersion } from "../../rom/types";
import type { BattleMonState, BattlerHp, GameState, MemoryReader, MonState, Position } from "../types";
import { readPcMons } from "./boxes";
import { decodeText, charFor } from "./data";
import { MAP_CONSTANTS_RB, MAP_CONSTANTS_Y } from "./map-constants";

const RB = {
  partyCount: 0xd163, partySpecies: 0xd164, partyMons: 0xd16b, partyNicks: 0xd2b5,
  battleMon: 0xd014, battleMonNick: 0xd009, enemyMon: 0xcfe5, enemyMonNick: 0xcfda,
  isInBattle: 0xd057, battleType: 0xd05a, curOpponent: 0xd059, joyIgnore: 0xcd6b, trainerClass: 0xd031, trainerNo: 0xd05d,
  enemyPartyCount: 0xd89c, enemyPartySpecies: 0xd89d, enemyMons: 0xd8a4,
  playerStatMods: 0xcd1a, enemyStatMods: 0xcd2e, playerUsedMove: 0xccf1, enemyUsedMove: 0xccf2,
  playerMonNumber: 0xcc2f,
  numBagItems: 0xd31d, bagItems: 0xd31e, money: 0xd347, badges: 0xd356, curMap: 0xd35e, mapPalOffset: 0xd35d,
  yCoord: 0xd361, xCoord: 0xd362, playerName: 0xd158, rivalName: 0xd34a,
  playTimeHours: 0xda41, playTimeMinutes: 0xda43, playTimeSeconds: 0xda44,
  grassRate: 0xd887, grassMons: 0xd888, boxCount: 0xda80, numHoFTeams: 0xd5a2,
  pokedexOwned: 0xd2f7, tileMap: 0xc3a0,
  spriteData1: 0xc100, numWarps: 0xd3ae, warpEntries: 0xd3af, collisionPtr: 0xd530, talkingOver: 0xd532, grassTile: 0xd535,
  curMapHeight: 0xd368, curMapWidth: 0xd369,
  curEnemyLevel: 0xd127, curMapTileset: 0xd367, options: 0xd355,
  tilesetBank: 0xd52b, tilesetBlocksPtr: 0xd52c, mapConnections: 0xd370,
  spriteData2: 0xc200, mapSpriteExtra: 0xd504, mapSpriteData: 0xd4e4, mapTextPtr: 0xd36c, ballSprite: 0x3d, fossilSprite: 0x3e, boulderSprite: 0x3f, readSprites: [0x40, 0x41, 0x42] /* paper, desk encyclopedia, clipboard */, numSigns: 0xd4b0,
  curBoxNum: 0xd5a0, lastMap: 0xd365, walkBikeSurf: 0xd700, eventFlags: 0xd747,
  toggleableFlags: 0xd5a6, toggleableList: 0xd5ce,
  currentMenuItem: 0xcc26,
};
const Y: typeof RB = {
  partyCount: 0xd162, partySpecies: 0xd163, partyMons: 0xd16a, partyNicks: 0xd2b4,
  battleMon: 0xd013, battleMonNick: 0xd008, enemyMon: 0xcfe4, enemyMonNick: 0xcfd9,
  isInBattle: 0xd056, battleType: 0xd059, curOpponent: 0xd058, joyIgnore: 0xcd6a, trainerClass: 0xd030, trainerNo: 0xd05c,
  enemyPartyCount: 0xd89b, enemyPartySpecies: 0xd89c, enemyMons: 0xd8a3,
  playerStatMods: 0xcd1a, enemyStatMods: 0xcd2e, playerUsedMove: 0xccf1, enemyUsedMove: 0xccf2,
  playerMonNumber: 0xcc2f,
  numBagItems: 0xd31c, bagItems: 0xd31d, money: 0xd346, badges: 0xd355, curMap: 0xd35d, mapPalOffset: 0xd35c,
  yCoord: 0xd360, xCoord: 0xd361, playerName: 0xd157, rivalName: 0xd349,
  playTimeHours: 0xda40, playTimeMinutes: 0xda42, playTimeSeconds: 0xda43,
  grassRate: 0xd886, grassMons: 0xd887, boxCount: 0xda7f, numHoFTeams: 0xd5a1,
  pokedexOwned: 0xd2f6, tileMap: 0xc3a0,
  spriteData1: 0xc100, numWarps: 0xd3ad, warpEntries: 0xd3ae, collisionPtr: 0xd52f, talkingOver: 0xd531, grassTile: 0xd534,
  curMapHeight: 0xd367, curMapWidth: 0xd368,
  curEnemyLevel: 0xd126, curMapTileset: 0xd366, options: 0xd354,
  tilesetBank: 0xd52a, tilesetBlocksPtr: 0xd52b, mapConnections: 0xd36f,
  spriteData2: 0xc200, mapSpriteExtra: 0xd503, mapSpriteData: 0xd4e3, mapTextPtr: 0xd36b, ballSprite: 0x47, fossilSprite: 0x48, boulderSprite: 0x49 /* pokeyellow SPRITE_BOULDER, two after the ball as in Red */, readSprites: [0x4a, 0x4b, 0x4c] /* the same three after it */, numSigns: 0xd4af,
  curBoxNum: 0xd59f, lastMap: 0xd364, walkBikeSurf: 0xd6ff, eventFlags: 0xd746,
  toggleableFlags: 0xd5a5, toggleableList: 0xd5cd,
  currentMenuItem: 0xcc26,
};

const PARTY_MON_SIZE = 44;
const NAME_LENGTH = 11;

/** pret's EVENT_BATTLED_RIVAL_IN_OAKS_LAB (event 0x23 of wEventFlags): the first rival battle has been fought (won or lost). */
const EVENT_FIRST_RIVAL_BATTLE = 0x23;

/** Event 0x00 of wEventFlags: the professor has led the player into his lab (read from saved games: 0 before, 1 after). */
export function ledIntoLab(mem: MemoryReader, version: GameVersion): boolean {
  return (mem.read8(addressesFor(version).eventFlags) & 1) !== 0;
}

export function firstRivalBattleFought(mem: MemoryReader, version: GameVersion): boolean {
  const byte = mem.read8(addressesFor(version).eventFlags + (EVENT_FIRST_RIVAL_BATTLE >> 3));
  return (byte & (1 << (EVENT_FIRST_RIVAL_BATTLE & 7))) !== 0;
}

export function addressesFor(version: GameVersion) {
  return version === "yellow" ? Y : RB;
}

function readPartyMon(mem: MemoryReader, base: number, nickAddr: number): MonState {
  const b = mem.readBytes(base, PARTY_MON_SIZE);
  const w = (o: number) => (b[o] << 8) | b[o + 1];
  return {
    species: b[0],
    uid: [b[12], b[13], b[27], b[28]].map((x) => x.toString(16).padStart(2, "0")).join(""),
    nickname: decodeText(mem.readBytes(nickAddr, NAME_LENGTH)),
    hp: w(1),
    status: b[4],
    moves: [b[8], b[9], b[10], b[11]],
    exp: (b[14] << 16) | (b[15] << 8) | b[16],
    pp: [b[29] & 0x3f, b[30] & 0x3f, b[31] & 0x3f, b[32] & 0x3f],
    level: b[33],
    maxHp: w(34),
    stats: { atk: w(36), def: w(38), spd: w(40), spc: w(42) },
  };
}

// Battle struct: species, hp(2), partypos, status, type1, type2, catch, moves(4),
// dvs(2), level, maxhp(2), atk(2), def(2), spd(2), spc(2), pp(4)
function readBattleMon(mem: MemoryReader, base: number, nickAddr: number, statModsAddr: number): BattleMonState {
  const b = mem.readBytes(base, 29);
  const w = (o: number) => (b[o] << 8) | b[o + 1];
  const mods = mem.readBytes(statModsAddr, 6);
  return {
    species: b[0],
    uid: "",
    nickname: decodeText(mem.readBytes(nickAddr, NAME_LENGTH)),
    hp: w(1),
    status: b[4],
    moves: [b[8], b[9], b[10], b[11]],
    level: b[14],
    maxHp: w(15),
    stats: { atk: w(17), def: w(19), spd: w(21), spc: w(23) },
    pp: [b[25] & 0x3f, b[26] & 0x3f, b[27] & 0x3f, b[28] & 0x3f],
    exp: 0,
    stages: Array.from(mods, (m) => m - 7),
  };
}

/** Both battlers' names and HP, read between battle messages to say what each hit did. */
export function readBattleHp(mem: MemoryReader, version: GameVersion): { you: BattlerHp; foe: BattlerHp } | null {
  const A = addressesFor(version);
  if (mem.read8(A.isInBattle) === 0) return null;
  const one = (base: number, nick: number): BattlerHp => ({
    name: decodeText(mem.readBytes(nick, NAME_LENGTH)), species: mem.read8(base), hp: mem.read16be(base + 1), maxHp: mem.read16be(base + 15),
  });
  return { you: one(A.battleMon, A.battleMonNick), foe: one(A.enemyMon, A.enemyMonNick) };
}

/** Where the player is, cheaply (a few bytes, read after every step). */
export function readPosition(mem: MemoryReader, version: GameVersion): Position {
  const A = addressesFor(version);
  // No battle without a Pokémon: before the game starts the battle flag is whatever memory holds.
  const party = mem.read8(A.partyCount);
  const battle = party >= 1 && party <= 6 && mem.read8(A.isInBattle) !== 0;
  return {
    x: mem.read8(A.xCoord), y: mem.read8(A.yCoord), map: mem.read8(A.curMap), battle,
    battleSoon: !battle && mem.read8(A.curOpponent) !== 0,
    scripted: !battle && mem.read8(A.joyIgnore) !== 0,
    // Before the first Pokémon the memory may not hold a map yet (title screen, intro).
    inWorld: (party >= 1 && party <= 6) || (mem.read8(A.xCoord) < mem.read8(A.curMapWidth) * 2 && mem.read8(A.yCoord) < mem.read8(A.curMapHeight) * 2),
  };
}

/**
 * Poisoned party members (Gen 1 status bit 3) by uid (as the tracker's: OT ID + DVs), straight
 * from RAM: cheap enough to check after every step.
 */
export function poisonedParty(mem: MemoryReader, version: GameVersion): Map<string, { slot: number; hp: number; maxHp: number }> {
  const A = addressesFor(version);
  const out = new Map<string, { slot: number; hp: number; maxHp: number }>();
  const n = Math.min(mem.read8(A.partyCount), 6);
  for (let i = 0; i < n; i++) {
    const m = A.partyMons + i * 44;
    if (!(mem.read8(m + 4) & 0x08)) continue;
    const uid = [m + 12, m + 13, m + 27, m + 28].map((a) => mem.read8(a).toString(16).padStart(2, "0")).join("");
    out.set(uid, { slot: i, hp: mem.read16be(m + 1), maxHp: mem.read16be(m + 34) });
  }
  return out;
}

const bcd = (v: number) => (v >> 4) * 10 + (v & 0x0f);

export function readGameState(mem: MemoryReader, version: GameVersion): GameState {
  const A = addressesFor(version);
  const consts = version === "yellow" ? MAP_CONSTANTS_Y : MAP_CONSTANTS_RB;

  const partyCount = mem.read8(A.partyCount);
  const validParty = partyCount >= 1 && partyCount <= 6;
  const party: MonState[] = [];
  if (validParty) {
    for (let i = 0; i < partyCount; i++) {
      party.push(readPartyMon(mem, A.partyMons + i * PARTY_MON_SIZE, A.partyNicks + i * NAME_LENGTH));
    }
  }

  const numBag = Math.min(mem.read8(A.numBagItems), 20);
  const bagRaw = mem.readBytes(A.bagItems, numBag * 2);
  const bag = [];
  for (let i = 0; i < numBag; i++) bag.push({ id: bagRaw[i * 2], qty: bagRaw[i * 2 + 1] });

  const rawBattle = mem.read8(A.isInBattle);
  const battle = rawBattle === 0xff ? -1 : rawBattle === 1 ? 1 : rawBattle === 2 ? 2 : 0;
  let enemyTrainer: GameState["enemyTrainer"] = null;
  if (battle === 2) {
    const n = Math.min(mem.read8(A.enemyPartyCount), 6);
    const mons = [];
    for (let i = 0; i < n; i++) {
      const base = A.enemyMons + i * PARTY_MON_SIZE;
      mons.push({ species: mem.read8(base), level: mem.read8(base + 33), hp: mem.read16be(base + 1) });
    }
    enemyTrainer = { trainerClass: mem.read8(A.trainerClass), number: mem.read8(A.trainerNo), party: mons };
  }

  const grass = mem.readBytes(A.grassMons, 20);
  const grassMons = [];
  if (mem.read8(A.grassRate) > 0) {
    for (let i = 0; i < 10; i++) grassMons.push({ level: grass[i * 2], species: grass[i * 2 + 1] });
  }

  const owned = mem.readBytes(A.pokedexOwned, 19);
  let dexOwned = 0;
  for (const byte of owned) for (let bit = 0; bit < 8; bit++) if (byte & (1 << bit)) dexOwned++;

  const money = mem.readBytes(A.money, 3);
  const map = mem.read8(A.curMap);

  return {
    version,
    started: validParty,
    firstRivalFought: firstRivalBattleFought(mem, version),
    playerName: decodeText(mem.readBytes(A.playerName, NAME_LENGTH)),
    map,
    mapConst: consts[map] || `MAP_${map.toString(16)}`,
    x: mem.read8(A.xCoord),
    y: mem.read8(A.yCoord),
    // wSpriteStateData1 +9 of the player's slot: down 0, up 4, left 8, right $C.
    facing: (["down", "up", "left", "right"] as const)[(mem.read8(A.spriteData1 + 9) >> 2) & 3],
    // wMapPalOffset: non-zero while the map is dark (the tunnel, until Flash).
    dark: mem.read8(A.mapPalOffset) !== 0,
    mapSize: { w: mem.read8(A.curMapWidth) * 2, h: mem.read8(A.curMapHeight) * 2 },
    badges: mem.read8(A.badges),
    money: bcd(money[0]) * 10000 + bcd(money[1]) * 100 + bcd(money[2]),
    playTime: { h: mem.read8(A.playTimeHours), m: mem.read8(A.playTimeMinutes), s: mem.read8(A.playTimeSeconds) },
    party,
    boxCount: Math.min(mem.read8(A.boxCount), 20),
    dexOwned,
    bag,
    battle,
    battleMon: battle > 0 ? readBattleMon(mem, A.battleMon, A.battleMonNick, A.playerStatMods) : null,
    activeIndex: battle > 0 ? mem.read8(A.playerMonNumber) : 0,
    enemy: battle > 0 ? readBattleMon(mem, A.enemyMon, A.enemyMonNick, A.enemyStatMods) : null,
    enemyTrainer,
    playerUsedMove: mem.read8(A.playerUsedMove),
    enemyUsedMove: mem.read8(A.enemyUsedMove),
    grassMons,
    grassRate: mem.read8(A.grassRate),
    hofTeams: mem.read8(A.numHoFTeams),
    options: mem.read8(A.options),
    boxText: readBoxText(mem),
    pcMons: () => readPcMons((a) => mem.read8(a), (a, n) => mem.readBytes(a, n), mem.getExtRam?.() ?? null, A),
  };
}

// FontGraphics (1bpp) in ROM bank 4, from the pret symbol files.
const FONT_ROM_OFFSET = { rb: 0x11a80, yellow: 0x10600 };

/** VRAM bytes tiles $80-$81 ("A", "B") hold while the text font is loaded. */
export function fontSignature(rom: Uint8Array, version: GameVersion): Uint8Array {
  const off = version === "yellow" ? FONT_ROM_OFFSET.yellow : FONT_ROM_OFFSET.rb;
  const sig = new Uint8Array(32);
  // The game copies the 1bpp font "doubled" into both bitplanes.
  for (let i = 0; i < 16; i++) sig[2 * i] = sig[2 * i + 1] = rom[off + i];
  return sig;
}

/**
 * The 20×18 background tile map decoded as text — what's on screen, line by line.
 * Title/intro screens put graphics in the font's tile slots; pass the font
 * signature so those screens aren't misread as letters. `glyph` reads a tile as text (the
 * game's charset: Gen 2 passes its own).
 */
export function readScreenText(mem: MemoryReader, fontSig?: Uint8Array, glyph: (tile: number) => string = charFor): string[] {
  if (fontSig) {
    const vram = mem.readBytes(0x8800, fontSig.length);
    if (!vram.every((b, i) => b === fontSig[i])) {
      return ["(No text on screen — overworld or a graphics screen. Use get_screen to see it.)"];
    }
  }
  const lcdc = mem.read8(0xff40);
  if (!(lcdc & 0x80)) return ["(Screen is off — a transition is in progress. Wait a few frames.)"];
  if (mem.read8(0xff47) === 0) return ["(Screen is faded to white — a transition is in progress. Wait a few frames.)"];

  // Compose what the LCD actually shows: window layer over the scrolled
  // background. (The game's wTileMap buffer can be stale during transitions.)
  const bgMap = mem.readBytes(lcdc & 0x08 ? 0x9c00 : 0x9800, 0x400);
  const winMap = mem.readBytes(lcdc & 0x40 ? 0x9c00 : 0x9800, 0x400);
  const winOn = (lcdc & 0x20) !== 0;
  const scy = mem.read8(0xff42);
  const scx = mem.read8(0xff43);
  const wy = mem.read8(0xff4a);
  const wx = mem.read8(0xff4b) - 7;

  const lines: string[] = [];
  for (let row = 0; row < 18; row++) {
    let line = "";
    for (let col = 0; col < 20; col++) {
      const py = row * 8;
      const px = col * 8;
      const tile = winOn && wy <= 143 && py >= wy && px >= wx
        ? winMap[((py - wy) >> 3) * 32 + ((px - wx) >> 3)]
        : bgMap[(((scy + py) >> 3) & 31) * 32 + (((scx + px) >> 3) & 31)];
      const ch = glyph(tile);
      line += ch.length === 1 ? ch : ch || "·";
    }
    lines.push(line.replace(/·+$/g, ""));
  }
  // The font is loaded but nothing is written (a picture with no text box yet): say so,
  // rather than eighteen empty lines.
  if (lines.every((l) => !l.trim())) return ["(No text on screen — overworld or a graphics screen. Use get_screen to see it.)"];
  return lines;
}

/** The two text lines of the bottom text box from the game's tile buffer (rows 14 and 16), or "". */
function readBoxText(mem: MemoryReader): string {
  const box = mem.readBytes(0xc3a0 + 12 * 20, 6 * 20);
  if (box[0] !== 0x79) return ""; // no box frame ("┌") in the top-left corner
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
