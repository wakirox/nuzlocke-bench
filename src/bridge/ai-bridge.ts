// Browser side of the MCP bridge. The MCP server (mcp-server/server.mjs) runs a
// WebSocket server on localhost; when "AI control" is on, this page connects
// and executes its requests: { id, method, params } -> { id, result | error }.
//
// Every action returns a compact result (status line + screen text, and a map
// view after walking) so an AI rarely needs screenshots or full state dumps.

import type { Button } from "../emulator/gameboy";
import type { ChallengeMode } from "../rulesets";
import type { Dir } from "./overworld";
import { RouteBook, describeLink, type Routes } from "./routes";
import { KEYS, kv } from "../storage";
import { BRIDGE_WS } from "./endpoint";
import { BridgeCore, DEFAULT_POLICIES, clamp, type AiHost, type Policies } from "./bridge-core";
import { Menus } from "./menus";
import { Travel } from "./travel";
import { Battle } from "./battle";
import { Capture } from "./capture";

export const DEFAULT_BRIDGE_URL = BRIDGE_WS;

export type { AiHost, Brief, MoveInfo, Policies } from "./bridge-core";

const BUTTONS: Button[] = ["up", "down", "left", "right", "a", "b", "start", "select"];
const STEP_OF: Partial<Record<Button, [number, number]>> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
// Retry quickly at first (the MCP server restarts often), then back off to avoid console spam.
const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 5000;

/** Tools that walk the player around (they need the game world loaded). */
const MOVES = new Set(["walk", "walk_to", "travel", "exit_map", "go_to", "fight_trainer", "hunt"]);
/** They find their own way on the map, which a player in the dark can't. */
const NEEDS_SIGHT = new Set(["walk_to", "travel", "exit_map", "go_to", "fight_trainer", "hunt"]);
const TOO_DARK = "It's too dark to find the way from here: walk and press still move you.";

type Status = "off" | "connecting" | "connected" | "error";

const AUTO_RUN_KEY = "autoRun"; // before policies: true meant flee_uncounted
const POLICIES_KEY = "policies";

export class AiBridge {
  private core: BridgeCore;
  private menus: Menus;
  private travel: Travel;
  private battle: Battle;
  private capture: Capture;
  private ws: WebSocket | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private retry = 0;
  private wanted = false;
  private retryDelay = RECONNECT_MIN_MS;

  constructor(
    private host: AiHost,
    private onStatus: (s: Status, detail?: string) => void,
    private url = DEFAULT_BRIDGE_URL,
  ) {
    this.core = new BridgeCore(host);
    this.menus = new Menus(this.core);
    this.travel = new Travel(this.core, this.menus);
    this.battle = new Battle(this.core, this.menus);
    this.capture = new Capture(this.core, this.menus);
    // Policies are remembered (in the disk-backed store) across reloads.
    void Promise.all([kv.get<Partial<Policies>>(POLICIES_KEY), kv.get<boolean>(AUTO_RUN_KEY)]).then(([saved, autoRun]) => {
      if (saved) this.core.policies = { ...DEFAULT_POLICIES, ...saved };
      else if (autoRun) this.core.policies.encounters = "flee_uncounted";
    });
    // The route book belongs to the run (cleared with it), and survives reloads.
    void kv.get<Routes>(KEYS.routes).then((r) => { if (r) this.core.routes = new RouteBook(r); });
  }

  get active(): boolean {
    return this.wanted;
  }

  start(): void {
    this.wanted = true;
    this.connect();
  }

  stop(): void {
    this.wanted = false;
    clearTimeout(this.retry);
    this.ws?.close();
    this.ws = null;
    this.onStatus("off");
  }

