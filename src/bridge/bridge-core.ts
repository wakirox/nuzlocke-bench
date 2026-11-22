// What every part of the bridge shares: access to the host and the Game Boy, button
// taps, screen and text-box reads, the map view and the compact result every action returns.

import type { Button, GameBoy } from "../emulator/gameboy";
import type { GameVersion } from "../rom/types";
import type { ChallengeMode } from "../rulesets";
import type { GameAdapter, ScreenLayout } from "../games/adapter";
import type { BattlerHp, Position } from "../games/types";
import { asRawView } from "./map-lens";
import { DARK_HEADER, boxedSquares, caveFloor, darkSquares, exitsLine, litSquares, trainerList, renderView, sealFromWholeMap, seenPart, windowSquares, type AnyOverworldView, type Door, type FoggedView, type MapTrainer, type RawOverworldView, type SightOptions } from "./overworld";
import { RouteBook } from "./routes";
import type { SeenMaps } from "./seen";

export interface Brief {
  location: string;
  battle: string;
  lead: string | null;
  enemy: string | null;
  outcome: string | null;
}

export interface MoveInfo {
  slot: number;
  name: string;
  pp: number;
}

export interface AiHost {
  /** Settles once the app has booted (a saved run resumed, or setup shown): commands wait for it. */
  booted: Promise<void>;
  gb(): GameBoy | null;
  version(): GameVersion | null;
  /** The running game's adapter (its memory, screen and maps), or null before a run is loaded. */
  game(): GameAdapter | null;
  /** Name-resolved summary of the current game, or null before a run is loaded. */
  summary(): unknown;
  /** One-line-per-field status for action results. */
  brief(): Brief | null;
  /** Rule events logged since the last call ("[severity] text"), so results can show them as they happen. */
  newEvents(): string[];
  /** HP lost to poison while walking since the last call ("NOVA hurt by poison: 7→3/24 HP"). */
  takePoisonHurt(): string[];
  /** Maps entered since the last call, in order (for the run log: milestones passed mid-call). */
  takeMapsEntered(): string[];
  /** The active battler's moves (for fight()). */
  battleMoves(): MoveInfo[];
  /** Freshly re-read state after the game advanced. */
  refresh(): void;
  newRun(opts: { mode?: ChallengeMode; rareCandies?: boolean; hardLevelCaps?: boolean; firstRivalFree?: boolean; endOnViolation?: boolean; lenientRules?: string[]; goalBadges?: number }): Promise<void>;
  /** Loads a base ROM (from the new_run tool's rom_path). */
  setBaseRom(name: string, bytes: Uint8Array): Promise<void>;
  saveState(slot: string): Promise<void>;
  /** Keeps a save for good at a story milestone (the server asks on the call that first reaches it). */
  saveMilestone(id: string): Promise<void>;
  loadState(slot: string): Promise<boolean>;
  /** Why the last autosave failed (null when saves are working). */
  saveProblem(): string | null;
  rules(): string;
  /** Sprite indices of trainers already beaten on this map. */
  beatenTrainers(): number[];
  /** What the run has seen of each map (fog of war), or nothing to hide (a host without one). */
  seen?(): SeenMaps | null;
  /** Trainers on this map (class, beaten, and optionally facing for unbeaten on-screen ones). */
  mapTrainers(includeFacing?: boolean): MapTrainer[];
  /** The running ROM — tileset block data for full-map reads. */
  rom(): Uint8Array | null;
  /** Both battlers' names and HP (null outside battle), to say what each hit did. */
  battleHp(): { you: BattlerHp; foe: BattlerHp } | null;
  /** Cheap read of the player's position (a few bytes). */
  /** `scripted`: a scene has taken the controls (the game ignores the joypad while it moves you). */
  position(): Position;
  /** VRAM pattern of the loaded text font (see the adapter's fontSignature). */
  fontSignature(): Uint8Array | null;
  canvas: HTMLCanvasElement;
}

/**
 * Standing choices the player makes about how walking behaves. The defaults do nothing on
 * the player's behalf: every wild battle stops the walk, and paths are plain shortest paths
 * (which report whose sight they cross).
 */
