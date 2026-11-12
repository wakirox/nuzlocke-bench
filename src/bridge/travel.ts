// Moving around the map: walking, pathfinding to a square, crossing maps, the model's
// own routes, field moves and pacing the grass.

import { cropView, findPath, ledgeTarget, pathFurthest, pathToEdge, renderView, sightCrossings, toSegments, wayBlocker, type Dir } from "./overworld";
import { describeLink } from "./routes";
import { FAST_WATCH, PACED } from "./endpoint";
import { clamp, type BridgeCore } from "./bridge-core";
import type { Menus } from "./menus";

const FRAMES_PER_TILE = 16;
/** Field moves that take you off the map. */
const LEAVES_THE_MAP = new Set(["DIG", "TELEPORT"]);

/**
 * Why a walk stopped short when that's no fault of the route (a text box, a trainer's sight, poison,
 * a scene), from its report ("up 2/6 — stopped: …"); null when it arrived, or found its way blocked
 * (which a wrong route can cause).
 */
export function walkStopReason(walked: string): string | null {
  const stop = /stopped(?: short)?(?: by)?:? ([^;]+?)(?: —|;|$)/.exec(walked)?.[1]?.trim();
  return stop && !/^blocked\b/.test(stop) ? stop : null;
}

export class Travel {
  constructor(private core: BridgeCore, private menus: Menus) {}

  /**
   * Uses a field move (CUT, SURF, STRENGTH, FLASH, FLY…) from the party menu: tries
   * each Pokémon's submenu until one lists it. Face the tree / water first.
   */
  async fieldMove(move: string): Promise<unknown> {
    if (this.core.host.position().battle) throw new Error("Field moves are used outside battle.");
    const party = (this.core.host.summary() as { party?: unknown[] } | null)?.party ?? [];
    await this.menus.openStartMenu();
    await this.menus.choose(this.core.layout.startMenu.party);
    // The party screen fades in; presses during the fade are dropped. Steer by the
    // cursor actually on screen (▶ sits on each entry's HP row: Gen 1's rows 1, 3, 5…).
    const cursor = () => {
      const row = this.menus.partyCursorRow();
      return row >= 0 ? this.core.layout.partyScreen.slotAt(row) : -1;
    };
    const ready = async () => {
      for (let i = 0; i < 20 && cursor() < 0; i++) await this.core.requireGb().runFrames(6, 6);
      return cursor();
    };
    // The submenu box on the right: "▶CUT", "STATS", "SWITCH", "CANCEL".
    const listed = () => this.core.screenText().some((l) => new RegExp(`[│▶ ]${move}\\s*│`).test(l));
    for (let slot = 0; slot < party.length; slot++) {
      for (let tries = 0; tries < 12; tries++) {
        const at = await ready();
        if (at < 0 || at === slot) break;
        await this.core.tap(at < slot ? "down" : "up", 4, 10);
      }
      if (cursor() !== slot) break;
      await this.core.tap("a", 4, 30);
      if (listed()) {
        const used = (await this.menus.choose(move)) as { messages?: string[] };
        const messages = used.messages ?? [];
        if (this.core.layout.fieldMoveRefused.test(messages.join(" "))) {
          // Nothing to use it on: back out of the party screen and the start menu.
          for (let i = 0; i < 4 && this.core.screenText().some((l) => l.includes("▶")); i++) await this.core.tap("b", 4, 20);
          messages.push("(Face the tree/water squarely: the tile in front of you isn't one.)");
        } else if (LEAVES_THE_MAP.has(move) && !this.core.layout.texts.notNow.test(messages.join(" "))) {
          await this.core.awaitWarp();
        }
        return this.core.result({ messages });
      }
      await this.core.tap("b", 4, 20); // close the submenu, try the next one
    }
    for (let i = 0; i < 4; i++) await this.core.tap("b", 4, 20);
    throw new Error(`Nobody in the party can use ${move} here.`);
  }

