// Gen 1's overworld as text maps (src/bridge/overworld.ts draws and paths over them): the visible
// screen (10×9 squares) or the whole current map, built from game memory and the ROM's tileset
// blocks — collision, warps and where they lead, ledges, water, people, trainers and their sight,
// signs, PCs, switches, cliff edges.

import type { GameVersion } from "../../rom/types";
import { markWatched, type Dir, type Door, type OverworldView, type TrainerSprite } from "../../bridge/overworld";
import { MAP_CONSTANTS_RB, MAP_CONSTANTS_Y } from "./map-constants";
import { addressesFor } from "./ram";
import type { MemoryReader } from "../types";

const VIEW_W = 10;
const VIEW_H = 9;
const PLAYER_COL = 4;
const PLAYER_ROW = 4;
const OVERWORLD_MAP = 0xc6e8; // wOverworldMap: the current map's blocks, with a 3-block border
const MAP_BORDER = 3;

// pret TilePairCollisionsLand: in caves (tileset $11) and forests ($03), a step between
// these two tiles (either way) is blocked — cliff edges look walkable on their own.
const PAIR_COLLISIONS: [number, number, number][] = [
  [0x11, 0x20, 0x05], [0x11, 0x41, 0x05], [0x11, 0x2a, 0x05], [0x11, 0x05, 0x21],
  [0x03, 0x30, 0x2e], [0x03, 0x52, 0x2e], [0x03, 0x55, 0x2e], [0x03, 0x56, 0x2e],
  [0x03, 0x20, 0x2e], [0x03, 0x5e, 0x2e], [0x03, 0x5f, 0x2e],
];

/** Whether a step between these two collision tiles is blocked on this tileset (a cliff edge). */
export const tilePairBlocked = (tileset: number) => (a: number, b: number): boolean =>
  PAIR_COLLISIONS.some(([ts, x, y]) => ts === tileset && ((a === x && b === y) || (a === y && b === x)));

/** How far a trainer's gaze is assumed to reach (Gen 1 engage distances are 1–5). */
const SIGHT = 5;
// wSpriteStateData1 +9 facing: down 0, up 4, left 8, right $C.
const FACING: Record<number, [number, number]> = { 0: [0, 1], 4: [0, -1], 8: [-1, 0], 12: [1, 0] };

/**
 * Trainer classes that never spot you (pret trainer_constants, the same in Red, Blue and Yellow): the
 * rival, gym leaders, the gang's boss and the Elite Four. Their battles start from the story or when you talk
 * to them, so they're on the map and in the trainer list but watch no squares.
 */
const NO_SIGHT_CLASSES = new Set([
  0x19, 0x2a, 0x2b, // the rival's three classes
  0x1d, // the gang's boss (also the last gym's leader)
  0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, // the other seven gym leaders
  0x2c, 0x21, 0x2e, 0x2f, // the Elite Four
]);

/**
 * Whether the game has taken this person off the map (a picked-up item, a departed NPC, one not
 * due yet), as the game itself checks it (pret IsObjectHidden): wToggleableObjectList pairs sprite
 * slots with a global index into wToggleableObjectFlags. Works off screen too, where the picture
 * byte can't tell.
 */
/**
 * A map sprite's square: a fossil lying on the floor is something you pick up, like an item ball;
 * a paper, a desk encyclopedia or a clipboard is read like a sign, not a person. `extra` is the
 * sprite's second map byte (200+ for a trainer).
 */
export function spriteSymbol(version: GameVersion, pic: number, extra: number): string {
  const A = addressesFor(version);
  if (pic === A.ballSprite || pic === A.fossilSprite) return "I";
  if (pic === A.boulderSprite) return "B";
  if (A.readSprites.includes(pic)) return "S";
  return extra >= 200 ? "T" : "N";
}

/** The byte a shop's text starts with (pokered TX_SCRIPT_MART: `script_mart` items…, -1). */
/** The bytes a text starts with when it's a shop or the nurse (pokered TX_SCRIPT_MART, TX_SCRIPT_POKECENTER_NURSE). */
const TX_SCRIPT_MART = 0xfe;
const TX_SCRIPT_NURSE = 0xff;

/**
 * Where each map's data sits: the ROM bank of the map's header and text, from MapHeaderBanks, found
 * through the game's own SwitchToMapRomBank (`ld a, BANK(MapHeaderBanks)` / `call BankswitchHome` /
 * `ld hl, MapHeaderBanks` / `add hl, bc` / `ld a, [hl]` / `ldh [hMapROMBank], a`), the same in Red,
 * Blue and Yellow. Null when that code isn't found exactly once.
 */
