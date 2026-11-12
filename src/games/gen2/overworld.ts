// Crystal's overworld as text maps (src/bridge/overworld.ts draws and paths over them), from
// pokecrystal's map data. Unlike Gen 1, every square has a collision type of its own (wall, water,
// grass, ledge, door, counter, PC…: constants/collision_constants.asm), read per block from the
// tileset's collision data, so no tile lists are needed. People, items and trainers come from the
// map's objects (wMapObjects, and their object structs while loaded), doors from its warp events.

import { markWatched, type Dir, type Door, type OverworldView, type TrainerSprite } from "../../bridge/overworld";
import type { MemoryReader } from "../types";
import { MAP_CONSTANTS_CRYSTAL } from "./map-constants";
import { A, currentMap, rd, rd16le, eventSet } from "./ram";

const VIEW_W = 10;
const VIEW_H = 9;
const PLAYER_COL = 4;
const PLAYER_ROW = 4;
/** wOverworldMapBlocks: the current map's blocks with a 3-block border of the connected maps. */
const OVERWORLD_MAP = 0xc800;
const MAP_BORDER = 3;

export const OW = {
  tilesetBlocksBank: 0xd1dc, tilesetBlocksAddress: 0xd1dd, tilesetCollisionBank: 0xd1df, tilesetCollisionAddress: 0xd1e0,
  mapScriptsBank: 0xd1a3, mapEventsPointer: 0xd1a6, mapConnections: 0xd1a8,
  warpCount: 0xdbfb, warpsPointer: 0xdbfc, bgEventCount: 0xdc01, bgEventsPointer: 0xdc02, objectEventCount: 0xdc04,
  objectStructs: 0xd4d6, mapObjects: 0xd71e, playerState: 0xd95d,
};
const OBJECT_LENGTH = 0x28;
const MAPOBJECT_LENGTH = 16;
const NUM_OBJECTS = 16;

/** ROM tables (pokecrystal.sym): bank $13 CollisionPermissionTable, bank $25 MapGroupPointers, bank $0E TrainerGroups. */
const COLLISION_PERMISSIONS = 0x13 * 0x4000 + (0x4e1f - 0x4000);
const MAP_GROUP_POINTERS = 0x25 * 0x4000;
const TRAINER_GROUPS = 0x0e * 0x4000 + (0x5999 - 0x4000);

/** CollisionPermissionTable values. */
const WATER_TILE = 0x01;
const WALL_TILE = 0x0f;

/** Collision types the text map tells apart (constants/collision_constants.asm). */
const COLL = {
  ICE: 0x23,
  CUT_TREE: 0x12, LONG_GRASS: 0x14, TALL_GRASS: 0x18, WHIRLPOOL: 0x24, PIT: 0x60,
  COUNTER: 0x90, PC: 0x93, HOP_RIGHT: 0xa0, HOP_LEFT: 0xa1, HOP_DOWN: 0xa3, HOP_DOWN_RIGHT: 0xa4, HOP_DOWN_LEFT: 0xa5,
};
/**
 * One-sided walls (COLL_RIGHT_WALL, _LEFT_WALL, _UP_WALL, _DOWN_WALL): floor with a wall on one
 * side, like the rim of a plateau's top (the Ruins of Alph). A step crossing that side is blocked,
 * either way; the square itself is walkable from the other sides.
 */
const SIDE_WALLS = { right: 0xb0, left: 0xb1, up: 0xb2, down: 0xb3 };
export function sideWallBlocks(from: number, to: number, dx: number, dy: number): boolean {
  if (dy > 0) return to === SIDE_WALLS.up || from === SIDE_WALLS.down;
  if (dy < 0) return from === SIDE_WALLS.up || to === SIDE_WALLS.down;
  if (dx > 0) return from === SIDE_WALLS.right || to === SIDE_WALLS.left;
  if (dx < 0) return from === SIDE_WALLS.left || to === SIDE_WALLS.right;
  return false;
}