export interface Policies {
  /** stop: hand every wild battle back. flee_uncounted: run from wild Pokémon that don't count here (Nuzlocke) and walk on. */
  encounters: "stop" | "flee_uncounted";
  /** ignore: shortest paths, crossings reported. avoid: route around unbeaten trainers' sight, stopping short when that's impossible. */
  trainers: "ignore" | "avoid";
}

// Walks go around trainers' sight by default: a trainer battle is the player's choice, never a side effect of a path.
export const DEFAULT_POLICIES: Policies = { encounters: "stop", trainers: "avoid" };

/** The parts of get_state the bridge's commands read. */
export interface Summary {
  run?: { ruleset?: string };
  battle?: string;
  party?: { slot: number; species: string; nickname: string; level: number; hp: number; maxHp?: number; moves?: string[] }[];
  lead?: { slot?: number; species?: string; nickname?: string; level?: number; hp?: number; maxHp?: number } | null;
  bag?: { item: string; qty: number }[];
  enemy?: { species?: string; level?: number } | null;
  nuzlocke?: { thisArea?: string | { species: string; status: string } };
}

export class BridgeCore {
  /** Standing choices about how walking behaves (see Policies). */
  policies: Policies = { ...DEFAULT_POLICIES };
  /** A per-call `trainers` choice, overriding the standing one for that call. */
  trainersOverride: Policies["trainers"] | null = null;
  /** The model's route book for this run (note_route / go_to). */
  routes = new RouteBook();

  constructor(readonly host: AiHost) {}

  sight(): SightOptions {
    return { avoidSight: (this.trainersOverride ?? this.policies.trainers) === "avoid" };
  }

  get fleeUncounted(): boolean {
    return this.policies.encounters === "flee_uncounted";
  }

  /** Runs a path-taking command with this call's own `trainers` choice, if it gave one. */
  async withTrainers<T>(choice: unknown, fn: () => Promise<T>): Promise<T> {
    if (choice != null && choice !== "ignore" && choice !== "avoid") throw new Error("trainers must be ignore or avoid.");
    this.trainersOverride = (choice as Policies["trainers"] | undefined) ?? null;
    try {
      return await fn();
    } finally {
      this.trainersOverride = null;
    }
  }

  /** Maps already shown in full this session: the first result on a new map shows all of it. */
  mapsShown = new Set<number>();
  /** The call being answered asked for the map (get_map, or a move with show_map): a new map is shown whole then. */
  mapAsked = false;
  /** Show a boulder on a previously seen floor switch as `b` (opt-in via NUZLOCKE_BOULDER_SWITCH). */
  boulderSwitch = false;
  /** Include facing direction for unbeaten on-screen trainers (opt-in via NUZLOCKE_TRAINER_FACING). */
  trainerFacing = false;

  async tap(button: Button | Button[], hold = 6, gap = 20): Promise<void> {
    const gb = this.requireGb();
    const buttons = Array.isArray(button) ? button : [button];
    buttons.forEach((b) => gb.setButton(b, true));
    await gb.runFrames(hold);
    buttons.forEach((b) => gb.setButton(b, false));
    if (gap) await gb.runFrames(gap);
    this.noteSeen();
  }

  /** Where noteSeen last saw the player. */
  private seenAt: { map: number; x: number; y: number } | null = null;