const mapBanksAt = new WeakMap<Uint8Array, number | null>();
function mapBankTable(rom: Uint8Array): number | null {
  if (mapBanksAt.has(rom)) return mapBanksAt.get(rom)!;
  let found: number | null = null;
  let count = 0;
  for (let i = 0; i + 12 <= 0x4000; i++) {
    if (rom[i] !== 0x3e || rom[i + 2] !== 0xcd || rom[i + 5] !== 0x21 || rom[i + 8] !== 0x09 || rom[i + 9] !== 0x7e || rom[i + 10] !== 0xe0) continue;
    const ptr = rom[i + 6] | (rom[i + 7] << 8);
    if (ptr < 0x4000 || ptr >= 0x8000) continue;
    found = rom[i + 1] * 0x4000 + (ptr - 0x4000);
    count++;
  }
  const table = count === 1 ? found : null;
  mapBanksAt.set(rom, table);
  return table;
}

/**
 * What talking to this map sprite does, when it's one a player knows by its place: a shop clerk
 * behind a counter, or the nurse. Read from the sprite's text (the map's text pointer table, by
 * its text id): a mart or nurse script. The map's N alone didn't say, and a run walked past the
 * League lobby's shop and took the shop clerk for the nurse (2026-11-08).
 */
export function spriteRole(mem: MemoryReader, rom: Uint8Array, version: GameVersion, sprite: number): "shop" | "nurse" | null {
  const A = addressesFor(version);
  const banks = mapBankTable(rom);
  const textId = mem.read8(A.mapSpriteData + (sprite - 1) * 2 + 1);
  const table = mem.read8(A.mapTextPtr) | (mem.read8(A.mapTextPtr + 1) << 8);
  if (banks === null || !textId || table < 0x4000 || table >= 0x8000) return null;
  const bank = rom[banks + mem.read8(A.curMap)];
  if (!bank) return null;
  const inBank = (ptr: number) => (ptr < 0x4000 ? ptr : ptr < 0x8000 ? bank * 0x4000 + (ptr - 0x4000) : -1);
  const at = inBank(table + (textId - 1) * 2);
  const off = inBank(rom[at] | (rom[at + 1] << 8));
  if (off < 0) return null;
  if (rom[off] === TX_SCRIPT_MART) return "shop";
  if (rom[off] === TX_SCRIPT_NURSE) return "nurse";
  return null;
}

export function spriteHidden(mem: MemoryReader, version: GameVersion, sprite: number): boolean {
  const A = addressesFor(version);
  for (let i = 0; i < 16; i++) {
    const slot = mem.read8(A.toggleableList + i * 2);
    if (slot === 0xff) return false;
    if (slot !== sprite) continue;
    const index = mem.read8(A.toggleableList + i * 2 + 1);
    return (mem.read8(A.toggleableFlags + (index >> 3)) & (1 << (index & 7))) !== 0;
  }
  return false;
}

/** Trainer people on the current map (map coords; only reliable while on screen). */
export function trainerSprites(mem: MemoryReader, version: GameVersion, playerX: number, playerY: number): TrainerSprite[] {
  const A = addressesFor(version);
  const out: TrainerSprite[] = [];
  for (let i = 1; i < 16; i++) {
    if (isFollower(version, i)) continue;
    const pic = mem.read8(A.spriteData1 + i * 16);
    if (!pic || spriteHidden(mem, version, i)) continue;
    // An item ball's extra byte is its item id, and TMs/HMs are ≥200 like trainer classes.
    const extra = mem.read8(A.mapSpriteExtra + (i - 1) * 2);
    if (pic === A.ballSprite || extra < 200) continue;
    const y = mem.read8(A.spriteData2 + i * 16 + 4) - 4;
    const x = mem.read8(A.spriteData2 + i * 16 + 5) - 4;
    const onScreen = Math.abs(x - playerX) <= PLAYER_COL && Math.abs(y - playerY) <= PLAYER_ROW;
    if (onScreen && mem.read8(A.spriteData1 + i * 16 + 2) === 0xff) continue;
    const [dx, dy] = FACING[mem.read8(A.spriteData1 + i * 16 + 9) & 0x0c] ?? [0, 1];
    out.push({ index: i, x, y, dx, dy, onScreen, sight: !NO_SIGHT_CLASSES.has(extra - 200) });
  }
  return out;
}