  /** Follows the routes the model noted, one map at a time, to `target`. Logs the hops. */
  private async travelTo(target: string, log: string[]): Promise<void> {
    for (let hop = 0, retries = 0; hop < 24; hop++) {
      await this.core.alignToVBlank();
      if (this.core.host.position().battle) {
        // Auto-run: leave a wild battle that doesn't count and carry on.
        const fled = this.core.fleeUncounted && retries < 8 ? await this.tryAutoRun() : null;
        if (!fled) throw new Error(`A battle started on the way (${log.join(" → ")}).`);
        log.push(`(ran from ${fled})`);
        retries++;
        hop--;
        continue;
      }
      const here = this.core.mapName();
      if (here === target) return;
      const plan = this.core.routes.plan(here, target);
      if (!plan) {
        const known = this.core.routes.list();
        throw new Error(
          `No noted route from ${here} to ${target}${log.length > 1 ? ` (got as far as ${log.join(" → ")})` : ""}. ` +
          `go_to only follows routes you noted with note_route. Known: ${known.length ? known.join("; ") : "none yet"}.`,
        );
      }
      const next = plan[0];
      const link = this.core.routes.link(here, next)!;
      let walked = "";
      if ("exit" in link) {
        walked = String(((await this.exitMap(link.exit)) as Record<string, unknown>).walk ?? "");
        // Crossing a map edge sometimes stops right at it: take a couple more steps.
        if (this.core.mapName() === here && !this.core.host.position().battle) walked += `; then ${await this.walkSegments([[link.exit, 2]])}`;
      } else {
        const [x, y] = link.door;
        // walk_to also steps off and back onto a ladder you're standing on.
        walked = String(((await this.walkTo(x, y, false)) as Record<string, unknown>).walk ?? "");
        const push = link.push ?? this.edgeOf(x, y);
        if (this.core.mapName() === here && push && !this.core.host.position().battle) {
          await this.core.tap(push as Dir, 16, 50);
        }
      }
      if (this.core.host.position().battle) { hop--; continue; } // handled at the top of the loop
      // Someone talks when you arrive: read it out.
      const text = await this.menus.advanceText(40);
      if (text.messages.length) log.push(`(${text.messages.join(" ")})`);
      if (this.core.mapName() === here) {
        const where = `still on ${here}${log.length > 1 ? `, after ${log.join(" → ")}` : ""}`;
        // Something on the way stopped the walk (a text box, a trainer's sight, poison, a scene):
        // the route isn't at fault, so don't send the player off re-noting a good one. Only a walk
        // that found its way blocked can mean the route is wrong.
        const stop = walkStopReason(walked);
        if (stop) {
          throw new Error(`Stopped on the way (${where}): ${stop}. The route itself is fine: deal with that, then go_to again. The walk: ${walked}.`);
        }
        throw new Error(
          `Your route ${describeLink(here, next, link)} didn't get there (${where}). ` +
          `The walk: ${walked || "nothing"}. If the route is wrong, fix it with note_route or forget_route.`,
        );
      }
      if (this.core.mapName() !== next) log.push(`(expected ${next})`);
      log.push(this.core.mapName());
    }
    throw new Error(`Too many hops (${log.join(" → ")}).`);
  }

  async goTo(map: string): Promise<unknown> {
    if (!map) throw new Error("Which map? e.g. ROUTE_1");
    const log: string[] = [this.core.mapName()];
    await this.travelTo(map, log);
    return this.core.result({ walk: log.join(" → "), map: this.core.mapText() });
  }

  /** Walks a path like "up 3, right 2" or "U3 R2". Stops at battles, warps and walls. */
  async walkPath(path: string): Promise<unknown> {
    const segs = [...path.matchAll(/\b(up|down|left|right|u|d|l|r)\s*(\d+)?/gi)].map(([, d, n]) => {
      const dir = ({ u: "up", d: "down", l: "left", r: "right" } as Record<string, Dir>)[d[0].toLowerCase()];
      return [dir, clamp(Number(n) || 1, 1, 30)] as [Dir, number];
    });
    if (!segs.length) throw new Error('Give a path like "up 3, right 2" (or "U3 R2").');
    const report = await this.walkSegments(segs);
    return this.core.result({ walk: report, map: this.core.mapText() });
  }

  /** The direction out of the map from (x, y) when that square is on the map's edge, else null. */
  /**
   * Which way to press on a door square to go through: the direction the game gives the warp mat
   * (Crystal's carpets), else toward the map edge it sits on (a doormat on the last row).
   */
  private edgeOf(x: number, y: number): Dir | null {
    const v = this.core.view(true);
    const push = v.doors?.find((d) => d.x === x && d.y === y)?.push;
    if (push) return push;
    const h = v.grid.length;
    const w = v.grid[0]?.length ?? 0;
    return y === h - 1 ? "down" : y === 0 ? "up" : x === 0 ? "left" : x === w - 1 ? "right" : null;
  }