  /**
   * Adds what the player sees now to the run's memory of the maps (SeenMaps): the screen around
   * them (not in the dark or a battle), or, when the map changed since the last look, the door gone
   * through (both ends). Called after every press and every step of a walk, since the page's own
   * state poll runs too seldom while the bridge drives the game.
   */
  noteSeen(settled = false, scanSwitches = true): void {
    const seen = this.host.seen?.();
    if (!seen || !this.host.version()) return;
    const p = this.host.position();
    // A battle forgets where you stood: a whiteout's trip to a Pokémon Center isn't a door.
    if (p.battle) {
      this.seenAt = null;
      this.warpedFrom = null;
      return;
    }
    if (p.inWorld === false) return;
    const last = this.seenAt;
    this.seenAt = { map: p.map, x: p.x, y: p.y };
    if (last && last.map !== p.map) {
      // A field move or an item (Dig, Teleport, Fly, an Escape Rope) changes the map without a door,
      // also when the flight it started lands in a later call (the town map left open: flightCalls).
      const flown = this.flightCalls > 0;
      this.flightCalls = 0;
      if (this.mapChangeIsNoDoor || flown) {
        this.warpedFrom = null;
        this.arrivedBy = null;
      } else {
        // Just warped: the coordinates and screen may not be the new map's yet, so the arrival is
        // taken at the next look (now, when the caller knows the game has settled there).
        this.warpedFrom = last;
        if (!settled) return;
      }
    }
    const from = this.warpedFrom;
    if (from) {
      this.warpedFrom = null;
      seen.wentThrough(from.map, from.x, from.y, p.map, p.x, p.y);
      this.arrivedBy = { map: p.map, x: p.x, y: p.y };
    }
    // The square the run first stands on in a map is (0,0) there for the model (SeenMaps.origins).
    seen.originAt(p.map, p.x, p.y);
    if (!from && last && last.x === p.x && last.y === p.y) return;
    if (!this.dark()) {
      seen.sawScreen(p.map, p.x, p.y);
      if (scanSwitches && this.boulderSwitch && this.host.gb()) seen.sawSwitches(p.map, this.rawView(false), p.x, p.y);
    } else if (!from) {
      // In the dark: the square walked onto is floor (the screen is read only when the move is over).
      // Not the one arrived on by a ladder: the move's view keeps that as the ladder (noteDark).
      seen.walkedInDark(p.map, p.x, p.y);
    }
  }

  /** Records uncovered floor switches (`o`) on the current screen (called after a boulder moves in place). */
  noteSwitches(): void {
    if (!this.boulderSwitch || this.dark() || !this.host.version() || !this.host.gb()) return;
    const seen = this.host.seen?.();
    if (!seen) return;
    const p = this.host.position();
    if (p.battle || p.inWorld === false) return;
    seen.sawSwitches(p.map, this.rawView(false), p.x, p.y);
  }

  /** Where the player stood before a warp whose arrival noteSeen hasn't taken yet. */
  private warpedFrom: { map: number; x: number; y: number } | null = null;
  /** The call being answered changes maps by a field move or an item, not a door (set per call). */
  mapChangeIsNoDoor = false;
  /**
   * Calls left in which a map change is a flight, not a door: FLY left its town map open for the
   * model to pick a place with presses, and the flight lands a call or two later (Neon flew from
   * the town map with a press, and both ends were noted as doors, 2026-11-20). Cleared on landing.
   */
  flightCalls = 0;

  /**
   * Where the player came onto the current map through a door (its square on this map). Null after a
   * map change that isn't a door (a flight, Dig, Teleport, an Escape Rope). A battle keeps it: a wild
   * one in a cave doesn't change how you came in, and a whiteout lands on another map (review of #106).
   */
  arrivedBy: { map: number; x: number; y: number } | null = null;

  /** The bottom text box (Gen 1: rows 12–17) if one is on screen, as its text lines. */
  textBox(lines: string[]): { open: boolean; lines: string[] } {
    const { top, bottom } = this.layout.textBox;
    const open = (lines[top] ?? "").startsWith("┌") && (lines[bottom] ?? "").startsWith("└");
    if (!open) return { open: false, lines: [] };
    return {
      open,
      lines: lines
        .slice(top + 1, bottom)
        .map((l) => l.replace(/^│|│$/g, "").replace(/[│▼]/g, "").trim())
        .filter(Boolean),
    };
  }

  /** The text box's rows on screen, borders included (whether a box is open or not). */
  textBoxRows(): string[] {
    const { top, bottom } = this.layout.textBox;
    return this.screenText().slice(top, bottom + 1);
  }

  /**
   * Lets a move end before its result is read: the player stops moving (a step, a ledge hop, the
   * step out of a door), and when the map has changed since `fromMap`, the warp finishes loading.
   * Its new map id shows before the new map's coordinates and screen are in: read then, a press
   * through a gym's door put the gym's square on the city (2026-11-19). True when the map changed.
   * `onSlope`: a walk settling, which holds B on the downhill road (slopeFrames).
   */
  async settleMove(fromMap: number, onSlope = false): Promise<boolean> {
    const gb = this.requireGb();
    const frames = (n: number, perAnimFrame?: number) => (onSlope ? this.slopeFrames(n, perAnimFrame) : gb.runFrames(n, perAnimFrame));
    const still = async () => {
      for (let i = 0, n = 0; i < 60 && n < 12 && !this.host.position().battle; i++) {
        const before = this.host.position();
        await frames(2, 2);
        const after = this.host.position();
        n = before.x === after.x && before.y === after.y ? n + 2 : 0;
      }
    };
    await still();
    if (this.host.position().map === fromMap) return false;
    await frames(120);
    await still();
    return true;
  }