/** One-way ledge tiles → the direction you can hop them. */
const LEDGES: Record<number, string> = { 0x36: "v", 0x37: "v", 0x27: "<", 0x0d: ">", 0x1d: ">" };

// Spinner arrow tiles (the hideout's facility tileset $16): stepping on one slides you along a
// scripted path (pret RocketHideoutB*ArrowTilePlayerMovement), so paths treat them as walls.
// Same for the gym tileset $07 (the last gym): pret GymSpinnerArrows.
const SPINNERS: Record<number, number[]> = { 0x16: [0x20, 0x21, 0x30, 0x31], 0x07: [0x3c, 0x3d, 0x4c, 0x4d] };
// Which way each spinner arrow points, by the top two tiles of its square (the bottom-left one,
// which classifies a square, is shared between directions). Read from the tiles' own graphics and
// checked against the hideout floors, where every arrow square is one of these four.
const SPINNER_ARROWS: Record<number, Record<string, string>> = {
  0x16: { "21 31": "↑", "20 30": "↓", "21 21": "←", "31 31": "→" },
  0x07: { "3c 3d": "↑", "4c 4d": "↓", "3c 3c": "←", "3d 3d": "→" },
};
const hex2 = (t: number) => t.toString(16).padStart(2, "0");
/** The arrow a spinner square shows ("+" when its tiles aren't known). */
export const spinnerArrow = (tileset: number, tl: number, tr: number) => SPINNER_ARROWS[tileset]?.[`${hex2(tl)} ${hex2(tr)}`] ?? "+";

/** A cave's two floor heights: its lower floor is tile $05 (pret's pair_collision_tile_ids). */
export const lowerCaveFloor = (tileset: number) => (tile: number): boolean => tileset === 0x11 && tile === 0x05;

/**
 * Squares drawn on a cave floor that a player sees but the collision data calls plain floor: a
 * boulder switch (the last cave) and a hole in the floor (the last cave, the ice-cave islands).
 * Found by their tiles: in the whole game these two appear only on the squares the maps' scripts
 * check for a boulder.
 */
export function floorMark(tileset: number, tl: number, tr: number, bl: number): "o" | "O" | null {
  if (tileset !== 0x11) return null;
  if (tl === 0x2b && tr === 0x2c && bl === 0x2d) return "o";
  if (tl === 0x2f && tr === 0x2f && bl === 0x22) return "O";
  return null;
}

// Surfable tiles per tileset (pret WaterTilesets + CollisionCheckOnWater): $14 water, $32 the
// eastern coastline (overworld), $48 the game reserve's coast (forest). Gym and dojo are left out:
// they have no surfable water, and those ids are statues there.
const WATER_TILES: Record<number, number[]> = {
  0: [0x14, 0x32], 3: [0x14, 0x48], 13: [0x14], 14: [0x14], 17: [0x14], 22: [0x14], 23: [0x14],
};

interface TileRules {
  passable: Set<number>;
  spinners: number[];
  /** Surfable tile ids (crossable while surfing). */
  water: number[];
  grass: number;
  outdoors: boolean;
  /** The tileset's cuttable-tree tile, if any (pret: overworld $3D, gym $50). */
  cutTree: number | null;
  /** The player is surfing. */
  surfing: boolean;
  /** Counter tiles: the game talks across them to the person on the other side (pret wTilesetTalkingOverTiles). */
  counters: number[];
}

function tileRules(mem: MemoryReader, version: GameVersion, rom: Uint8Array | null = null): TileRules {
  const A = addressesFor(version);
  // Passable tile ids for this tileset: a 0xFF-terminated list in ROM bank 0 (Red/Blue) or bank 1
  // (Yellow). Read it from the ROM: at $4000+ live memory shows whichever bank is switched in, and
  // for banks 0 and 1 the ROM offset is the address itself.
  const ptr = mem.read8(A.collisionPtr) | (mem.read8(A.collisionPtr + 1) << 8);
  const passable = new Set<number>();
  for (let i = 0; i < 64; i++) {
    const t = rom ? rom[ptr + i] : mem.read8(ptr + i);
    if (t === 0xff) break;
    passable.add(t);
  }
  // Ledges only exist in the outdoor tileset (pret LedgeTiles).
  const tileset = mem.read8(A.curMapTileset);
  const water = (WATER_TILES[tileset] ?? []).filter((t) => !passable.has(t));
  // Surfing changes where you can go, not what the squares are: water stays "~", land ".", and
  // the pathfinder (moves) lets a surfer cross water and step off onto land.
  const surfing = mem.read8(A.walkBikeSurf) === 2;
  const counters = [0, 1, 2].map((i) => mem.read8(A.talkingOver + i)).filter((t) => t !== 0xff && !passable.has(t));
  return {
    passable, water, counters, surfing, spinners: SPINNERS[tileset] ?? [], grass: mem.read8(A.grassTile),
    outdoors: tileset === 0, cutTree: tileset === 0 ? 0x3d : tileset === 7 ? 0x50 : null,
  };
}