/** Things used by facing them (bookshelf, radio, town map, mart shelf, TV, window, incense burner). */
const FACE_TO_USE = new Set([0x91, 0x94, 0x95, 0x96, 0x97, 0x9d, 0x9f]);
/**
 * Crystal's hop squares: the square you stand on to jump, and which way (a diagonal one counts as
 * down). You jump over the next square, the ledge's face, and land two squares on. The text map marks
 * the face, as Gen 1's does (the square hopped over), and leaves the hop square walkable.
 */
const HOPS: Record<number, { ch: string; dx: number; dy: number }> = {
  [COLL.HOP_RIGHT]: { ch: ">", dx: 1, dy: 0 }, [COLL.HOP_LEFT]: { ch: "<", dx: -1, dy: 0 },
  [COLL.HOP_DOWN]: { ch: "v", dx: 0, dy: 1 }, [COLL.HOP_DOWN_RIGHT]: { ch: "v", dx: 0, dy: 1 }, [COLL.HOP_DOWN_LEFT]: { ch: "v", dx: 0, dy: 1 },
};

/** Sprites a player knows by their place (constants/sprite_constants.asm). */
const SPRITE = { NURSE: 0x37, CLERK: 0x39, POKE_BALL: 0x54, ROCK: 0x59, BOULDER: 0x5a };
/** MAPOBJECT_TYPE (the low nibble of MAPOBJECT_PALETTE). */
const OBJECTTYPE = { ITEMBALL: 1, TRAINER: 2 };
/** BGEVENT_ITEM: a hidden item (never shown). */
const BGEVENT_ITEM = 7;
/** wPlayerState while surfing (PLAYER_SURF and PLAYER_SURF_PIKA). */
const SURFING = new Set([4, 8]);

// OBJECT_DIRECTION: down 0, up 4, left 8, right $C.
const FACING: Record<number, [number, number]> = { 0: [0, 1], 4: [0, -1], 8: [-1, 0], 12: [1, 0] };

/** A banked pointer as a ROM offset (bank 0 below $4000). */
const romOff = (bank: number, ptr: number) => (ptr < 0x4000 ? ptr : bank * 0x4000 + (ptr - 0x4000));
const word = (rom: Uint8Array, at: number) => rom[at] | (rom[at + 1] << 8);

/** One map object (1..15) as the text map needs it. */
interface MapObject {
  index: number;
  sprite: number;
  x: number;
  y: number;
  /** OBJECT_DIRECTION of its loaded struct; null while it isn't loaded (off screen). */
  facing: number | null;
  type: number;
  sightRange: number;
  script: number;
  hidden: boolean;
}

/** hHours (HRAM): the clock's hour, for objects only out at certain hours. */
const H_HOURS = 0xff94;
/** TimesOfDay masks by wTimeOfDay (morning, day, night; darkness counts as night). */
const TIME_MASKS = [1, 2, 4, 4];

/**
 * Whether a map object is out at this time, as the game's CheckObjectTime decides: HOUR_1 = -1 means
 * a time-of-day mask in HOUR_2 (-1: always), else an hour range HOUR_1..HOUR_2 (it may wrap midnight).
 */
export function onAtThisTime(mem: MemoryReader, hour1: number, hour2: number): boolean {
  if (hour1 === 0xff) return hour2 === 0xff || (TIME_MASKS[rd(mem, A.timeOfDay) & 3] & hour2) !== 0;
  const h = mem.read8(H_HOURS);
  if (hour1 === hour2) return true;
  return hour1 < hour2 ? h >= hour1 && h <= hour2 : h >= hour1 || h <= hour2;
}