  private async walkSegments(segs: [Dir, number][]): Promise<string> {
    const done: string[] = [];
    const ranFrom: string[] = [];
    const ran = () => (ranFrom.length ? ` (ran from ${ranFrom.join(", ")})` : "");
    for (const [dir, n] of segs) {
      let moved = 0;
      let r = await this.walkStraight(dir, n);
      moved += r.moved;
      // Auto-run: leave wild battles that don't count and finish the leg.
      while (r.stopped === "a battle started" && this.core.fleeUncounted) {
        const fled = await this.tryAutoRun();
        if (!fled) break;
        ranFrom.push(fled);
        if (moved >= n) { r = { moved: 0, stopped: "arrived" }; break; }
        r = await this.walkStraight(dir, n - moved);
        moved += r.moved;
      }
      done.push(`${dir} ${moved}/${n}`);
      if (r.stopped !== "arrived") return `${done.join(", ")} — stopped: ${r.stopped}${ran()}`;
    }
    return `${done.join(", ")} — arrived${ran()}`;
  }

  /**
   * Nuzlocke auto-run: if the wild battle that just started doesn't count (area used, dupe,
   * no balls), run from it. Returns the species fled from, or null (it counts, or no escape).
   */
  private async tryAutoRun(): Promise<string | null> {
    const s = this.core.summary();
    if (s?.run?.ruleset !== "nuzlocke" || s.battle !== "wild") return null;
    await this.menus.advanceText(20); // the intro, up to the battle menu
    const now = this.core.summary();
    const area = now?.nuzlocke?.thisArea;
    if (area && typeof area === "object" && area.status === "open") return null; // the area's first encounter: stop here
    const foe = now?.enemy?.species ?? "a wild Pokémon";
    const r = (await this.menus.choose(this.core.layout.battleMenu.run.label)) as { messages?: string[] };
    return (r.messages ?? []).some((m) => /got away/i.test(m)) && !this.core.host.position().battle ? foe : null;
  }

  /** Walks up to the trainer at (x, y), talks, and plays through to the battle menu. */
  async fightTrainer(x: number, y: number): Promise<unknown> {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("@fight X Y: the trainer's map coordinates (see get_map).");
    const walk = (await this.walkTo(x, y, true)) as { walk?: string; messages?: string[] };
    const messages = [...(walk.messages ?? [])];
    for (let i = 0; i < 4 && !this.menus.atBattleMenu(); i++) {
      // A run that ended (e.g. a rule broken on the way) freezes the game: the box would never change.
      if (this.core.host.brief()?.outcome) break;
      const pos = this.core.host.position();
      if (!pos.battle && !pos.battleSoon && !this.core.textBox(this.core.screenText()).open) break;
      messages.push(...(await this.menus.advanceText(30)).messages);
    }
    // Say it when no fight came of it: the result's "battle: none" alone was read as a battle.
    const pos = this.core.host.position();
    const note = !pos.battle && !this.core.host.brief()?.outcome
      ? "No battle started: talking to them didn't start a fight (already beaten, a story battle that isn't due yet, or not a trainer)."
      : undefined;
    return this.core.result({ walk: walk.walk, messages, note, atBattleMenu: this.menus.atBattleMenu() });
  }