const classify = (t: number, r: TileRules) =>
  r.spinners.includes(t) ? "+" : r.passable.has(t) ? (t === r.grass ? '"' : ".") : t === r.cutTree ? "C" : r.water.includes(t) ? "~"
  : r.counters.includes(t) ? "=" : (r.outdoors && LEDGES[t]) || "#";

/**
 * Where the game's PCs stand, by map (pret data/events/hidden_events.asm: every PC is a hidden
 * event used facing up, whichever routine it runs). The game keeps them with
 * the hidden items, so they aren't signs; a player sees them on screen.
 */
const PCS: Record<string, [number, number][]> = {
  REDS_HOUSE_2F: [[0, 1]],
  BILLS_HOUSE: [[1, 4]],
  CELADON_MANSION_2F: [[0, 5]],
  CELADON_HOTEL: [[13, 3]],
  SAFARI_ZONE_WEST_REST_HOUSE: [[13, 3]],
  SAFARI_ZONE_EAST_REST_HOUSE: [[13, 3]],
  SAFARI_ZONE_NORTH_REST_HOUSE: [[13, 3]],
  CINNABAR_LAB_FOSSIL_ROOM: [[0, 4], [2, 4]],
  SILPH_CO_11F: [[10, 12]],
  INDIGO_PLATEAU_LOBBY: [[15, 7]],
};
/**
 * Switches you use by facing them and pressing A, kept with the hidden items too (pret
 * hidden_events.asm): the burned mansion's statues, which open and close its doors, and the
 * electric gym's trash cans (one hides the first switch). A player sees all of them on screen;
 * which can holds a switch stays hidden. Hidden items are never marked.
 */
const SWITCHES: Record<string, [number, number][]> = {
  // The last gym's quiz machines (which answers are right stays hidden).
  CINNABAR_GYM: [[15, 7], [10, 1], [9, 7], [9, 13], [1, 13], [1, 7]],
  POKEMON_MANSION_1F: [[2, 5]],
  POKEMON_MANSION_2F: [[2, 11]],
  POKEMON_MANSION_3F: [[10, 5]],
  POKEMON_MANSION_B1F: [[20, 3], [18, 25]],
  VERMILION_GYM: [1, 3, 5, 7, 9].flatMap((x) => [7, 9, 11].map((y): [number, number] => [x, y])),
};
/** Every Pokémon Center has its PC on the same square. */
const pcsOf = (mapConst: string): [number, number][] => PCS[mapConst] ?? (/_POKECENTER$/.test(mapConst) ? [[13, 3]] : []);

/**
 * Yellow's partner Pokémon follows you in sprite slot 15 (pokeyellow's follower sprite index). You walk onto
 * its square and it steps aside, so it's neither an obstacle nor a trainer: maps show it as F, a
 * square you can walk on, so a press of A at it (its mood) isn't a mystery.
 */
const isFollower = (version: GameVersion, slot: number) => version === "yellow" && slot === 15;

/** Doors, people and you, drawn onto a grid whose [0][0] is map (ox, oy). */
/** Squares you fall through to the floor below (pret's scripts for the maps: they aren't warps). */
const FLOOR_GAPS: Record<string, [number, number][]> = {
  POKEMON_MANSION_3F: [[16, 14], [17, 14], [19, 14]],
};