function mapObjects(mem: MemoryReader): MapObject[] {
  const n = Math.min(rd(mem, OW.objectEventCount), NUM_OBJECTS - 1);
  const out: (MapObject & { loaded: boolean })[] = [];
  for (let i = 1; i <= n; i++) {
    const m = OW.mapObjects + i * MAPOBJECT_LENGTH;
    const sprite = rd(mem, m + 1);
    if (!sprite) continue;
    const flag = rd16le(mem, m + 12);
    const structId = rd(mem, m);
    let x = rd(mem, m + 3) - 4;
    let y = rd(mem, m + 2) - 4;
    let facing: number | null = null;
    let hidden = (flag !== 0xffff && eventSet(mem, flag)) || !onAtThisTime(mem, rd(mem, m + 6), rd(mem, m + 7));
    let loaded = false;
    if (structId !== 0xff && structId < NUM_OBJECTS) {
      // Loaded: where it stands now (people wander), and which way it faces.
      const s = OW.objectStructs + structId * OBJECT_LENGTH;
      if (rd(mem, s)) {
        x = rd(mem, s + 0x10) - 4;
        y = rd(mem, s + 0x11) - 4;
        facing = rd(mem, s + 0x08) & 0x0c;
        hidden = false;
        loaded = true;
      }
    }
    out.push({ index: i, sprite, x, y, facing, type: rd(mem, m + 8) & 0x0f, sightRange: rd(mem, m + 9), script: rd16le(mem, m + 10), hidden, loaded });
  }
  // Someone on screen who isn't loaded is gone (a script took them away without a flag), but only
  // once the game has loaded anyone: right after a door nobody is loaded yet, and a shop's clerk
  // read as gone (2026-11-12). So: when any object is loaded, the unloaded ones on screen are hidden.
  return hideUnloadedOnScreen(out, rd(mem, A.xCoord), rd(mem, A.yCoord));
}

/** See mapObjects: once anyone is loaded, the unloaded objects on screen are gone. */
export function hideUnloadedOnScreen<T extends { x: number; y: number; hidden: boolean; loaded: boolean }>(objs: T[], px: number, py: number): Omit<T, "loaded">[] {
  const anyLoaded = objs.some((o) => o.loaded);
  return objs.map(({ loaded, ...o }) => ({
    ...o,
    hidden: o.hidden || (anyLoaded && !loaded && Math.abs(o.x - px) <= PLAYER_COL && Math.abs(o.y - py) <= PLAYER_ROW),
  }));
}

/** A trainer object's header (in the map's script bank): its event flag, class and number. */
function trainerHeader(mem: MemoryReader, rom: Uint8Array, o: MapObject): { flag: number; trainerClass: number; number: number } | null {
  if (o.type !== OBJECTTYPE.TRAINER) return null;
  const at = romOff(rd(mem, OW.mapScriptsBank), o.script);
  if (at + 4 > rom.length) return null;
  return { flag: word(rom, at), trainerClass: rom[at + 2], number: rom[at + 3] };
}

/** Map-object indices of the trainers on this map already beaten (their event flags are set). */
export function beatenTrainers(mem: MemoryReader, rom: Uint8Array): number[] {
  const out: number[] = [];
  for (const o of mapObjects(mem)) {
    const h = trainerHeader(mem, rom, o);
    if (h && eventSet(mem, h.flag)) out.push(o.index);
  }
  return out;
}

/** Trainer people on the current map (map coordinates). */
export function trainerSprites(mem: MemoryReader, _playerX: number, _playerY: number): TrainerSprite[] {
  return mapObjects(mem)
    .filter((o) => o.type === OBJECTTYPE.TRAINER && !o.hidden)
    .map((o) => {
      const [dx, dy] = FACING[o.facing ?? 0] ?? [0, 1];
      return { index: o.index, x: o.x, y: o.y, dx, dy, onScreen: o.facing !== null, sight: o.sightRange > 0 };
    });
}

/** Which trainer a map object is: its class and its number in that class (0, 0 when it isn't one). */
export function spriteTrainer(mem: MemoryReader, rom: Uint8Array | null, sprite: number): { trainerClass: number; number: number } {
  const o = mapObjects(mem).find((m) => m.index === sprite);
  const h = o && rom ? trainerHeader(mem, rom, o) : null;
  return h ? { trainerClass: h.trainerClass, number: h.number } : { trainerClass: 0, number: 0 };
}

/**
 * A trainer's party from the ROM (TrainerGroups: per class a list of parties, each a name, a type
 * byte, then level/species entries — with an item and/or four moves by type — ending at $FF).
 */