  /**
   * Nuzlocke: paces the grass (or a cave floor) until a wild battle starts and stops in it —
   * or, with the encounters policy flee_uncounted, runs from ones that don't count and keeps
   * pacing until one that does.
   */
  async hunt(maxSteps: number): Promise<unknown> {
    const s = this.core.summary();
    if (s?.run?.ruleset !== "nuzlocke") throw new Error("@hunt is for the Nuzlocke (first encounters).");
    if (this.core.host.position().battle) throw new Error("Already in a battle.");
    const area = s.nuzlocke?.thisArea;
    if (area && typeof area === "object") throw new Error(`This area's encounter is already used (${area.species} ${area.status}).`);
    if (typeof area === "string" && /dupe|no grass/.test(area)) throw new Error(`Nothing to hunt here: ${area}.`);
    // Pace between two neighbouring encounter squares: grass, or any open floor in a cave.
    const v = this.core.view(true);
    const H = v.grid.length;
    const W = v.grid[0].length;
    const hasGrass = v.grid.some((row) => row.includes('"'));
    const ok = (c: number, r: number) => r >= 0 && r < H && c >= 0 && c < W && (hasGrass ? v.grid[r][c] === '"' : v.grid[r][c] === ".") && !(this.core.sight().avoidSight && v.watched?.has(r * W + c));
    const DIRS: [Dir, number, number][] = [["left", -1, 0], ["right", 1, 0], ["up", 0, -1], ["down", 0, 1]];
    const pairAt = (c: number, r: number) => (ok(c, r) ? DIRS.find(([, dx, dy]) => ok(c + dx, r + dy)) : undefined);
    let log = "";
    const pairHere = () => {
      const here = this.core.host.position();
      const vv = this.core.view(true);
      return pairAt(here.x - vv.originX, here.y - vv.originY);
    };
    // Walk to the nearest encounter square that has a neighbour to pace to (a walk can stop
    // short — a ledge, someone in the way — so try again from wherever it ended).
    for (let attempt = 0; attempt < 4 && !pairHere(); attempt++) {
      const vv = this.core.view(true);
      const cands: [number, number][] = [];
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (pairAt(c, r)) cands.push([c, r]);
      cands.sort((a, b) => Math.abs(a[0] - vv.pc) + Math.abs(a[1] - vv.pr) - (Math.abs(b[0] - vv.pc) + Math.abs(b[1] - vv.pr)));
      let reached = false;
      for (const [c, r] of cands.slice(0, 12)) {
        const route = findPath(vv, c + vv.originX, r + vv.originY, this.core.sight());
        if (!route || route.sightStop) continue;
        log = await this.walkSegments(toSegments(route.dirs));
        reached = true;
        break;
      }
      if (!reached) throw new Error(this.core.sight().avoidSight ? "No grass (or cave floor) reachable without crossing a trainer's sight (trainers: avoid)." : "No grass (or cave floor) reachable.");
      if (this.core.host.position().battle) return this.huntBattle(log, 0);
      // Someone stopped you to talk (a trainer who saw you): that's the walk's result, not a failure.
      if (this.core.textBox(this.core.screenText()).open) return this.core.result({ walk: `on the way to the grass: ${log}`, map: this.core.mapText() });
    }
    const first = pairHere();
    if (!first) throw new Error(`Couldn't reach the grass (${log || "no route"}).`);
    const opposite: Record<Dir, Dir> = { left: "right", right: "left", up: "down", down: "up" };
    let dir: Dir = first[0];
    const fled: string[] = [];
    for (let step = 0; step < maxSteps; step++) {
      const r = await this.walkStraight(dir, 1);
      if (r.stopped === "a battle started") {
        const out = await this.huntBattle(log, step + 1, fled);
        if (out) return out;
        continue; // ran from a dupe: keep pacing
      }
      if (r.stopped === "entered a new map") return this.core.result({ walk: `left the map while pacing (${step + 1} steps; ran from ${fled.join(", ") || "nothing"})`, map: this.core.mapText() });
      dir = opposite[dir];
    }
    return this.core.result({ walk: `${maxSteps} steps, nothing that counts yet (ran from ${fled.join(", ") || "nothing"})`, map: this.core.mapText() });
  }

  /** A battle during @hunt: stop in it, unless the player's policy is to flee ones that don't count (null = ran, keep hunting). */
  private async huntBattle(log: string, steps: number, fled: string[] = []): Promise<unknown | null> {
    const intro = await this.menus.advanceText(20);
    const s = this.core.summary();
    const area = s?.nuzlocke?.thisArea;
    const foe = s?.enemy?.species ?? "?";
    if (area && typeof area === "object" && area.status === "open") {
      const ran = fled.length ? `; ran from ${fled.join(", ")}` : "";
      return this.core.result({ walk: `${foe} Lv${s?.enemy?.level ?? "?"} — this area's first encounter (${steps} steps${ran})`, messages: intro.messages });
    }
    if (!this.core.fleeUncounted) {
      const why = typeof area === "string" ? area : area && typeof area === "object" ? `area's encounter already ${area.status}` : "doesn't count here";
      return this.core.result({ walk: `${foe} Lv${s?.enemy?.level ?? "?"} — doesn't count for this area (${why}) (${steps} steps)`, messages: intro.messages });
    }
    const r = (await this.menus.choose(this.core.layout.battleMenu.run.label)) as { messages?: string[] };
    if (this.core.host.position().battle) {
      return this.core.result({ walk: `couldn't run from ${foe} — fight or try RUN again`, messages: [...intro.messages, ...(r.messages ?? [])] });
    }
    fled.push(foe);
    return null;
  }

