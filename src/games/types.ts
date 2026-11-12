// What every game shares with the harness: the emulator's memory as a game adapter reads and
// writes it, and the GameState each adapter maps its own RAM into. The tracker, the rules and
// the bridge only see these shapes; a game's addresses and encodings stay in its folder
// (src/games/<game>/).

import type { GameVersion } from "../rom/types";

export interface MemoryReader {
  read8(addr: number): number;
  read16be(addr: number): number;
  readBytes(addr: number, len: number): Uint8Array;
  /** Cartridge RAM (the emulators have it): the PC boxes other than the current one. */
  getExtRam?(): Uint8Array;
  /**
   * One byte of a given work-RAM bank, whichever bank is switched in (Game Boy Color games bank
   * $D000-$DFFF; read8 sees only the current one). `addr` is a CPU address in $C000-$DFFF.
   */
  readWram?(bank: number, addr: number): number;
}

export interface MemoryWriter extends MemoryReader {
  write8(addr: number, value: number): void;
}

/** Cartridge RAM as a whole (the PC boxes outside the current one live there). */
export interface BoxRam {
  getExtRam(): Uint8Array;
  loadExtRam(data: Uint8Array): void;
}

/** The emulator's loaded ROM, as the harness may change it. */
export interface RomAccess {
  romBytes(): Uint8Array;
  writeRom(offset: number, value: number): void;
}

export interface MonState {
  species: number;
  /** Original Trainer ID + DVs: identifies one individual through evolutions and box trips ("" in battle structs). */
  uid: string;
  nickname: string;
  level: number;
  hp: number;
  maxHp: number;
  status: number;
  moves: number[];
  pp: number[];
  /** spc is Special (Gen 1) or Special Attack (Gen 2, which adds spdef). */
  stats: { atk: number; def: number; spd: number; spc: number; spdef?: number };
  exp: number;
}

export interface BattleMonState extends MonState {
  /** Stat stages −6..+6: atk, def, spd, spc, acc, eva (Gen 2 adds sp.def as a seventh). */
  stages: number[];
}

export interface PcMon {
  species: number;
  /** As MonState.uid: OT ID + DVs. */
  uid: string;
  level: number;
}

export interface GameState {
  version: GameVersion;
  /** False while still on the title screen / intro (no party yet). */
  started: boolean;
  playerName: string;
  map: number;
  mapConst: string;
  x: number;
  y: number;
  /** Which way the player faces: a player sees it, and signs, switches and PCs depend on it. */
  facing?: "down" | "up" | "left" | "right";
  /** The map is dark: a player can't see where they stand (their coordinates aren't shown). */
  dark?: boolean;
  /** The map's size in tiles: coordinates outside it mean the game world isn't loaded (title screen, intro). */
  mapSize?: { w: number; h: number };
  badges: number;
  money: number;
  playTime: { h: number; m: number; s: number };
  party: MonState[];
  boxCount: number;
  dexOwned: number;
  bag: { id: number; qty: number }[];
  /** 0 = none, 1 = wild, 2 = trainer, -1 = lost. */
  battle: 0 | 1 | 2 | -1;
  /** The first rival battle (in the lab) is over: the game heals the party, then sets this. Missing = assume so. */
  firstRivalFought?: boolean;
  battleMon: BattleMonState | null;
  activeIndex: number;
  enemy: BattleMonState | null;
  enemyTrainer: { trainerClass: number; number: number; party: { species: number; level: number; hp: number }[] } | null;
  playerUsedMove: number;
  enemyUsedMove: number;
  grassMons: { level: number; species: number }[];
  /** Wild encounter rate of the current map's grass/cave table (chance per step = rate / 256). */
  grassRate: number;
  hofTeams: number;
  /** The kind of battle (Gen 2's wBattleType: tutorial, can-lose…), where the game has one. */
  battleType?: number;
  /** wOptions: bit 6 set = battle style SET. */
  options: number;
  /** Text currently shown in the bottom text box (game buffer), or "". */
  boxText: string;
  /**
   * Every Pokémon in the PC boxes, read when called (most boxes sit in cartridge RAM, too much
   * to copy every poll). Call it on the latest state only. Missing = the PC can't be read.
   */
  pcMons?: () => PcMon[];
}

/** One battler's name and HP, read between battle messages to say what each hit did. */
export interface BattlerHp { name: string; species: number; hp: number; maxHp: number }

/**
 * Where the player is, cheaply (a few bytes, read after every step). `scripted`: a scene has
 * taken the controls (the game ignores the joypad while it moves you). `inWorld`: false before
 * the game world is loaded (title screen, intro).
 */
export interface Position { x: number; y: number; map: number; battle: boolean; battleSoon?: boolean; scripted?: boolean; inWorld?: boolean }