export function trainerParty(rom: Uint8Array, trainerClass: number, number: number): { species: number; level: number }[] | null {
  if (trainerClass < 1 || number < 1) return null;
  let p = romOff(0x0e, word(rom, TRAINER_GROUPS + (trainerClass - 1) * 2));
  for (let n = 1; ; n++) {
    if (p >= rom.length) return null;
    while (rom[p] !== 0x50) p++; // the name
    p++;
    const type = rom[p++];
    const size = 2 + (type & 2 ? 1 : 0) + (type & 1 ? 4 : 0);
    const party: { species: number; level: number }[] = [];
    while (rom[p] !== 0xff) {
      party.push({ level: rom[p], species: rom[p + 1] });
      p += size;
      if (party.length > 6) return null;
    }
    p++;
    if (n === number) return party;
    if (n > 64) return null;
  }
}

interface Blocks {
  w: number;
  h: number;
  /** Collision type of a map square (null outside the map and its border). */
  coll(x: number, y: number): number | null;
  /** Past the map's edge on a side with no connected map (only the border block's scenery is there). */
  closedOff(x: number, y: number): boolean;
}

function blockReader(mem: MemoryReader, rom: Uint8Array): Blocks {
  const w = rd(mem, A.mapWidth);
  const h = rd(mem, A.mapHeight);
  const stride = w + MAP_BORDER * 2;
  const blocks = mem.readBytes(OVERWORLD_MAP, (h + MAP_BORDER * 2) * stride);
  const collOff = romOff(rd(mem, OW.tilesetCollisionBank), rd16le(mem, OW.tilesetCollisionAddress));
  // wMapConnections: bit 3 north, 2 south, 1 west, 0 east.
  const conn = rd(mem, OW.mapConnections);
  return {
    w, h,
    closedOff: (x, y) => (y < 0 && !(conn & 8)) || (y >= h * 2 && !(conn & 4)) || (x < 0 && !(conn & 2)) || (x >= w * 2 && !(conn & 1)),
    // A block is 2×2 squares; its collision data holds one byte per square (top-left, top-right, bottom-left, bottom-right).
    coll: (x, y) => {
      const bx = Math.floor(x / 2) + MAP_BORDER;
      const by = Math.floor(y / 2) + MAP_BORDER;
      if (bx < 0 || by < 0 || bx >= stride || by >= h + MAP_BORDER * 2) return null;
      return rom[collOff + blocks[by * stride + bx] * 4 + (y & 1) * 2 + (x & 1)];
    },
  };
}

/** A square's symbol from its collision type. */
export function classify(rom: Uint8Array, coll: number | null): string {
  if (coll == null) return "#";
  if (coll === COLL.CUT_TREE) return "C";
  if (coll === COLL.ICE) return "*";
  if (coll === COLL.TALL_GRASS || coll === COLL.LONG_GRASS) return '"';
  if (HOPS[coll]) return ".";
  if (coll === COLL.COUNTER) return "=";
  if (coll === COLL.PC) return "P";
  if (FACE_TO_USE.has(coll)) return "S";
  if (coll === COLL.PIT) return "O";
  if (coll === COLL.WHIRLPOOL) return "#";
  const perm = rom[COLLISION_PERMISSIONS + coll] & 0x0f;
  return perm === WATER_TILE ? "~" : perm === WALL_TILE ? "#" : ".";
}

/** A square's symbol, knowing its neighbours: the face a hop square jumps over is the ledge. */
export function classifyAt(rom: Uint8Array, coll: (x: number, y: number) => number | null, x: number, y: number): string {
  const ch = classify(rom, coll(x, y));
  if (ch !== "#") return ch;
  for (const hop of Object.values(HOPS)) {
    const from = coll(x - hop.dx, y - hop.dy);
    if (from !== null && HOPS[from] === hop) return hop.ch;
  }
  return ch;
}

/** The current map's warps from its events (y, x, destination warp, map group, map number). */
function currentWarps(mem: MemoryReader, rom: Uint8Array): { x: number; y: number; warp: number; map: number }[] {
  const n = Math.min(rd(mem, OW.warpCount), 32);
  const at = romOff(rd(mem, OW.mapScriptsBank), rd16le(mem, OW.warpsPointer));
  return Array.from({ length: n }, (_, i) => {
    const o = at + i * 5;
    return { y: rom[o], x: rom[o + 1], warp: rom[o + 2], map: (rom[o + 3] << 8) | rom[o + 4] };
  });
}

