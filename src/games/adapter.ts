// The game adapter: everything the harness knows about one game, behind one interface. The
// tracker, the rules, the bridge (the page's side of the MCP tools) and the app ask the run's
// adapter instead of reading a game's memory or tables themselves. Gen 1 (Red, Blue, Yellow) is
// src/games/gen1, the first implementation; another game implements this in its own folder and
// is listed in src/games/index.ts. Differences between versions of one game (Red/Blue against
// Yellow) stay inside its adapter.

import type { OverworldView, TrainerSprite } from "../bridge/overworld";
import type { Button } from "../emulator/gameboy";
import type { GameVersion, SpeciesData } from "../rom/types";
import type { BattlerHp, BoxRam, GameState, MemoryReader, MemoryWriter, Position, RomAccess } from "./types";

export interface GameAdapter {
  /** The game this adapter reads ("gen1"), and the version of it. */
  readonly game: string;
  readonly version: GameVersion;

  // ---- Memory → state ----

  /** The whole state the tracker and the rules judge, read from memory. */
  readGameState(mem: MemoryReader): GameState;
  /** Where the player is and whether a battle is on, cheaply (read after every step). */
  position(mem: MemoryReader): Position;
  /** Both battlers' names and HP, read between battle messages to say what each hit did (null outside battle). */
  readBattleHp(mem: MemoryReader): { you: BattlerHp; foe: BattlerHp } | null;
  /** The first rival battle has been fought (won or lost). */
  firstRivalBattleFought(mem: MemoryReader): boolean;
  /** The opening scene is done: the professor led the player into his lab (for the hint tool). */
  ledIntoLab(mem: MemoryReader): boolean;
  /** The current map's id. */
  currentMap(mem: MemoryReader): number;
  /** The cursor's position in the menu on screen (get_state's menuCursor). */
  menuCursor(mem: MemoryReader): number;
  /** Whether the CPU running at `pc` means the game crashed (a runaway into RAM or a vector the game never calls). */
  crashedAt(pc: number): boolean;
  /** Which bag pocket is open (0-based), for a game whose bag has pockets; absent otherwise. */
  bagPocket?(mem: MemoryReader): number;
  /** The current map's size in squares. */
  mapSize(mem: MemoryReader): { w: number; h: number };
  /** Poisoned party members by uid (as MonState.uid), with their slot and HP: cheap enough to check after every step. */
  poisonedParty(mem: MemoryReader): Map<string, { slot: number; hp: number; maxHp: number }>;

  // ---- The screen ----

  /** What VRAM holds while the game's text font is loaded (passed back to readScreenText). */
  fontSignature(rom: Uint8Array): Uint8Array;
  /**
   * The screen decoded as text, line by line, or one line saying why there's none. The game's own
   * glyphs come out as the shared ones the bridge reads: ▶ the menu cursor, ▷ the cursor of a menu
   * with another open over it, ▼ more text to come, ┌ ─ ┐ │ └ ┘ text-box borders.
   */
  readScreenText(mem: MemoryReader, fontSig?: Uint8Array): string[];
  /** Where things are on the screen and what the menus the bridge works are labelled. */
  readonly screen: ScreenLayout;

  // ---- The overworld ----

  /** The map is dark: a player sees only part of it (see renderDarkView). */
  isDark(mem: MemoryReader): boolean;
  /** The visible screen as a text map (from the map data when the ROM is given). */
  readView(mem: MemoryReader, playerX: number, playerY: number, beaten: number[], rom: Uint8Array | null): OverworldView;
  /** The whole current map as a text map, with its exits and doors. */
  readFullMap(mem: MemoryReader, rom: Uint8Array, playerX: number, playerY: number, beaten: number[]): OverworldView;
  /** Trainer people on the current map (map coordinates; only reliable while on screen). */
  trainerSprites(mem: MemoryReader, playerX: number, playerY: number): TrainerSprite[];
  /** Which trainer a map sprite is: its class and its number in that class. */
  spriteTrainer(mem: MemoryReader, sprite: number): { trainerClass: number; number: number };
  /** A trainer's party as the ROM has it (null when there's no such trainer). */
  trainerParty(rom: Uint8Array, trainerClass: number, number: number): { species: number; level: number }[] | null;
  /** Map constant names (pret's), by map id. */
  readonly mapConstants: string[];

  // ---- Static game data ----

  readonly data: GameData;
  /** The field moves (HMs) a species can learn, read from the ROM. */
  hmsLearnable(rom: Uint8Array, species: SpeciesData | undefined): string[];

  // ---- The harness's interventions (recorded by name and re-done on playback) ----

  /** Keeps 99 of an item in the bag (the infinite Rare Candies option). Called every frame. */
  topUpItem(mem: MemoryWriter, item: number): void;
  /**
   * Moves party slot `slot` (not the only Pokémon) into the last PC box: a dead Pokémon's grave.
   * Only for playing back older recordings (KIND_BURY): nothing live calls it any more.
   */
  buryInLastBox(gb: MemoryWriter & BoxRam, slot: number): "box" | "full";
  /** The level experience and Rare Candies stop at in the loaded ROM (data.maxLevel when no cap is set). */
  levelCapInRom(gb: RomAccess): number;
  /** Makes `level` the highest level experience and Rare Candies can reach (the hard level caps option). */
  setLevelCapInRom(gb: RomAccess, level: number): void;
  /** The level Rare Candies alone currently stop at. */
  candyCapInRom(gb: RomAccess): number;
  /** Makes `level` the highest level Rare Candies alone can reach. */
  setCandyCapInRom(gb: RomAccess, level: number): void;
}