/** Gates a switch or a quiz opens, by map: [block row, block column] (pret's scripts for those maps). */
const GATES: Record<string, ([number, number] | [number, number, number])[]> = {
  POKEMON_MANSION_1F: [[6, 12], [3, 8], [8, 10], [13, 13]],
  POKEMON_MANSION_2F: [[2, 4], [4, 9], [11, 3]],
  POKEMON_MANSION_3F: [[2, 7], [5, 7]],
  POKEMON_MANSION_B1F: [[8, 13], [11, 6], [3, 4], [8, 8]],
  CINNABAR_GYM: [[3, 9], [3, 6], [6, 6], [8, 3], [6, 2], [3, 2]],
  // The hideout's two locked doors: B1F's opens when its last grunt is beaten, B4F's (to the boss)
  // when the two guards are (pokered RocketHideoutB1F/B4F door callbacks).
  ROCKET_HIDEOUT_B1F: [[8, 12]],
  ROCKET_HIDEOUT_B4F: [[5, 12]],
  // The last cave's barriers, which a boulder on a switch opens. Open, these are other blocks.
  VICTORY_ROAD_1F: [[6, 4, 0x1d]],
  VICTORY_ROAD_2F: [[4, 3, 0x15], [7, 11, 0x1d]],
  VICTORY_ROAD_3F: [[5, 3, 0x1d]],
};
/** The block a gate's place holds while it's open, unless the gate says otherwise. */
const OPEN_GATE_BLOCK = 0x0e;

/**
 * Silph Co's card-key doors, by map: [block row, block column, the block the game puts there while
 * the door is locked]. Unlike the gates above, the map's own block is the open door and a callback
 * writes the locked one each time the floor loads (pokered SilphCo*F door callbacks; the same in
 * Yellow). They read as walls before.
 */
const KEY_DOORS: Record<string, [number, number, number][]> = {
  SILPH_CO_2F: [[2, 2, 0x54], [5, 2, 0x54]],
  SILPH_CO_3F: [[4, 4, 0x5f], [4, 8, 0x5f]],
  SILPH_CO_4F: [[6, 2, 0x54], [4, 6, 0x54]],
  SILPH_CO_5F: [[2, 3, 0x5f], [6, 3, 0x5f], [5, 7, 0x5f]],
  SILPH_CO_6F: [[6, 2, 0x5f]],
  SILPH_CO_7F: [[3, 5, 0x54], [2, 10, 0x54], [6, 10, 0x54]],
  SILPH_CO_8F: [[4, 3, 0x5f]],
  SILPH_CO_9F: [[4, 1, 0x5f], [2, 9, 0x54], [5, 9, 0x54], [6, 5, 0x5f]],
  SILPH_CO_10F: [[4, 5, 0x54]],
  SILPH_CO_11F: [[6, 3, 0x20]],
};

/** Map squares of the gates closed right now: a switch swaps the blocks in live memory. */
export function closedGateSquares(mem: MemoryReader, version: GameVersion, mapConst: string): [number, number][] {
  const gates = GATES[mapConst] ?? [];
  const doors = KEY_DOORS[mapConst] ?? [];
  if (!gates.length && !doors.length) return [];
  const stride = mem.read8(addressesFor(version).curMapWidth) + MAP_BORDER * 2;
  const blockAt = (r: number, c: number) => mem.read8(OVERWORLD_MAP + (r + MAP_BORDER) * stride + c + MAP_BORDER);
  const squares = (r: number, c: number): [number, number][] => [[c * 2, r * 2], [c * 2 + 1, r * 2], [c * 2, r * 2 + 1], [c * 2 + 1, r * 2 + 1]];
  const out: [number, number][] = [];
  for (const [r, c, open = OPEN_GATE_BLOCK] of gates) if (blockAt(r, c) !== open) out.push(...squares(r, c));
  for (const [r, c, locked] of doors) if (blockAt(r, c) === locked) out.push(...squares(r, c));
  return out;
}