/** A map's warp events from the ROM (MapGroupPointers → header → attributes → events), as [x, y]. */
export function romWarps(rom: Uint8Array, map: number): [number, number][] {
  const group = map >> 8;
  const number = map & 0xff;
  if (!group || !number) return [];
  const groupTable = romOff(0x25, word(rom, MAP_GROUP_POINTERS + (group - 1) * 2));
  const header = groupTable + (number - 1) * 9;
  const attrs = romOff(rom[header], word(rom, header + 3));
  // map_attributes: border block, height, width, blocks bank, blocks, scripts bank, scripts, events.
  const events = romOff(rom[attrs + 6], word(rom, attrs + 9));
  const n = Math.min(rom[events + 2] ?? 0, 32);
  return Array.from({ length: n }, (_, i): [number, number] => [rom[events + 3 + i * 5 + 1], rom[events + 3 + i * 5]]);
}

/**
 * Whether a square's collision lets its warp fire: doors, stairs, ladders, cave mouths, warp panels
 * and mats ($70-$7F). A hole ($60, a pit) also warps, but it's a hole a player falls into, not a
 * door; and a warp over plain floor never fires (Morty's gym has two, and run 7's path relied on one).
 */
export const isDoorCollision = (coll: number | null) => coll !== null && coll >= 0x70 && coll <= 0x7f;

/** Warp mats (COLL_WARP_CARPET_*): standing on one, the warp fires when you press this way. */
const CARPETS: Record<number, Dir> = { 0x70: "down", 0x76: "left", 0x78: "up", 0x7e: "right" };
/** The way to press on a square with this collision type to take its warp, if it's a warp mat. */
export const carpetPush = (coll: number | null): Dir | undefined => CARPETS[coll ?? -1];

/** The current map's doors, where each leads (map + arrival square), and the way through a warp mat. */
export function mapDoors(mem: MemoryReader, rom: Uint8Array): Door[] {
  const b = blockReader(mem, rom);
  return currentWarps(mem, rom).filter((w) => isDoorCollision(b.coll(w.x, w.y))).map((w) => {
    const arrival = romWarps(rom, w.map)[w.warp - 1];
    const push = carpetPush(b.coll(w.x, w.y));
    return {
      x: w.x, y: w.y, to: MAP_CONSTANTS_CRYSTAL[w.map] || `MAP_${w.map.toString(16)}`, tx: arrival?.[0] ?? null, ty: arrival?.[1] ?? null,
      ...(push ? { push } : {}),
    };
  });
}

/** Doors, signs, people and you, drawn onto a grid whose [0][0] is map (ox, oy). */
function decorate(mem: MemoryReader, rom: Uint8Array, grid: string[][], ox: number, oy: number, playerX: number, playerY: number) {
  const put = (x: number, y: number, ch: string) => {
    const r = y - oy;
    const c = x - ox;
    if (r >= 0 && r < grid.length && c >= 0 && c < grid[0].length) grid[r][c] = ch;
  };
  const at = (x: number, y: number) => grid[y - oy]?.[x - ox] ?? "";
  // Doors: warps whose square lets them fire (holes stay holes, floor stays floor).
  const b = blockReader(mem, rom);
  for (const w of currentWarps(mem, rom)) if (at(w.x, w.y) !== "#" && isDoorCollision(b.coll(w.x, w.y))) put(w.x, w.y, "D");
  // Signs and other things read by facing them (bg events, not the hidden items), where solid.
  const nBg = Math.min(rd(mem, OW.bgEventCount), 32);
  const bgAt = romOff(rd(mem, OW.mapScriptsBank), rd16le(mem, OW.bgEventsPointer));
  for (let i = 0; i < nBg; i++) {
    const o = bgAt + i * 5;
    if (rom[o + 2] === BGEVENT_ITEM) continue;
    if (at(rom[o + 1], rom[o]) === "#") put(rom[o + 1], rom[o], "S");
  }
  for (const o of mapObjects(mem)) {
    if (o.hidden) continue;
    const ch = o.type === OBJECTTYPE.ITEMBALL || o.sprite === SPRITE.POKE_BALL ? "I"
      : o.type === OBJECTTYPE.TRAINER ? "T"
      : o.sprite === SPRITE.BOULDER ? "B"
      : o.sprite === SPRITE.ROCK ? "#"
      : o.sprite === SPRITE.NURSE ? "H"
      : o.sprite === SPRITE.CLERK ? "$"
      : "N";
    put(o.x, o.y, ch);
  }
  put(playerX, playerY, "@");
}