/** A battle-menu option: its label on screen and where it sits on the menu's 2×2 grid ([column, row]). */
export interface MenuSpot {
  label: string;
  at: [number, number];
}

/** The battle menu's four options, by what they do. */
export type BattleAction = "fight" | "party" | "bag" | "run";

export interface ScreenLayout {
  /** The bottom text box: the screen rows of its top and bottom borders (its text is on the rows between). */
  textBox: { top: number; bottom: number };
  /** The battle menu. */
  battleMenu: Record<BattleAction, MenuSpot>;
  /** The start menu's entries the bridge opens (the party, the bag), and one that shows it's open. */
  startMenu: { party: string; bag: string; dex: string; exit: string };
  /** The party screen: the rows its entries use, and the party slot (0-based) the cursor on a row points at. */
  partyScreen: { rows: number; slotAt(row: number): number };
  /** The battle's move list: the rows its cursor can be on, the rows of its moves, and text only it shows. */
  moveList: { rows: [number, number]; moves: [number, number]; marker: string };
  /**
   * The naming keyboard: letters per row (A–Z, row by row), the screen row showing the name typed
   * so far, and the buttons that confirm it (Gen 1: START; Gen 2: START puts the cursor on END, then A).
   */
  keyboard: { lettersPerRow: number; nameRow: number; confirm: Button[] };
  /** A species' encyclopedia page (after a new catch): two labels shown together only there. */
  dexEntry: { labels: [string, string] };
  /** The game reserve's battle menu (its own balls, not the bag's): two labels shown together only there. */
  safariMenu: { labels: [string, string] };
  /** How many pockets the bag shows one at a time (left/right switches pocket): 1 in Gen 1, 4 in Crystal. */
  bagPockets: number;
  /** The balls throw_ball offers, by the short name the model gives → the item's name in the bag. */
  balls: Record<string, string>;
  /** What the game says when a field move has nothing to be used on. */
  fieldMoveRefused: RegExp;
  /** The game's own wording the bridge reads, per game (each matched against a line or the joined text). */
  texts: GameTexts;
}

/** Lines of the game's text the bridge recognises. */
export interface GameTexts {
  /** A ball caught it (one line: "X was" / "caught!", Crystal's "Gotcha! X" / "was caught!"). */
  caught: RegExp;
  /** The party screen asks for the next Pokémon to send out (after a faint, or for a switch). */
  choosePokemon: RegExp;
  /** A move-learning question, its follow-up included (make room / delete a move / give up learning). */
  moveQuestion: RegExp;
  /** An item or field move refused here and now ("This isn't the time to use that!"). */
  notNow: RegExp;
  /** A TM or HM asks whether to teach it, before the party screen. */
  teachQuestion: RegExp;
}

export interface GameData {
  // Battle mechanics.
  /** Damage multiplier of a move's type against a defender's types (the game's own chart). */
  effectiveness(moveType: string, defenderTypes: string[]): number;
  /** Types whose damaging moves are special. */
  specialTypes: Set<string>;
  /** A status condition's short name (SLP, PSN…), or null when healthy. */
  statusName(status: number): string | null;
  /**
   * Poison can make a Pokémon faint while walking (Gen 1), so each poison hit stops a walk; in
   * Gen 2 it stops at 1 HP and wears off (the game says so in a text box), and walks go on.
   */
  poisonFaintsWhileWalking: boolean;
  /** Whether a status value means poisoned (poison hurts while walking). */
  isPoisoned(status: number): boolean;
  /**
   * A damaging move whose damage is fixed (Seismic Toss, Sonic Boom…): its type matters only for
   * immunity. Gen 1's data marks these with power 1; Gen 2 also gives power 1 to variable-power
   * moves (Magnitude, Return, Hidden Power), which do use the type chart.
   */
  fixedDamage(moveId: number, power: number): boolean;
  /** Experience needed to reach `level` on a growth curve. */
  expForLevel(curve: string, level: number): number;
  /** The highest level there is. */
  maxLevel: number;

  // Progress.
  /** The badges, by number (in the order the game stores them). */
  badges: string[];
  /** The bosses whose top levels are the level caps (the ROM reader reads their levels). */
  bosses: BossTable;

  // Items the harness and the rules know by what they do.
  items: {
    rareCandy: number;
    fullRestore: number;
    /** HP restored by each healing item; Infinity = full heal. */
    healAmounts: Record<number, number>;
    statusHeals: Set<number>;
    ppRestores: Set<number>;
    revives: Set<number>;
    /** Balls (throwing one in battle isn't "using an item"). */
    balls: Set<number>;
  };

  // Places and moments the rules treat specially.
  /** A Pokémon Center: a full heal there is counted as one. */
  isPokecenter(mapConst: string): boolean;
  /** Entering this map means the game is won. */
  isHallOfFame(mapConst: string): boolean;
  /** The League's battles have begun (past the first Elite Four member): the level cap may be passed. */
  leagueUnderway(mapConst: string): boolean;
  /** A battle the game plays to show how catching works: not the player's own (it doesn't use up an area). */
  isDemoBattle(s: GameState): boolean;
  /** The options say battle style Set. */
  battleStyleSet(s: GameState): boolean;
}

/** Trainer class ids (and which of the class's parties) of the bosses, in the order the level caps use. */
export interface BossTable {
  /** Gym leaders in badge order: [class, party index within the class]. */
  gyms: [number, number][];
  /** The Elite Four's classes, in the order they're fought. */
  elite: number[];
  /** The Champion's class (the highest of its parties counts). */
  champion: number;
}