  private connect(): void {
    if (!this.wanted) return;
    this.onStatus("connecting", this.url);
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.retryDelay = RECONNECT_MIN_MS;
      this.onStatus("connected");
      ws.send(JSON.stringify({ type: "hello", app: "nuzlocke-bench", version: 2 }));
    };
    ws.onmessage = (ev) => {
      let msg: { id: number; method: string; params?: Record<string, unknown> };
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      // Serialize: one command at a time, in order — and none before the app has booted, or it
      // would act on a page still restoring its run (no game yet, or the wrong position).
      this.queue = this.queue.then(async () => {
        try {
          await this.core.host.booted;
          const result = await this.dispatch(msg.method, msg.params ?? {});
          ws.send(JSON.stringify({ id: msg.id, result }));
        } catch (e) {
          ws.send(JSON.stringify({ id: msg.id, error: (e as Error).message ?? String(e) }));
        }
      });
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.wanted) {
        this.onStatus("error", "MCP server not reachable — retrying…");
        this.retry = window.setTimeout(() => this.connect(), this.retryDelay);
        this.retryDelay = Math.min(this.retryDelay * 1.5, RECONNECT_MAX_MS);
      }
    };
  }

  private async dispatch(method: string, p: Record<string, unknown>): Promise<unknown> {
    // Moving (or reading the map) needs a map: on the title screen or in the intro there isn't one yet.
    if ((MOVES.has(method) || method === "get_map") && this.core.host.position().inWorld === false) {
      throw new Error("The game hasn't started yet (title screen or intro): start_game starts it.");
    }
    if (NEEDS_SIGHT.has(method) && this.core.dark()) throw new Error(TOO_DARK);
    switch (method) {
      case "get_state":
        this.core.host.refresh();
        return this.core.host.summary();
      case "hint_facts": {
        // For the hint tool (mcp-server/hints.mjs): the bag's item ids (get_state names them instead) and
        // whether the first rival battle was fought, from the game itself (a resumed run's log starts later).
        const game = this.core.host.game();
        const gb = this.core.host.gb();
        if (!game || !gb) throw new Error("No game is running.");
        return { bag: game.readGameState(gb).bag.map((b) => b.id), rivalFought: game.firstRivalBattleFought(gb), ledIntoLab: game.ledIntoLab(gb) };
      }
      case "read_screen_text":
        await this.core.alignToVBlank();
        return { lines: this.core.screenText() };
      case "get_screen":
        await this.core.alignToVBlank();
        return { png: this.screenshot(Number(p.scale) || 3), lines: this.core.screenText() };
      case "get_map":
        await this.core.alignToVBlank();
        return this.core.result({ map: this.core.mapText(Boolean(p.full) || this.core.smallMap()) });
      case "exit_map":
        return this.core.withTrainers(p.trainers, () => this.travel.exitMap(String(p.direction) as Dir));
      case "press":
        return this.press(p);
      case "advance_text":
        return this.core.result(await this.menus.advanceText(clamp(Number(p.max_presses) || 30, 1, 80)));
      case "start_game":
        return this.menus.startGame(String(p.name ?? "PLAYER").toUpperCase(), String(p.rival ?? "RIVAL").toUpperCase());
      case "make_lead":
        return this.menus.makeLead(String(p.pokemon ?? ""));
      case "choose":
        return this.menus.choose(String(p.option ?? ""));
      case "rare_candy":
        return this.menus.rareCandy(Number(p.slot), p.level != null ? Number(p.level) : undefined);
      case "walk": {
        // "@goto MAP", "@cut" / "@field SURF"…: shortcuts for tools (also their own tools once the MCP server restarts).
        const path = p.path != null ? String(p.path).trim() : "";
        const errand = /^@(goto|cut|field|fight|hunt)\b\s*(.*)$/i.exec(path);
        if (errand) {
          const [, what, arg] = errand;
          if (/goto|fight|hunt/i.test(what) && this.core.dark()) throw new Error(TOO_DARK);
          if (/fight/i.test(what)) {
            const [x, y] = arg.split(/[\s,]+/).map(Number);
            return this.travel.fightTrainer(x, y);
          }
          if (/hunt/i.test(what)) return this.travel.hunt(clamp(Number(arg) || 300, 10, 2000));
          if (/^cut$/i.test(what)) return this.travel.fieldMove("CUT");
          if (/field/i.test(what)) return this.travel.fieldMove(arg.trim().toUpperCase() || "CUT");
          return this.travel.goTo(arg.trim().toUpperCase());
        }
        return this.travel.walkPath(path || `${p.direction} ${Number(p.tiles) || 1}`);
      }
      case "switch_pokemon":
        return this.battle.switchTo(String(p.pokemon ?? ""));
      case "throw_ball":
        return this.capture.throwBall(p.nickname ? String(p.nickname).toLowerCase() : null, p.ball ? String(p.ball).toLowerCase() : null);
      case "use_item":
        return this.menus.useItem(String(p.item ?? ""), p.pokemon ? String(p.pokemon) : null);
      case "fight_trainer":
        return this.travel.fightTrainer(Number(p.x), Number(p.y));
      case "hunt":
        return this.travel.hunt(clamp(Number(p.max_steps) || 300, 10, 2000));
      case "policies":
        return { policies: this.setPolicies(p) };
      case "field_move":
        return this.travel.fieldMove(String(p.move ?? "CUT").toUpperCase());
      case "go_to":
        return this.core.withTrainers(p.trainers, () => this.travel.goTo(String(p.map ?? "").toUpperCase()));
      case "note_route": {
        const from = String(p.from ?? this.core.mapName()).toUpperCase();
        const to = String(p.to ?? "").toUpperCase();
        this.core.requireMap(from);
        this.core.requireMap(to);
        const door = p.door as { x?: number; y?: number } | undefined;
        const link = this.core.routes.note(from, to, {
          exit: p.exit != null ? String(p.exit) : undefined,
          door: door ? [Number(door.x), Number(door.y)] : undefined,
          push: p.push != null ? String(p.push) : undefined,
        });
        void kv.set(KEYS.routes, this.core.routes.routes);
        return { noted: describeLink(from, to, link), routes: this.core.routes.list().length };
      }
      case "forget_route": {
        const from = String(p.from ?? "").toUpperCase();
        const to = String(p.to ?? "").toUpperCase();
        const forgot = this.core.routes.forget(from, to);
        if (forgot) void kv.set(KEYS.routes, this.core.routes.routes);
        return { forgot, routes: this.core.routes.list().length };
      }
      case "routes":
        return { routes: this.core.routes.list() };
      case "travel":
        return this.core.withTrainers(p.trainers, () => this.travel.travel(String(p.direction) as Dir, clamp(Number(p.max_legs) || 12, 1, 40), clamp(Number(p.maps) || 1, 1, 6)));
      case "walk_to": {
        const [x, y, interact] = [Number(p.x), Number(p.y), Boolean(p.interact)];
        // A PC (P on the map) answers only when faced from the square below it.
        if (interact && this.core.mapChar(x, y) === "P") return this.core.withTrainers(p.trainers, () => this.travel.usePc(x, y));
        return this.core.withTrainers(p.trainers, () => this.travel.walkTo(x, y, interact));
      }
      case "fight":
        return this.battle.fight(p.move as string | number);
      case "wait": {
        await this.core.requireGb().runFrames(clamp(Number(p.frames) || 60, 1, 3600), 8);
        return this.core.result({});
      }
      case "save_state":
        await this.core.host.saveState(String(p.slot ?? "1"));
        return { ok: true };
      case "load_state":
        return { ok: await this.core.host.loadState(String(p.slot ?? "1")) };
      case "milestone_save":
        if (!/^[a-z0-9]{1,20}$/i.test(String(p.id ?? ""))) throw new Error("milestone_save needs a milestone id.");
        await this.core.host.saveMilestone(String(p.id));
        return { ok: true };
      case "new_run": {
        // Under a benchmark preset a run still on the title screen or intro would only be replaced
        // by the same run: say so instead of using up an attempt.
        if (p.refuse_unstarted && this.core.host.version() && (this.core.summary() as { started?: boolean } | null)?.started === false && this.core.host.position().inWorld === false) {
          throw new Error("This run hasn't started yet (title screen or intro): start_game starts it. A new run would be the same run again.");
        }
        if (typeof p.rom === "string") {
          const bin = atob(p.rom);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          await this.core.host.setBaseRom(String(p.rom_name ?? "rom.gb"), bytes);
        }
        await this.core.host.newRun({
          mode: p.mode as ChallengeMode | undefined,
          rareCandies: typeof p.rare_candies === "boolean" ? p.rare_candies : undefined,
          hardLevelCaps: typeof p.hard_level_caps === "boolean" ? p.hard_level_caps : undefined,
          firstRivalFree: typeof p.first_rival_free === "boolean" ? p.first_rival_free : undefined,
          endOnViolation: typeof p.end_on_violation === "boolean" ? p.end_on_violation : undefined,
          lenientRules: Array.isArray(p.lenient_rules) ? p.lenient_rules.map(String) : undefined,
          // null = full game (a preset fixing it); undefined = keep the current run's choice.
          goalBadges: typeof p.goal_badges === "number" ? p.goal_badges : p.goal_badges === null ? 0 : undefined,
        });
        // The page reloads to boot the new run; the server waits for us to reconnect.
        return { reloading: true };
      }
      case "get_rules":
        return { rules: this.core.host.rules() };
      default:
        throw new Error(`Unknown method ${method}`);
    }
  }

  /**
   * Presses a sequence. Each token is a button ("a", "start", "up"), an
   * optional repeat ("down*3"), a chord ("up+b"), or a pause ("wait:30").
   */
  private async press(p: Record<string, unknown>): Promise<unknown> {
    const gb = this.core.requireGb();
    const hold = clamp(Number(p.hold_frames) || 6, 1, 600);
    const gap = clamp(p.wait_frames == null ? 20 : Number(p.wait_frames), 0, 600);
    const raw = Array.isArray(p.buttons) ? p.buttons.map(String) : String(p.buttons ?? "").split(/[\s,]+/);
    const tokens = raw.map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (!tokens.length) throw new Error("No buttons given.");
    if (tokens.length > 64) throw new Error("At most 64 inputs per call.");

    for (const token of tokens) {
      const wait = token.match(/^wait[:=]?(\d+)$/);
      if (wait) {
        await gb.runFrames(clamp(Number(wait[1]), 1, 3600), 8);
        continue;
      }
      // "candy:3:21": Rare Candies on party slot 3 up to Lv21 (the rare_candy tool).
      const candy = token.match(/^candy:([1-6])(?::(\d{1,3}))?$/);
      if (candy) return this.menus.rareCandy(Number(candy[1]), candy[2] ? Number(candy[2]) : undefined);
      // "switch:beaker" / "switch:3": in battle, switch to that party Pokémon.
      const sw = token.match(/^switch:(.+)$/);
      if (sw) return this.battle.switchTo(sw[1]);
      // "ball:echo:great" / "ball::poke": throw that ball, nickname on a catch.
      const ball = token.match(/^ball(?::([a-z]{1,10})?)?(?::(poke|great|ultra|master))?$/);
      if (ball) return this.capture.throwBall(ball[1] ?? null, ball[2] ?? null);
      // "item:super_potion:beaker" / "item:repel": use a bag item outside battle (on a party Pokémon).
      const item = token.match(/^item:([a-z0-9_.é-]+)(?::(.+))?$/);
      if (item) return this.menus.useItem(item[1].replace(/_/g, " "), item[2] ?? null);
      // "name:SPROUT" types a name on an open naming keyboard (e.g. a nickname) and confirms it.
      const name = token.match(/^name:([a-z]{1,10})$/);
      if (name) {
        await this.menus.typeName(name[1].toUpperCase());
        continue;
      }
      const [combo, times] = token.split("*");
      const buttons = combo.split("+") as Button[];
      for (const b of buttons) if (!BUTTONS.includes(b)) throw new Error(`Unknown button "${b}". Use ${BUTTONS.join(", ")}; to type a name on a naming keyboard, name:NAME.`);
      for (let i = 0; i < clamp(Number(times) || 1, 1, 50); i++) {
        if (buttons.length === 1 && this.boulderAhead(buttons[0])) await this.pushBoulder(buttons[0] as Dir);
        else await this.core.tap(buttons, hold, gap);
      }
    }
    // Outside battle and menus a player sees what the press did: the map answers that here too.
    const quiet = this.core.host.position().inWorld !== false && !this.core.host.position().battle
      && !this.core.textBox(this.core.screenText()).open && !this.core.screenText().some((l) => l.includes("▶"));
    if (!quiet) return this.core.result({});
    // A step or a boulder push is still under way when the buttons are let go: report where it ends.
    for (let i = 0, still = 0; i < 60 && still < 12 && !this.core.host.position().battle; i++) {
      const before = this.core.host.position();
      await gb.runFrames(2, 2);
      const after = this.core.host.position();
      still = before.x === after.x && before.y === after.y ? still + 2 : 0;
    }
    return this.core.result(this.core.host.position().battle ? {} : { map: this.core.mapText() });
  }

  /** Whether the square you'd step onto that way holds a boulder (in the overworld, nothing open). */
  private boulderAhead(button: Button): boolean {
    const step = STEP_OF[button];
    const at = this.core.host.position();
    if (!step || at.battle || at.inWorld === false || this.core.textBox(this.core.screenText()).open) return false;
    const v = this.core.view(false);
    return v.grid[v.pr + step[1]]?.[v.pc + step[0]] === "B";
  }

  /**
   * Pushes the boulder ahead as a player does: holds the way until it moves, then lets it finish
   * sliding. The game wants two tries in a row before a boulder moves and ignores a press while
   * the last one slides, so short taps dropped about half the pushes (a run, 2026-11-08). Without
   * Strength, or against a wall, it just doesn't move.
   */
  private async pushBoulder(dir: Dir): Promise<void> {
    const gb = this.core.requireGb();
    gb.setButton(dir, true);
    for (let f = 0; f < 60 && this.boulderAhead(dir); f += 4) await gb.runFrames(4);
    gb.setButton(dir, false);
    // The slide and its dust: a step pressed before they end is dropped too.
    await gb.runFrames(64);
  }

  private setPolicies(p: Record<string, unknown>): Policies {
    if (p.encounters != null) {
      if (p.encounters !== "stop" && p.encounters !== "flee_uncounted") throw new Error("encounters must be stop or flee_uncounted.");
      this.core.policies.encounters = p.encounters;
    }
    if (p.trainers != null) {
      if (p.trainers !== "ignore" && p.trainers !== "avoid") throw new Error("trainers must be ignore or avoid.");
      this.core.policies.trainers = p.trainers;
    }
    void kv.set(POLICIES_KEY, this.core.policies);
    return { ...this.core.policies };
  }

  private screenshot(scale: number): string {
    const s = clamp(Math.round(scale), 1, 6);
    const c = document.createElement("canvas");
    c.width = 160 * s;
    c.height = 144 * s;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.core.host.canvas, 0, 0, c.width, c.height);
    return c.toDataURL("image/png").split(",")[1];
  }
}