  /**
   * Holds a direction and watches the player's coordinates, stopping after
   * `tiles` steps, at a wall (no movement for a while), on a map change, or
   * when a battle starts.
   */
  private async walkStraight(dir: Dir, tiles: number): Promise<{ moved: number; stopped: string }> {
    const gb = this.core.requireGb();
    let last = this.core.host.position();
    let moved = 0;
    let idle = 0;
    let stopped = "arrived";
    // The screen flashes each time poison hurts a Pokémon while walking: where poison can make it
    // faint (Gen 1), every flash stops the walk and says so, as a player sees each one. Where it
    // can't (Crystal: it stops at 1 HP), the walk goes on and the result's Poison line has the damage.
    const poisonAtStart = this.core.game.data.poisonFaintsWhileWalking ? this.poisoned() : new Map();
    gb.setButton(dir, true);
    let drawn = performance.now();
    try {
      for (let frame = 0; moved < tiles; frame++) {
        await gb.runFrames(1, 1);
        // Yield to rendering every other frame so viewers see the walk at ~2× speed; watched at full
        // speed (FAST_WATCH), only once a screen refresh's worth of time has gone by.
        if (!document.hidden && PACED && (FAST_WATCH ? performance.now() - drawn > 12 : frame % 2)) {
          await new Promise((r) => requestAnimationFrame(r));
          drawn = performance.now();
        }
        const p = this.core.host.position();
        if (p.battle) { stopped = "a battle started"; break; }
        if (p.map !== last.map) { stopped = "entered a new map"; break; }
        if (p.x !== last.x || p.y !== last.y) {
          moved++;
          idle = 0;
          last = p;
          const hurt = [...this.poisoned()].find(([uid, now]) => now.hp < (poisonAtStart.get(uid)?.hp ?? now.hp));
          if (hurt) {
            const [uid, now] = hurt;
            const name = this.core.summary()?.party?.[now.slot]?.nickname ?? `party slot ${now.slot + 1}`;
            stopped = `${name} is hurt by poison (${poisonAtStart.get(uid)!.hp}→${now.hp}/${now.maxHp} HP)`;
            // The step that hurt can be the one onto a ladder or door: let that warp happen, so the
            // walk ends on the new map (the damage is in the result's Poison line either way).
            gb.setButton(dir, false);
            for (let f = 0; f < 150 && !this.core.host.position().battle; f += 6) {
              await gb.runFrames(6, 6);
              if (this.core.host.position().map !== last.map) {
                stopped = "entered a new map";
                break;
              }
            }
            break;
          }
        } else if (++idle > FRAMES_PER_TILE * 2) {
          // An open text box holds the player in place until it's closed; say so, with its text
          // (once it has finished printing).
          const box = this.core.textBox(await this.core.settledScreen());
          if (!box.open) {
            // A trainer who has seen you walks over before anything shows: give that a moment,
            // so the walk says what happened instead of "blocked". (The direction is let go first.)
            gb.setButton(dir, false);
            for (let f = 0; f < 90 && !this.core.host.position().battle; f += 6) {
              await gb.runFrames(6, 6);
              const later = this.core.textBox(this.core.screenText());
              if (later.open) {
                stopped = `stopped by a scripted event: a text box opened${later.lines.length ? ` ("${later.lines.join(" ")}")` : ""} (a trainer who saw you, or a scene) — advance_text reads it`;
                break;
              }
            }
            if (stopped === "arrived" && this.core.host.position().battle) stopped = "a battle started";
            if (stopped !== "arrived") break;
          }
          stopped = box.open
            ? `a text box is open${box.lines.length ? ` ("${box.lines.join(" ")}")` : ""} — advance_text closes it`
            : "blocked (wall, person, or a scripted event)";
          break;
        }
      }
    } finally {
      gb.setButton(dir, false);
    }
    // Warps fade out/in and load the new map; give that time to finish so the
    // returned coordinates and map view are the new map's.
    await gb.runFrames(stopped === "entered a new map" ? 120 : 4);
    {
      // Wait until the player stops moving: ledge hops finish on their own, and
      // leaving through a door the game walks you one step out.
      for (let i = 0, still = 0; i < 60 && still < 12; i++) {
        const before = this.core.host.position();
        await gb.runFrames(2, 2);
        const after = this.core.host.position();
        still = before.x === after.x && before.y === after.y ? still + 2 : 0;
      }
    }
    return { moved, stopped };
  }

  /** Walks to the square below a PC, faces it and switches it on. */
  async usePc(x: number, y: number): Promise<unknown> {
    const walk = (await this.walkTo(x, y + 1, false)) as Record<string, unknown>;
    const here = this.core.host.position();
    if (here.x !== x || here.y !== y + 1) return walk; // didn't get there: the walk says why
    await this.core.tap("up", 6, 12);
    await this.core.tap("a", 4, 24);
    const text = await this.menus.advanceText(30);
    return this.core.result({ walk: `${String(walk.walk ?? "")}, facing up at the PC`, messages: text.messages, stopped: text.stopped });
  }