  /** Whether slopeFrames is holding B. */
  private slopeB = false;

  /**
   * Runs frames while a walk holds no direction. On the downhill bike road the game presses Down by
   * itself on every frame with nothing held, so a player riding uphill never lets go: there B is
   * held (it does nothing else while riding), looked at again every 6 frames, and let go as soon
   * as a trainer comes or a text box is open (the game doesn't push then, and a held B would skip
   * the text: a trainer's, a sign's, a Pokémon fainting from poison). Elsewhere these are plain
   * frames, as before. The walk lets go of B when it ends (letGoOfSlope).
   */
  async slopeFrames(frames: number, perAnimFrame = 4): Promise<void> {
    const gb = this.requireGb();
    const pushes = () =>
      !!this.game.forcedDownhill?.(gb) && !this.host.position().battle && !this.textBox(this.screenText()).open;
    if (!this.slopeB && !pushes()) return gb.runFrames(frames, perAnimFrame);
    for (let left = frames; left > 0; left -= 6) {
      const hold = pushes();
      if (hold !== this.slopeB) gb.setButton("b", (this.slopeB = hold));
      await gb.runFrames(Math.min(6, left), perAnimFrame);
    }
  }

  /** Lets go of the B that slopeFrames held, when a walk ends. */
  letGoOfSlope(): void {
    if (!this.slopeB) return;
    this.slopeB = false;
    this.requireGb().setButton("b", false);
  }

  /** Lets letter-by-letter printing finish: waits until the screen stops changing. */
  async settledScreen(): Promise<string[]> {
    const gb = this.requireGb();
    // Ignore the blinking ▼ prompt when deciding whether printing has finished.
    const strip = (s: string[]) => s.join("\n").replace(/▼/g, " ");
    let raw = this.screenText();
    let prev = strip(raw);
    for (let i = 0; i < 30; i++) {
      await gb.runFrames(6, 6); // fast text prints a letter per frame; 6 quiet frames = done
      raw = this.screenText();
      const now = strip(raw);
      if (now === prev) return raw;
      prev = now;
    }
    return raw;
  }

  mapConstants(): string[] {
    return this.host.game()?.mapConstants ?? [];
  }

  mapName(): string {
    const { map } = this.host.position();
    return this.mapConstants()[map] ?? `MAP_${map}`;
  }

  /** Map names are checked so a typo in a noted route fails now, not on a later go_to. */
  requireMap(name: string): void {
    if (!this.host.version()) throw new Error("No game is running.");
    if (!this.mapConstants().includes(name)) throw new Error(`${name} isn't a map name (they look like ROUTE_1 — as in 📍).`);
  }

