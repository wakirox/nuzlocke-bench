// What every part of the bridge shares: access to the host and the Game Boy, button
// taps, screen and text-box reads, the map view and the compact result every action returns.

import type { Button, GameBoy } from "../emulator/gameboy";
import type { GameVersion } from "../rom/types";
import type { ChallengeMode } from "../rulesets";
import type { GameAdapter, ScreenLayout } from "../games/adapter";
import type { BattlerHp, Position } from "../games/types";
import { asRawView } from "./map-lens";
import { boxedSquares, exitsLine, litSquares, trainerList, renderDarkView, renderView, sealFromWholeMap, type FoggedView, type RawOverworldView, type SightOptions } from "./overworld";
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
  /** Trainers on this map with their teams. */
  mapTrainers(): { x: number; y: number; name: string; beaten: boolean }[];
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
  noteSeen(settled = false): void {
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
      // A field move or an item (Dig, Teleport, Fly, an Escape Rope) changes the map without a door.
      if (this.mapChangeIsNoDoor) {
        this.warpedFrom = null;
      } else {
        // Just warped: the coordinates and screen may not be the new map's yet, so the arrival is
        // taken at the next look (now, when the caller knows the game has settled there).
        this.warpedFrom = last;
        if (!settled) return;
      }
    }
    if (this.warpedFrom) {
      const from = this.warpedFrom;
      this.warpedFrom = null;
      seen.wentThrough(from.map, from.x, from.y, p.map, p.x, p.y);
    } else if (last && last.x === p.x && last.y === p.y) {
      if (this.boulderSwitch && !this.dark() && this.host.gb()) seen.sawSwitches(p.map, this.rawView(false), p.x, p.y);
      return;
    }
    if (!this.dark()) {
      seen.sawScreen(p.map, p.x, p.y);
      if (this.boulderSwitch && this.host.gb()) seen.sawSwitches(p.map, this.rawView(false), p.x, p.y);
    }
  }

  /** Where the player stood before a warp whose arrival noteSeen hasn't taken yet. */
  private warpedFrom: { map: number; x: number; y: number } | null = null;
  /** The call being answered changes maps by a field move or an item, not a door (set per call). */
  mapChangeIsNoDoor = false;

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
   * the player hasn't seen. In the dark the screen shows only what's lit (renderDarkView) and nothing
   * is remembered. The whole map's closed lower-floor patches are sealed before the fog.
   */
  view(full: boolean): FoggedView {
    const raw = this.rawView(full);
    const v = full
      ? sealFromWholeMap(raw, raw)
      : (this.host.rom() ? sealFromWholeMap(raw, this.rawView(true)) : raw);
    const seen = this.host.seen?.();
    if (!seen) return { ...v, stage: undefined };
    if (!this.dark()) {
      // A view is read once a move is over: the game has settled on whatever map it's on.
      this.noteSeen(true);
      const pos = this.host.position();
      if (!pos.battle) {
        seen.sawScreen(pos.map, pos.x, pos.y);
        if (this.boulderSwitch) seen.sawSwitches(pos.map, raw, pos.x, pos.y);
      }
    }
    const pos = this.host.position();
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

  mapText(full = false): string {
    if (!this.host.version() || this.host.position().battle) return "(in battle — no map)";
    if (this.dark()) {
      // A box or menu over the cave hides what's under it: those squares are dark, not lit.
      const raw = this.rawView(false);
      const sealed = this.host.rom() ? sealFromWholeMap(raw, this.rawView(true)) : raw;
      return renderDarkView(sealed, litSquares(this.screenPixels()), boxedSquares(this.screenText(), !!this.layout.mapTilesReadAsDots));
    }
    const v = full ? this.view(true) : this.screenView();
    const W = v.grid[0]?.length ?? 0;
    const H = v.grid.length;
    // Only trainers on squares the map shows (a "?" square hides who stands there).
    const trainers = this.host.mapTrainers()
      .filter((t) => t.x >= v.originX && t.x < v.originX + W && t.y >= v.originY && t.y < v.originY + H)
      .filter((t) => v.grid[t.y - v.originY][t.x - v.originX] !== "?");
    return renderView(v) + trainerList(trainers);
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