  /** Pathfinds to (x, y) on the whole current map; optionally faces and talks to what's there. */
  async walkTo(x: number, y: number, interact: boolean): Promise<unknown> {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("x and y are required (map coordinates, see get_map).");
    const version = this.core.host.version();
    if (!version) throw new Error("No game is running.");
    await this.core.alignToVBlank();
    let here = this.core.host.position();
    if (here.battle) throw new Error("Can't walk during a battle.");
    const startMap = here.map;
    // Plan on the whole map; re-plan if someone walks into the way (people are only known on screen).
    const full = this.core.view(true);
    const ledge = ledgeTarget(full, x, y);
    if (ledge) throw new Error(ledge);
    let route = findPath(full, x, y, this.core.sight());
    const crossed = route?.crosses ?? [];
    if (!route) {
      // Say which kind of "no": a wall, off the map, or walkable but in a part you can't walk to from here.
      const at = full.grid[y - full.originY]?.[x - full.originX];
      const by = at == null || at === "#" || (at === "~" && !full.surfing) ? null : wayBlocker(full, x, y);
      const why = at == null ? "it's outside this map"
        : at === "#" ? "that square is solid"
        : at === "~" && !full.surfing ? "that square is water"
        : `it's on this map, but no walk from where you stand reaches it${by ? `: ${by.what} is in the way` : ""}`;
      // The screen, grown to take in the target and what's in the way when they're off it: a map
      // that names a square it doesn't show reads as wrong (a boulder below the screen, 2026-11-08).
      const screen = this.core.view(false);
      const sx1 = screen.originX + (screen.grid[0]?.length ?? 1) - 1, sy1 = screen.originY + screen.grid.length - 1;
      const xs = [x, ...(by ? [by.x] : [])], ys = [y, ...(by ? [by.y] : [])];
      const offScreen = at != null && xs.some((px, i) => px < screen.originX || px > sx1 || ys[i] < screen.originY || ys[i] > sy1);
      const shown = offScreen
        ? cropView(full, Math.min(screen.originX, ...xs.map((px) => px - 1)), Math.min(screen.originY, ...ys.map((py) => py - 1)),
          Math.max(sx1, ...xs.map((px) => px + 1)), Math.max(sy1, ...ys.map((py) => py + 1)))
        : screen;
      throw new Error(`No path to (${x}, ${y}): ${why}.\n${renderView(shown)}`);
    }
    let report = "already there";
    for (let attempt = 0; route && route.dirs.length && attempt < 4; attempt++) {
      report = await this.walkSegments(toSegments(route.dirs));
      here = this.core.host.position();
      if (!report.includes("blocked") || here.battle || here.map !== startMap) break;
      await this.core.requireGb().runFrames(30, 8); // let the person move along, then re-plan
      route = findPath(this.core.view(true), x, y, this.core.sight());
    }
    // A trainer seen only off screen is assumed to look every way; once it is on screen its real
    // facing is known, so walking up to the sight line often clears it. Re-plan from there.
    for (let again = 0; route?.sightStop && route.dirs.length && again < 6; again++) {
      here = this.core.host.position();
      if (here.battle || here.map !== startMap) break;
      // The last leg stopped for something else (a poison flash, a text box): say so, don't walk on.
      if (!/— arrived(?: \(ran from [^)]*\))?$/.test(report)) break;
      const next = findPath(this.core.view(true), x, y, this.core.sight());
      if (!next) break;
      route = next;
      if (!route.dirs.length) break;
      report = await this.walkSegments(toSegments(route.dirs));
    }
    if (!route) report += " (no path any more)";
    if (route?.sightStop) {
      const [sx, sy] = route.sightStop;
      return this.core.result({
        walk: `${route.dirs.length ? report.replace(/ — arrived$/, "") + " — " : ""}stopped short: the only way on crosses an unbeaten trainer's sight at (${sx}, ${sy})${this.whoWatches(sx, sy)}. walk_to that trainer (interact) to fight it on purpose, or choose another target.`,
        map: this.core.mapText(),
      });
    }
    // A doormat at the map's edge takes you out only when you press toward the edge: do that. With
    // interact too: on a door square there's nothing to talk to, so going through is what's meant.
    if (route && /arrived|already there/.test(report) && !this.core.host.position().battle && this.core.host.position().map === startMap) {
      const here2 = this.core.host.position();
      const onDoor = here2.x === x && here2.y === y && !!this.core.view(true).doors?.some((d) => d.x === x && d.y === y);
      const out = onDoor ? this.edgeOf(x, y) : null;
      if (out) {
        await this.core.tap(out, 16, 50);
        await this.core.requireGb().runFrames(120, 30);
        if (this.core.host.position().map !== startMap) return this.core.result({ walk: `${report}, then ${out} through the door, now on ${this.core.mapName()}`, map: this.core.mapText() });
      }
      const still = this.core.host.position();
      if (onDoor && report === "already there" && !still.battle && still.map === startMap && still.x === x && still.y === y) {
        // Arrived on a ladder or stairs: the warp fires only when you step onto it, so step off and back on.
        const opposite: Record<Dir, Dir> = { left: "right", right: "left", up: "down", down: "up" };
        for (const d of ["down", "up", "left", "right"] as Dir[]) {
          const off = await this.walkSegments([[d, 1]]);
          const p = this.core.host.position();
          if (p.battle || p.map !== startMap) return this.core.result({ walk: `stepping off the warp: ${off}`, map: this.core.mapText() });
          if (p.x === x && p.y === y) continue;
          const back = await this.walkSegments([[opposite[d], 1]]);
          await this.core.requireGb().runFrames(120, 30);
          return this.core.result({ walk: `stepped ${d} off the warp and back on: ${back}`, map: this.core.mapText() });
        }
      }
    }
    let messages: string[] | undefined;
    // Arrived, even if the walk ran from a wild battle on the way ("— arrived (ran from MONA)").
    if (route && (/— arrived(?: \(ran from [^)]*\))?$/.test(report) || report === "already there")) {
      if (route.face) {
        await this.core.tap(route.face, 6, 12); // long enough to register a turn
        report += `, facing ${route.face}`;
      }
      if (interact) {
        await this.core.tap("a", 4, 24);
        messages = (await this.menus.advanceText(30)).messages;
      }
    }
    const sightNote = crossed.length ? ` (path crosses the sight of unbeaten trainers: ${this.describeCrossings(crossed)})` : "";
    return this.core.result({ walk: report + sightNote, messages, map: this.core.mapText() });
  }

  /**
   * Heads in a direction across the map: repeatedly walks to the visible
   * square furthest that way (routing around walls and ledges) until a new
   * map, a battle, a scripted stop, or a dead end.
   */
  async travel(dir: Dir, maxLegs: number, maps = 1): Promise<unknown> {
    const version = this.core.host.version();
    if (!version) throw new Error("No game is running.");
    const legs: string[] = [];
    let why = "leg limit reached";
    let entered = 0;
    for (let i = 0; i < maxLegs * maps; i++) {
      await this.core.alignToVBlank();
      const here = this.core.host.position();
      if (here.battle) { why = "a battle started"; break; }
      // The screen first (it shows past the map's edge, so a leg can cross into the next map); when
      // the screen is a dead end that way, the whole map (the way on may lead out of view first).
      let view = this.core.game.readView(this.core.requireGb(), here.x, here.y, this.core.host.beatenTrainers(), this.core.host.rom());
      let route = pathFurthest(view, dir, this.core.sight());
      const rom = this.core.host.rom();
      if (!route && rom) {
        view = this.core.game.readFullMap(this.core.requireGb(), rom, here.x, here.y, this.core.host.beatenTrainers());
        route = pathFurthest(view, dir, this.core.sight());
      }
      if (!route) {
        // Avoiding sight, a way on that only crosses trainers' sight isn't "no way": say whose.
        const through = this.core.sight().avoidSight ? pathFurthest(view, dir, { avoidSight: false }) : null;
        const crosses = through ? sightCrossings(view, through) : [];
        why = crosses.length
          ? `the only way further ${dir} crosses the sight of unbeaten trainers: ${this.describeCrossings(crosses)}. ` +
            "Walk to one (walk_to or fight_trainer) to fight it on purpose, or travel with trainers: ignore"
          : `no way further ${dir} on this map from where you stand — try another direction or get_map`;
        break;
      }
      const crosses = this.core.sight().avoidSight ? [] : sightCrossings(view, route);
      const report = await this.walkSegments(toSegments(route));
      legs.push(report.replace(/ — arrived$/, "") + (crosses.length ? ` (crossed the sight of ${this.describeCrossings(crosses)})` : ""));
      if (!report.endsWith("arrived")) {
        why = report.split(" — stopped: ")[1] ?? "stopped";
        // Crossed into the next map: keep going the same way if asked to cross several.
        if (why === "entered a new map" && ++entered < maps) {
          legs.push(`→ ${this.core.host.brief()?.location ?? "next map"}`);
          continue;
        }
        break;
      }
    }
    return this.core.result({ walk: `${legs.length} legs → ${why}`, map: this.core.mapText() });
  }

  /** Walks to the map's edge in `dir` and steps across into the connected map. */
  async exitMap(dir: Dir): Promise<unknown> {
    if (!["up", "down", "left", "right"].includes(dir)) throw new Error("direction must be up, down, left or right");
    await this.core.alignToVBlank();
    if (this.core.host.position().battle) throw new Error("Can't walk during a battle.");
    const full = this.core.view(true);
    if (full.exits && !full.exits.length) {
      // No edges, only doors. When they all lead to the same place there's nothing to choose:
      // leave through the nearest one. Otherwise which door is the player's call.
      const doors = full.doors ?? [];
      const places = [...new Set(doors.map((d) => d.to))];
      // One way out only if every door lands on the same spot (a building's doormat, maybe two squares
      // wide). A cave's ladders can all go to the next floor, but to parts of it that don't connect.
      const xs = doors.map((d) => d.tx ?? -1);
      const ys = doors.map((d) => d.ty ?? -1);
      const oneSpot = Math.max(...xs) - Math.min(...xs) <= 1 && Math.max(...ys) - Math.min(...ys) <= 1;
      if (places.length === 1 && oneSpot) {
        const here = this.core.host.position();
        const door = [...doors].sort((a, b) => Math.abs(a.x - here.x) + Math.abs(a.y - here.y) - (Math.abs(b.x - here.x) + Math.abs(b.y - here.y)))[0];
        const out = (await this.walkTo(door.x, door.y, false)) as Record<string, unknown>;
        return { ...out, walk: `no edge exits here, so out through the door at (${door.x}, ${door.y}) to ${places[0]}: ${String(out.walk ?? "")}` };
      }
      throw new Error(`This map has no exit ${dir}: leave through a door (D) — walk_to its square to go through it. Doors: ${doors.map((d) => `(${d.x},${d.y}) → ${d.to}${d.tx != null ? ` (${d.tx},${d.ty})` : ""}`).join("; ") || "none seen"}.`);
    }
    if (full.exits && !full.exits.includes(dir)) {
      throw new Error(`This map has no exit ${dir}. Exits: ${full.exits.join(", ")}.`);
    }
    const startMap = this.core.host.position().map;
    const reports: string[] = [];
    // A wandering NPC can block the planned path: wait a moment and re-plan (a few times).
    for (let attempt = 0; attempt < 10; attempt++) {
      const view = attempt ? this.core.view(true) : full;
      const route = pathToEdge(view, dir, this.core.sight());
      if (!route) {
        if (attempt) break;
        throw new Error(`Can't reach the ${dir} edge from here.\n${renderView(view)}`);
      }
      if (route.sightStop) {
        const [sx, sy] = route.sightStop;
        const walked = route.dirs.length ? (await this.walkSegments(toSegments(route.dirs))).replace(/ — arrived$/, "") + " — " : "";
        // Up close the trainer's real facing is known: re-plan before giving up (see walkTo).
        const pos = this.core.host.position();
        if (route.dirs.length && !pos.battle && pos.map === startMap && attempt < 8) {
          reports.push(walked.replace(/ — $/, ""));
          continue;
        }
        reports.push(`${walked}stopped short: the way ${dir} crosses an unbeaten trainer's sight at (${sx}, ${sy})${this.whoWatches(sx, sy)}. walk_to that trainer (interact) to fight it on purpose, or find another way.`);
        break;
      }
      let report = route.dirs.length ? await this.walkSegments(toSegments(route.dirs)) : "at the edge";
      if (report.endsWith("arrived") || report === "at the edge") {
        report += `; crossing: ${await this.walkSegments([[dir, 3]])}`;
      }
      if (route.crosses?.length) report += ` (path crosses the sight of unbeaten trainers: ${this.describeCrossings(route.crosses)})`;
      reports.push(report);
      const pos = this.core.host.position();
      if (pos.map !== startMap || pos.battle || !/blocked/.test(report)) break;
      if (this.core.textBox(this.core.screenText()).open) break; // someone is talking: let the caller read it
      await this.core.requireGb().runFrames(40, 8);
    }
    return this.core.result({ walk: reports.join(" | retry: "), map: this.core.mapText() });
  }

  /** "(8,12) WALKER" for each crossing (names are known in the Nuzlocke). */
  private describeCrossings(crosses: [number, number][]): string {
    const known = this.core.host.mapTrainers();
    return crosses.map(([x, y]) => {
      const t = known.find((k) => k.x === x && k.y === y);
      return `(${x},${y})${t ? ` ${t.name}` : ""}`;
    }).join(", ");
  }

  /** " (watched by the trainer at (63,3) WALKER)" for a square in an unbeaten trainer's sight. */
  private whoWatches(x: number, y: number): string {
    const v = this.core.view(true);
    const w = v.watchers?.get((y - v.originY) * (v.grid[0]?.length ?? 0) + (x - v.originX)) ?? [];
    return w.length ? ` (watched by the trainer at ${this.describeCrossings(w)})` : "";
  }

  /**
   * Poisoned party members by uid (as the tracker's: OT ID + DVs), straight from RAM: cheap
   * enough to check after every step.
   */
  private poisoned(): Map<string, { slot: number; hp: number; maxHp: number }> {
    const gb = this.core.requireGb();
    return this.core.game.poisonedParty(gb);
  }
}