  /** The map symbol at (x, y) on the whole current map, or undefined. */
  mapChar(x: number, y: number): string | undefined {
    if (!this.host.version() || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    const v = this.view(true);
    return v.grid[y - v.originY]?.[x - v.originX];
  }

  summary(): Summary | null {
    this.host.refresh();
    return this.host.summary() as Summary | null;
  }

  partyMember(which: string): { slot: number; nickname: string; hp: number } {
    const party = this.summary()?.party ?? [];
    const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const mon = /^\d$/.test(which.trim())
      ? party.find((m) => m.slot === Number(which))
      : party.find((m) => norm(m.nickname) === norm(which) || norm(m.species) === norm(which));
    if (!mon) throw new Error(`No "${which}" in the party (${party.map((m) => `${m.slot}=${m.nickname}`).join(", ")}).`);
    return mon;
  }

  /**
   * Waits out a warp out of the map: its animation plays once the menus are closed. Until it's over
   * the old map's still loaded, walks don't move you, and the game has already turned off a dark map's dark.
   */
  async awaitWarp(): Promise<void> {
    const gb = this.requireGb();
    const from = this.host.position().map;
    for (let f = 0; f < 900 && this.host.position().map === from; f += 6) await gb.runFrames(6, 6);
    await gb.runFrames(300); // the landing animation, which ignores the buttons
    // Landed: a map new to the run gets its origin here, so the result's location has coordinates.
    this.noteSeen(true);
  }

  /** The map is dark right now (never in a battle: battles are lit). */
  dark(): boolean {
    const gb = this.host.gb();
    return !!gb && !!this.host.version() && !this.host.position().battle && this.game.isDark(gb);
  }

  /**
   * The visible screen, or the whole current map (needs the ROM for tileset blocks), as the map
   * data has it: everything, seen or not. For the game's own mechanics only (which way a door's mat
   * is pressed); what the player is shown or walks by is view().
   */
  rawView(full: boolean): RawOverworldView {
    const version = this.host.version();
    if (!version) throw new Error("No game is running.");
    const pos = this.host.position();
    const rom = this.host.rom();
    const v = full && rom
      ? this.game.readFullMap(this.requireGb(), rom, pos.x, pos.y, this.host.beatenTrainers(), this.boulderSwitch)
      : this.game.readView(this.requireGb(), pos.x, pos.y, this.host.beatenTrainers(), rom, this.boulderSwitch);
    return asRawView(v);
  }

  /**
   * The screen or the whole map as the run knows it (SeenMaps): squares never on screen are "?",
   * doors not yet been through lead to "?". Paths are planned on this, so a walk can't find a way
   * the player hasn't seen. In the dark it's what the dark view has shown (noteDark, fogDark): walks
   * plan over that and never guess through the dark. The whole map's closed lower-floor patches are
   * sealed before the fog.
   */
  view(full: boolean): FoggedView {
    const raw = this.rawView(full);
    const v = full
      ? sealFromWholeMap(raw, raw)
      : (this.host.rom() ? sealFromWholeMap(raw, this.rawView(true)) : raw);
    const seen = this.host.seen?.();
    if (!seen) return { ...v, stage: undefined };
    // A view is read once a move is over: the game has settled on whatever map it's on (the door
    // just come through is noted, the map's origin set), dark or not.
    // Pass scanSwitches=false so noteSeen doesn't fetch a second rawView; we already have `raw`.
    this.noteSeen(true, false);
    if (this.dark()) {
      this.noteDark(seen);
      return seen.fogDark(v, this.host.position().map, this.game.mapSize(this.requireGb()).h - 1);
    }
    const pos = this.host.position();
    if (!pos.battle) {
      seen.sawScreen(pos.map, pos.x, pos.y);
      if (this.boulderSwitch) seen.sawSwitches(pos.map, raw, pos.x, pos.y);
    }
    return seen.fog(v, pos.map, this.game.mapSize(this.requireGb()).h - 1, { boulderSwitch: this.boulderSwitch });
  }

  /** The screen's view as shown to the player: the whole map's sealed lower-floor patches drawn as rock (sealFromWholeMap). */
  screenView(): FoggedView {
    return this.view(false);
  }

  /**
   * A map no bigger than about two screens (a house, a shop, a Pokémon Center): get_map shows it
   * whole by default, since the screen around you there is mostly wall and can hide half the room.
   */
  smallMap(): boolean {
    const version = this.host.version();
    if (!version || !this.host.rom()) return false;
    const { w, h } = this.game.mapSize(this.requireGb());
    return w * h <= 200;
  }

  /**
   * In the dark: keeps what the dark view shows now (SeenMaps.sawDark). Read when a view is (a move
   * is over, the screen has settled): mid-walk the screen is still scrolling, so its lit squares
   * wouldn't line up with the map's.
   */
  private noteDark(seen: SeenMaps): void {
    const raw = this.rawView(false);
    const whole = this.host.rom() ? this.rawView(true) : null;
    const sealed = whole ? sealFromWholeMap(raw, whole) : raw;
    // A box or menu over the cave hides what's under it: those squares are dark, not lit. So does
    // the window layer: Crystal's place-name sign slides up over the bottom two rows on arrival,
    // a lit box that isn't framed text (the cave under it was noted as seen, 2026-11-20).
    const gb = this.requireGb();
    const boxed = boxedSquares(this.screenText(), !!this.layout.mapTilesReadAsDots);
    const win = windowSquares(gb.read8(0xff40), gb.read8(0xff4a), gb.read8(0xff4b));
    const covered = boxed.map((row, r) => row.map((on, c) => on || win[r][c]));
    const now = darkSquares(sealed, litSquares(this.screenPixels()), covered);
    const pos = this.host.position();
    // The view shows @ where the player stands, but they know what's under them: a ladder (they
    // came by it: stepping onto one takes you away), else floor. Without it, where each move
    // ended would stay "?" once the player walks on.
    const under = whole?.doors?.some((d) => d.x === pos.x && d.y === pos.y)
      ? "D"
      : caveFloor(sealed, sealed.pr, sealed.pc);
    seen.sawDark(pos.map, now.map((row, r) => row.map((ch, c) => (r === sealed.pr && c === sealed.pc ? under : ch))), sealed.originX, sealed.originY);
  }

  /**
   * The (0,0) of `map`'s coordinates as the model sees them: the square the run first stood on
   * there (SeenMaps.origins), so they say nothing about where the map's edges are. Without the
   * run's memory (no fog), the map's own coordinates.
   */
  origin(map = this.host.position().map): [number, number] {
    const seen = this.host.seen?.();
    if (!seen) return [0, 0];
    const known = seen.origin(map);
    if (known) return known;
    const p = this.host.position();
    // A run resumed from before the origins were kept: here is where it first stands now.
    return map === p.map && !p.battle && p.inWorld !== false ? seen.originAt(map, p.x, p.y) : [0, 0];
  }

  /** Map coordinates (x, y) on `map` as the model sees them. */
  shown(x: number, y: number, map?: number): [number, number] {
    const [ox, oy] = this.origin(map);
    return [x - ox, y - oy];
  }

  /** "(x, y)" (or "(x,y)" with `tight`) in the model's coordinates on the current map. */
  at(x: number, y: number, tight = false): string {
    const [sx, sy] = this.shown(x, y);
    return tight ? `(${sx},${sy})` : `(${sx}, ${sy})`;
  }

  /** The model's coordinates (x, y) on `map` as the map's own. */
  fromShown(x: number, y: number, map?: number): [number, number] {
    const [ox, oy] = this.origin(map);
    return [x + ox, y + oy];
  }

  /** Square (x, y) of the map named `name` (as in 📍) as the model sees it: for the route book. */
  readonly shownOn = (name: string, x: number, y: number): [number, number] => {
    const o = this.host.seen?.()?.origin(this.mapConstants().indexOf(name));
    return o ? [x - o[0], y - o[1]] : [x, y];
  };

  /** The model's coordinates (x, y) on the map named `name` as that map's own (a door it notes). */
  fromShownOn(name: string, x: number, y: number): [number, number] {
    const id = this.mapConstants().indexOf(name);
    if (id === this.host.position().map) return this.fromShown(x, y);
    const seen = this.host.seen?.();
    if (!seen) return [x, y];
    const o = seen.origin(id);
    if (!o) throw new Error(`You haven't been on ${name} yet, so it has no coordinates: note its doors once you've been there.`);
    return [x + o[0], y + o[1]];
  }

  /**
   * A view of the current map in the model's coordinates, for renderView: its squares, doors and
   * trainers' sight moved by the map's origin; a door's arrival square in its own map's
   * coordinates, or left out while the run hasn't been there (it has no origin yet).
   */
  shownView<T extends AnyOverworldView>(v: T): T {
    const [ox, oy] = this.origin();
    const maps = this.mapConstants();
    const seen = this.host.seen?.();
    const arrival = (d: Door): Door => {
      if (d.tx == null || d.ty == null || !seen) return d;
      const to = maps.indexOf(d.to);
      const o = to >= 0 ? seen.origin(to) : undefined;
      return o ? { ...d, tx: d.tx - o[0], ty: d.ty - o[1] } : { ...d, tx: null, ty: null };
    };
    return {
      ...v,
      originX: v.originX - ox,
      originY: v.originY - oy,
      doors: v.doors?.map((d) => ({ ...arrival(d), x: d.x - ox, y: d.y - oy })),
      watchers: v.watchers && new Map([...v.watchers].map(([k, who]) => [k, who.map(([x, y]) => [x - ox, y - oy] as [number, number])])),
    };
  }

  /** A view drawn for the model: in its coordinates, and in the dark under the dark's header. */
  drawn(v: FoggedView): string {
    const map = renderView(this.shownView(v));
    return this.dark() ? `${DARK_HEADER}\n${map}` : map;
  }

  mapText(full = false): string {
    if (!this.host.version() || this.host.position().battle) return "(in battle — no map)";
    // No trainers listed in the dark: they're black sprites there.
    if (this.dark()) return this.drawn(full ? seenPart(this.view(true)) : this.screenView());
    const v = full ? seenPart(this.view(true)) : this.screenView();
    const W = v.grid[0]?.length ?? 0;
    const H = v.grid.length;
    const [ox, oy] = this.origin();
    // Only trainers on squares the map shows (a "?" square hides who stands there).
    const trainers = this.host.mapTrainers(this.trainerFacing)
      .filter((t) => t.x >= v.originX && t.x < v.originX + W && t.y >= v.originY && t.y < v.originY + H)
      .filter((t) => v.grid[t.y - v.originY][t.x - v.originX] !== "?")
      .map((t) => ({ ...t, x: t.x - ox, y: t.y - oy }));
    return renderView(this.shownView(v)) + trainerList(trainers);
  }

  /** Compact result: status + screen text (+ any extras). */
  result(extra: Record<string, unknown>): unknown {
    // Only when the map is asked for: a move's map is left out by the MCP server unless show_map, and
    // marking the map shown there used up its first full view before get_map could show it.
    // Not asked for, the map is left out but its exits line stays (format.mjs mapOnRequest): every
    // result carries it until the map has been shown whole (that has the line itself).
    if (typeof extra.map === "string" && this.host.version() && !this.host.position().battle) {
      const map = this.host.position().map;
      if (!this.mapsShown.has(map) && !this.dark()) {
        if (this.mapAsked) {
          this.mapsShown.add(map);
          extra = { ...extra, map: this.mapText(true) };
        } else {
          const exits = exitsLine(this.view(true));
          if (exits) extra = { ...extra, map: `${exits}\n${extra.map}` };
        }
      }
    }
    this.host.refresh();
    const gb = this.requireGb();
    const crashed = this.game.crashedAt(gb.pc)
      ? `The game crashed (CPU executing $${gb.pc.toString(16)}). Load a save state or start a new run.`
      : undefined;
    const save = this.host.saveProblem();
    const saveWarning = save ? `AUTOSAVE FAILING (${save}): progress since the last good save is NOT kept. Stop and fix this before playing on; don't reload the page.` : undefined;
    const status = this.host.brief() as unknown as Record<string, unknown> | null;
    // The location line is always printed, even by an MCP server that predates saveWarning.
    if (saveWarning && status) status.location = `⚠️ AUTOSAVE FAILING — ${String(status.location ?? "?")}`;
    const events = this.host.newEvents();
    const poison = this.host.takePoisonHurt();
    // For the run log only (the MCP server doesn't print it): every map this action passed through.
    const mapsEntered = this.host.takeMapsEntered();
    if (status && mapsEntered.length) status.mapsEntered = mapsEntered;
    return { ...extra, saveWarning, crashed, status, poison: poison.length ? poison : undefined, events: events.length ? events : undefined, screenText: this.screenText() };
  }

  /** VRAM is unreadable mid-scanline; after a reload/state load we may be anywhere in a frame. */
  async alignToVBlank(): Promise<void> {
    const gb = this.requireGb();
    const lcdOn = gb.read8(0xff40) & 0x80;
    if (lcdOn && (gb.read8(0xff41) & 3) !== 1) await gb.runFrames(1);
  }

  screenText(): string[] {
    return this.game.readScreenText(this.requireGb(), this.host.fontSignature() ?? undefined);
  }

  /** The screen as a player sees it right now, 160×144 RGBA. */
  screenPixels(): Uint8ClampedArray {
    this.requireGb().draw();
    const c = document.createElement("canvas");
    c.width = 160;
    c.height = 144;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(this.host.canvas, 0, 0, 160, 144);
    return ctx.getImageData(0, 0, 160, 144).data;
  }

  /** The running game's adapter: its memory, screen and maps. */
  get game(): GameAdapter {
    const game = this.host.game();
    if (!game) throw new Error("No game is running. Start a run first (new_run).");
    return game;
  }

  /** Where things are on the running game's screen. */
  get layout(): ScreenLayout {
    return this.game.screen;
  }

  requireGb(): GameBoy {
    const gb = this.host.gb();
    if (!gb) throw new Error("No game is running. Start a run first (new_run).");
    return gb;
  }
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
}