/** Map squares [x0, x0+W) × [y0, y0+H), decorated, with door destinations and trainers' sight. */
function readArea(mem: MemoryReader, rom: Uint8Array, playerX: number, playerY: number, beaten: number[], x0: number, y0: number, W: number, H: number): OverworldView {
  const b = blockReader(mem, rom);
  const open = (x: number, y: number) => (b.closedOff(x, y) ? null : b.coll(x, y));
  const grid: string[][] = [];
  const tiles: number[][] = [];
  for (let y = y0; y < y0 + H; y++) {
    const line: string[] = [];
    const ids: number[] = [];
    for (let x = x0; x < x0 + W; x++) {
      const c = b.closedOff(x, y) ? null : b.coll(x, y);
      ids.push(c ?? -1);
      line.push(c === null ? "#" : classifyAt(rom, open, x, y));
    }
    grid.push(line);
    tiles.push(ids);
  }
  decorate(mem, rom, grid, x0, y0, playerX, playerY);
  const doors = mapDoors(mem, rom).filter((d) => d.x >= x0 && d.x < x0 + W && d.y >= y0 && d.y < y0 + H && grid[d.y - y0][d.x - x0] !== "#");
  const view: OverworldView = {
    grid, originX: x0, originY: y0, pc: playerX - x0, pr: playerY - y0, tiles, doors, stepBlocked: sideWallBlocks,
    beyond: (x, y) => (open(x, y) === null ? "#" : classifyAt(rom, open, x, y)),
    surfing: SURFING.has(rd(mem, OW.playerState)),
  };
  // Each trainer sees as far as its own sight range.
  const allBeaten = [...beaten, ...beatenTrainers(mem, rom)];
  const trainers = trainerSprites(mem, playerX, playerY);
  const objs = new Map(mapObjects(mem).map((o) => [o.index, o.sightRange]));
  const watched = new Set<number>();
  const watchers = new Map<number, [number, number][]>();
  for (const range of new Set(trainers.map((t) => objs.get(t.index) ?? 0))) {
    markWatched(view, trainers.filter((t) => objs.get(t.index) === range), allBeaten, range);
    view.watched!.forEach((s) => watched.add(s));
    view.watchers!.forEach((w, s) => watchers.set(s, [...(watchers.get(s) ?? []), ...w]));
  }
  view.watched = watched;
  view.watchers = watchers;
  return view;
}

/** The visible screen: 10×9 squares around the player, from the map data. */
export function readView(mem: MemoryReader, playerX: number, playerY: number, beaten: number[], rom: Uint8Array | null): OverworldView {
  if (!rom) return { grid: [["@"]], originX: playerX, originY: playerY, pc: 0, pr: 0 };
  return readArea(mem, rom, playerX, playerY, beaten, playerX - PLAYER_COL, playerY - PLAYER_ROW, VIEW_W, VIEW_H);
}

/** The whole current map, with its exits. */
export function readFullMap(mem: MemoryReader, rom: Uint8Array, playerX: number, playerY: number, beaten: number[]): OverworldView {
  const view = readArea(mem, rom, playerX, playerY, beaten, 0, 0, rd(mem, A.mapWidth) * 2, rd(mem, A.mapHeight) * 2);
  // wMapConnections: bit 3 north, 2 south, 1 west, 0 east.
  const conn = rd(mem, OW.mapConnections);
  const exits: Dir[] = [];
  if (conn & 8) exits.push("up");
  if (conn & 4) exits.push("down");
  if (conn & 2) exits.push("left");
  if (conn & 1) exits.push("right");
  view.exits = exits;
  return view;
}

export { currentMap };