function decorate(
  mem: MemoryReader,
  version: GameVersion,
  grid: string[][],
  ox: number,
  oy: number,
  playerX: number,
  playerY: number,
  rom: Uint8Array | null = null,
) {
  const A = addressesFor(version);
  const put = (x: number, y: number, ch: string) => {
    const r = y - oy;
    const c = x - ox;
    if (r >= 0 && r < grid.length && c >= 0 && c < grid[0].length) grid[r][c] = ch;
  };
  const numWarps = Math.min(mem.read8(A.numWarps), 32);
  const warps = mem.readBytes(A.warpEntries, numWarps * 4);
  // A warp on a square you can't step onto isn't a way in or out (the second half of some
  // two-square gate exits; the Ice room's door until it opens), so it stays a wall.
  for (let i = 0; i < numWarps; i++) {
    const x = warps[i * 4 + 1];
    const y = warps[i * 4];
    if (grid[y - oy]?.[x - ox] !== "#") put(x, y, "D");
  }
  // Things you use by facing them and pressing A (signs, a PC, bookshelves…): wSignCoords, y/x
  // pairs after wNumSigns. Shown only where the square is solid anyway.
  const numSigns = Math.min(mem.read8(A.numSigns), 16);
  const signs = mem.readBytes(A.numSigns + 1, numSigns * 2);
  for (let i = 0; i < numSigns; i++) {
    const r = signs[i * 2] - oy;
    const c = signs[i * 2 + 1] - ox;
    if (grid[r]?.[c] === "#") put(signs[i * 2 + 1], signs[i * 2], "S");
  }
  // PCs (marked only where that square is solid).
  const names = version === "yellow" ? MAP_CONSTANTS_Y : MAP_CONSTANTS_RB;
  for (const [x, y] of pcsOf(names[mem.read8(A.curMap)] ?? "")) {
    if (/[#=]/.test(grid[y - oy]?.[x - ox] ?? "")) put(x, y, "P");
  }
  // Switches (statues, trash cans): something to use by facing it, like a sign. Marked wherever
  // the game puts one (some read as floor in the map data, e.g. the mansion basement's two).
  for (const [x, y] of SWITCHES[names[mem.read8(A.curMap)] ?? ""] ?? []) {
    if (/[.#="]/.test(grid[y - oy]?.[x - ox] ?? "")) put(x, y, "S");
  }
  // The gaps in the burned mansion's top floor: a player sees them, and they're the way to its stairs.
  for (const [x, y] of FLOOR_GAPS[names[mem.read8(A.curMap)] ?? ""] ?? []) put(x, y, "O");
  // A closed gate looks like a gate to a player, not like a wall: still solid, only its square shown.
  for (const [x, y] of closedGateSquares(mem, version, names[mem.read8(A.curMap)] ?? "")) {
    if (grid[y - oy]?.[x - ox] === "#") put(x, y, "G");
  }
  // People/objects (slot 0 is the player). Map position from wSpriteStateData2
  // (+4/+5 = map y/x + 4); wMapSpriteExtraData says trainer class (≥200) or item. Boulders move
  // when pushed, and this is where they are now (a boulder on a switch hides it).
  for (let i = 1; i < 16; i++) {
    if (isFollower(version, i)) {
      const fy = mem.read8(A.spriteData2 + i * 16 + 4) - 4;
      const fx = mem.read8(A.spriteData2 + i * 16 + 5) - 4;
      const shown = mem.read8(A.spriteData1 + i * 16) && mem.read8(A.spriteData1 + i * 16 + 2) !== 0xff;
      if (shown && /[."]/.test(grid[fy - oy]?.[fx - ox] ?? "")) put(fx, fy, "F");
      continue;
    }
    const pic = mem.read8(A.spriteData1 + i * 16);
    if (!pic || spriteHidden(mem, version, i)) continue;
    const y = mem.read8(A.spriteData2 + i * 16 + 4) - 4;
    const x = mem.read8(A.spriteData2 + i * 16 + 5) - 4;
    // On screen but not drawn = gone too, whatever the flags say.
    const onScreen = Math.abs(x - playerX) <= PLAYER_COL && Math.abs(y - playerY) <= PLAYER_ROW;
    if (onScreen && mem.read8(A.spriteData1 + i * 16 + 2) === 0xff) continue;
    const extra = mem.read8(A.mapSpriteExtra + (i - 1) * 2);
    const ch = spriteSymbol(version, pic, extra);
    const role = ch === "N" && rom ? spriteRole(mem, rom, version, i) : null;
    put(x, y, role === "shop" ? "$" : role === "nurse" ? "H" : ch);
  }
  put(playerX, playerY, "@");
}

/** The visible screen: 10×9 squares around the player. With the ROM it's built from the map data
 * (always in step with the coordinates); without it, from the on-screen tiles, which can lag a
 * step behind while the screen scrolls. The legend isn't repeated here: the get_map tool's
 * description carries it (it's in the model's context once, not in every result). */
export function readView(
  mem: MemoryReader,
  version: GameVersion,
  playerX: number,
  playerY: number,
  beaten: number[] = [],
  rom: Uint8Array | null = null,
): OverworldView {
  if (rom) return readArea(mem, rom, version, playerX, playerY, beaten, playerX - PLAYER_COL, playerY - PLAYER_ROW, VIEW_W, VIEW_H);
  const A = addressesFor(version);
  const rules = tileRules(mem, version);
  // Each 16×16 square is 2×2 tiles; the game checks its bottom-left tile for collision.
  const screen = mem.readBytes(A.tileMap, 20 * 18);
  const grid: string[][] = [];
  const tiles: number[][] = [];
  for (let row = 0; row < VIEW_H; row++) {
    const line: string[] = [];
    const ids: number[] = [];
    for (let col = 0; col < VIEW_W; col++) {
      const t = screen[(2 * row + 1) * 20 + 2 * col];
      const top = (2 * row) * 20 + 2 * col;
      ids.push(t);
      const ch = classify(t, rules);
      const ts = mem.read8(A.curMapTileset);
      line.push(ch === "+" ? spinnerArrow(ts, screen[top], screen[top + 1]) : ch === "." ? floorMark(ts, screen[top], screen[top + 1], t) ?? ch : ch);
    }
    grid.push(line);
    tiles.push(ids);
  }
  const originX = playerX - PLAYER_COL;
  const originY = playerY - PLAYER_ROW;
  decorate(mem, version, grid, originX, originY, playerX, playerY, rom);
  const view: OverworldView = { grid, originX, originY, pc: PLAYER_COL, pr: PLAYER_ROW, tiles, stepBlocked: tilePairBlocked(mem.read8(A.curMapTileset)), lowerFloor: lowerCaveFloor(mem.read8(A.curMapTileset)), surfing: rules.surfing };
  markWatched(view, trainerSprites(mem, version, playerX, playerY), beaten, SIGHT);
  return view;
}

/**
 * The whole current map, from wOverworldMap (block ids) + the tileset's block
 * definitions in ROM. People are only known while on screen.
 */
export function readFullMap(
  mem: MemoryReader,
  rom: Uint8Array,
  version: GameVersion,
  playerX: number,
  playerY: number,
  beaten: number[] = [],
): OverworldView {
  const A = addressesFor(version);
  const h = mem.read8(A.curMapHeight);
  const w = mem.read8(A.curMapWidth);
  const view = readArea(mem, rom, version, playerX, playerY, beaten, 0, 0, w * 2, h * 2);
  // wCurMapConnections: bit 3 north, 2 south, 1 west, 0 east.
  const conn = mem.read8(A.mapConnections);
  const exits: Dir[] = [];
  if (conn & 8) exits.push("up");
  if (conn & 4) exits.push("down");
  if (conn & 2) exits.push("left");
  if (conn & 1) exits.push("right");
  view.exits = exits;
  return view;
}

/**
 * Tile id of any map square from wOverworldMap (the map's blocks plus a 3-block border that
 * holds the connected maps' edge strips), or null outside even the border.
 */
function tileReader(mem: MemoryReader, rom: Uint8Array, version: GameVersion): (x: number, y: number, part?: "bl" | "tl" | "tr") => number | null {
  const A = addressesFor(version);
  const h = mem.read8(A.curMapHeight);
  const w = mem.read8(A.curMapWidth);
  const bank = mem.read8(A.tilesetBank);
  const ptr = mem.read8(A.tilesetBlocksPtr) | (mem.read8(A.tilesetBlocksPtr + 1) << 8);
  const blocksOff = bank * 0x4000 + (ptr - 0x4000);
  const stride = w + MAP_BORDER * 2;
  const blocks = mem.readBytes(OVERWORLD_MAP, (h + MAP_BORDER * 2) * stride);
  // A square is 2×2 of the block's 4×4 tiles; "bl" (its bottom-left) classifies it.
  return (x, y, part = "bl") => {
    const bx = Math.floor(x / 2) + MAP_BORDER;
    const by = Math.floor(y / 2) + MAP_BORDER;
    if (bx < 0 || by < 0 || bx >= stride || by >= h + MAP_BORDER * 2) return null;
    const block = blocks[by * stride + bx];
    const row = (y & 1) * 2 + (part === "bl" ? 1 : 0);
    const col = (x & 1) * 2 + (part === "tr" ? 1 : 0);
    return rom[blocksOff + block * 16 + row * 4 + col];
  };
}

/** Map squares [x0, x0+W) × [y0, y0+H) from the map data, decorated, with door destinations. */
function readArea(
  mem: MemoryReader,
  rom: Uint8Array,
  version: GameVersion,
  playerX: number,
  playerY: number,
  beaten: number[],
  x0: number,
  y0: number,
  W: number,
  H: number,
): OverworldView {
  const A = addressesFor(version);
  const rules = tileRules(mem, version, rom);
  const tileAt = tileReader(mem, rom, version);
  const grid: string[][] = [];
  const tiles: number[][] = [];
  for (let y = y0; y < y0 + H; y++) {
    const line: string[] = [];
    const ids: number[] = [];
    for (let x = x0; x < x0 + W; x++) {
      const t = tileAt(x, y);
      ids.push(t ?? -1);
      const ch = t == null ? "#" : classify(t, rules);
      const ts = mem.read8(A.curMapTileset);
      const tl = tileAt(x, y, "tl") ?? -1;
      const tr = tileAt(x, y, "tr") ?? -1;
      line.push(ch === "+" ? spinnerArrow(ts, tl, tr) : ch === "." ? floorMark(ts, tl, tr, t!) ?? ch : ch);
    }
    grid.push(line);
    tiles.push(ids);
  }
  decorate(mem, version, grid, x0, y0, playerX, playerY, rom);
  const beyond = (x: number, y: number) => {
    const t = tileAt(x, y);
    return t == null ? "#" : classify(t, rules);
  };
  const doors = mapDoors(mem, rom, version).filter((d) => grid[d.y - y0]?.[d.x - x0] !== "#" && d.y >= y0 && d.y < y0 + H && d.x >= x0 && d.x < x0 + W);
  const view: OverworldView = {
    grid, originX: x0, originY: y0, pc: playerX - x0, pr: playerY - y0, tiles, stepBlocked: tilePairBlocked(mem.read8(A.curMapTileset)), lowerFloor: lowerCaveFloor(mem.read8(A.curMapTileset)), beyond, doors,
    surfing: rules.surfing,
  };
  markWatched(view, trainerSprites(mem, version, playerX, playerY), beaten, SIGHT);
  return view;
}

/** ROM offsets of the map header tables (pret MapHeaderBanks / MapHeaderPointers, English). */
const MAP_HEADERS: Record<"rb" | "y", { banks: number; ptrs: number }> = {
  rb: { banks: 0xc23d, ptrs: 0x01ae },
  y: { banks: 0xfc3e4, ptrs: 0xfc1f2 },
};

/** A map's warps from its ROM header: [x, y, destination warp index, destination map]. */
function romWarps(rom: Uint8Array, version: GameVersion, map: number): [number, number, number, number][] {
  const t = MAP_HEADERS[version === "yellow" ? "y" : "rb"];
  const bank = rom[t.banks + map];
  const ptr = rom[t.ptrs + map * 2] | (rom[t.ptrs + map * 2 + 1] << 8);
  const off = (p: number) => (p < 0x4000 ? p : bank * 0x4000 + (p - 0x4000));
  const hdr = off(ptr);
  if (hdr + 12 > rom.length) return [];
  const conn = rom[hdr + 9];
  const nCons = ((conn >> 3) & 1) + ((conn >> 2) & 1) + ((conn >> 1) & 1) + (conn & 1);
  const objPtr = rom[hdr + 10 + nCons * 11] | (rom[hdr + 11 + nCons * 11] << 8);
  const obj = off(objPtr);
  const n = Math.min(rom[obj + 1] ?? 0, 32);
  const out: [number, number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const o = obj + 2 + i * 4;
    out.push([rom[o + 1], rom[o], rom[o + 2], rom[o + 3]]);
  }
  return out;
}

/** The current map's doors/warps and where each leads (map + arrival square). */
export function mapDoors(mem: MemoryReader, rom: Uint8Array, version: GameVersion): Door[] {
  const A = addressesFor(version);
  const names = version === "yellow" ? MAP_CONSTANTS_Y : MAP_CONSTANTS_RB;
  const numWarps = Math.min(mem.read8(A.numWarps), 32);
  const warps = mem.readBytes(A.warpEntries, numWarps * 4);
  const out: Door[] = [];
  for (let i = 0; i < numWarps; i++) {
    const [y, x, destWarp, rawMap] = [warps[i * 4], warps[i * 4 + 1], warps[i * 4 + 2], warps[i * 4 + 3]];
    // $FF = back to the map you came from (buildings' exits).
    const destMap = rawMap === 0xff ? mem.read8(A.lastMap) : rawMap;
    const arrival = romWarps(rom, version, destMap)[destWarp];
    out.push({ x, y, to: names[destMap] || `MAP_${destMap}`, tx: arrival?.[0] ?? null, ty: arrival?.[1] ?? null });
  }
  return out;
}
