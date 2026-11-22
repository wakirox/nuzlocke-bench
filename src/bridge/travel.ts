// Moving around the map: walking, pathfinding to a square, crossing maps, the model's
// own routes, field moves and pacing the grass.

import { hasFog, mapHasGrass, planFrontierEdge, planFrontierTarget, seenSteps } from "./map-lens";
import { cropView, findPath, seenPart, ledgeTarget, pairBlocked, pathFurthest, routeEnd, sightCrossings, toSegments, wayBlocker, type AnyOverworldView, type Dir } from "./overworld";
import { describeLink } from "./routes";
import { FAST_WATCH, PACED } from "./endpoint";
import { clamp, type BridgeCore } from "./bridge-core";
import { NAMING_KEYBOARD_OPEN, type Menus } from "./menus";
import { isNamingKeyboardScreen } from "./screen-state";

export { seenSteps };

const FRAMES_PER_TILE = 16;
/** How long a walk waits out a scene that has taken the controls (30 s of game time). */
const SCENE_FRAMES = 1800;
/** A walk_to through unseen squares stops after this many times the straight distance (and at least GUESS_MIN_SQUARES). */
const GUESS_TIMES_STRAIGHT = 3;
const GUESS_MIN_SQUARES = 20;
/** One square each way, for counting a walk's squares on the downhill road (walkStraight). */
const SLOPE_STEP: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
/** hunt, when no square seen has a neighbour of the same kind to pace back and forth to. */
const LONE_SQUARES =
  "No two squares of grass (or cave floor) side by side seen yet, to pace between: explore further (walk, travel), then hunt.";
/** The text matched literally inside a RegExp (a move name comes from the model). */
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A walk leg that got where it was going, perhaps running from a wild battle on the way. */
const ARRIVED = / — arrived(?: \(ran from [^)]*\))?$/;
/** A walk's legs, in order: the ones before the last went where they were planned to, so it's said once. */
const legsSaid = (legs: string[]) => legs.map((l, i) => (i < legs.length - 1 ? l.replace(" — arrived", "") : l)).join("; then ");

/** Field moves that take you off the map. */
const LEAVES_THE_MAP = new Set(["DIG", "TELEPORT"]);
/** Field moves that open the town map to pick a destination. */
const PICKS_A_PLACE = new Set(["FLY"]);

/**
 * Why a walk stopped short when that's no fault of the route (a text box, a trainer's sight, poison,
 * a scene), from its report ("up 2/6 — stopped: …"); null when it arrived, or found its way blocked
 * (which a wrong route can cause).
 */
export function walkStopReason(walked: string): string | null {
  const stop = /stopped(?: short)?(?: by)?:? ([^;]+?)(?: —|;|$)/.exec(walked)?.[1]?.trim();
  return stop && !/^blocked\b/.test(stop) ? stop : null;
}

/**
 * Where an unused area's encounter would count, from its note (summary.ts thisAreaNote): on land
 * (the grass, or a cave's floor), on the water (surfing), both, or neither (no encounters, all dupes).
 */
export function huntableIn(note: string): { land: boolean; water: boolean } {
  if (!/would count/.test(note)) return { land: false, water: false };
  return {
    land: !/would count while surfing|everything in the grass is a dupe/.test(note),
    water: /while surfing/.test(note) && !/everything on the water is a dupe/.test(note),
  };
}

/**
 * The place FLY's town map shows (`lines`: the screen). Gen 1's line reads "To·<TOWN>    ▶▼": the
 * place's name between the two. Crystal's has the question on a line of its own above it ("Where?"
 * / "<TOWN>"), which isn't a place (it said "the places you can fly to are ··Where.", a playtest,
 * 2026-11-22).
 */
export function flyPlace(lines: string[]): string {
  const line = lines.find((l) => /[A-Z]/.test(l) && !/^\W*Where\?\W*$/i.test(l)) ?? "";
  return line.replace(/^\W*To\W+/, "").replace(/^[^A-Za-z0-9]+/, "").replace(/[^A-Za-z0-9.é']+$/, "").trim();
}

/**
 * Whether going from `from` to `to` (same map), after a walk `dir`, was a warp: more than a step off
 * the line walked, or back along it. A slide on ice or a ledge hop only goes on along it.
 */
export function warpedOnMap(dir: Dir, from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  const [sx, sy] = SLOPE_STEP[dir];
  const along = (to.x - from.x) * sx + (to.y - from.y) * sy;
  const across = Math.abs((to.x - from.x) * sy) + Math.abs((to.y - from.y) * sx);
  return across > 1 || along < -1;
}

export class Travel {
  /**
   * Poisoned Pokémon (by uid) the model has acknowledged with ack_poison: walks go on through their
   * poison until it's cured or they faint (a stop every 4 steps cost a call each, 2026-11-19). Each
   * tick is still in the result's Poison line.
   */
  private poisonAcked = new Set<string>();

  constructor(private core: BridgeCore, private menus: Menus) {}

  /**
   * Uses a field move (CUT, SURF, STRENGTH, FLASH, FLY…) from the party menu: tries
   * each Pokémon's submenu until one lists it. Face the tree / water first. FLY with `to` picks
   * that town on the town map and lands there.
   */
  async fieldMove(move: string, to: string | null = null): Promise<unknown> {
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
    const listed = () => this.core.screenText().some((l) => new RegExp(`[│▶ ]${escapeRegExp(move)}\\s*│`).test(l));
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
        } else if (PICKS_A_PLACE.has(move) && !this.core.layout.texts.notNow.test(messages.join(" ")) && !/BADGE/i.test(messages.join(" "))) {
          // The town map is open, its cursor a picture (no ▶ for choose): the place is the player's pick.
          if (to) return this.flyTo(to, messages);
          this.core.flightCalls = 4;
          return this.core.result({ messages, stopped: "the town map is open to pick where to fly: press up/down to move between places (the name shows on screen), a to fly there, b to cancel (or field_move FLY with to, the town's name)" });
        } else if (this.menus.partyCursorRow() >= 0 && this.core.screenText().some((l) => l.includes("▶"))) {
          // A move used on a party member (sharing HP) asks for which one.
          return this.core.result({ messages, stopped: "the party list is open for the move's target: press up/down to the Pokémon, then a (b cancels)" });
        }
        return this.core.result({ messages });
      }
      await this.core.tap("b", 4, 20); // close the submenu, try the next one
    }
    for (let i = 0; i < 4; i++) await this.core.tap("b", 4, 20);
    throw new Error(`Nobody in the party can use ${move} here.`);
  }

  /**
   * On FLY's town map: steps through the places (down) until `to`'s name shows, flies there and
   * waits for the landing. The places are the towns the run has been to; one not among them is
   * said, with the ones that are, and the map is closed.
   */
  private async flyTo(to: string, messages: string[]): Promise<unknown> {
    const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const want = norm(to);
    const place = async () => flyPlace(await this.core.settledScreen());
    const seenPlaces: string[] = [];
    let here = await place();
    for (let i = 0; i < 16 && !norm(here).includes(want); i++) {
      if (here && !seenPlaces.includes(here)) seenPlaces.push(here);
      else if (here && seenPlaces[0] === here && i > 0) break; // round the list once
      await this.core.tap("down", 4, 12);
      here = await place();
    }
    if (!want || !norm(here).includes(want)) {
      // Out of the town map, then the party screen and the start menu, back to walking.
      // Out of the town map, then the party screen and the start menu (each fades), back to walking.
      await this.core.tap("b", 4, 20);
      await this.menus.closeMenus();
      throw new Error(`Can't fly to "${to}": the places you can fly to are ${seenPlaces.join(", ") || "none"}.`);
    }
    await this.core.tap("a", 4, 20);
    await this.core.awaitWarp();
    return this.core.result({ messages, note: `Flew to ${here}.` });
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
        const known = this.core.routes.list(this.core.shownOn);
        throw new Error(
          `No noted route from ${here} to ${target}${log.length > 1 ? ` (got as far as ${log.join(" → ")})` : ""}. ` +
          `go_to only follows routes you noted with note_route. Known: ${known.length ? known.join("; ") : "none yet"}.`,
        );
      }
      const next = plan[0];
      const link = this.core.routes.link(here, next)!;
      let walked: string;
      if ("exit" in link) {
        walked = String(((await this.exitMap(link.exit)) as Record<string, unknown>).walk ?? "");
        // Crossing a map edge sometimes stops right at it: take a couple more steps. Not after a walk
        // that stopped for a reason (a trainer's sight ahead, poison, a text box): those steps would
        // walk straight into it.
        if (this.core.mapName() === here && !this.core.host.position().battle && !walkStopReason(walked)) walked += `; then ${await this.walkSegments([[link.exit, 2]])}`;
      } else {
        const [x, y] = link.door;
        // walk_to also steps off and back onto a ladder you're standing on.
        walked = String(((await this.walkTo(x, y, false)) as Record<string, unknown>).walk ?? "");
        const push = link.push ?? this.edgeOf(x, y);
        if (this.core.mapName() === here && push && !this.core.host.position().battle && !walkStopReason(walked)) {
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
          `Your route ${describeLink(here, next, link, this.core.shownOn)} didn't get there (${where}). ` +
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
    // The hops' own results aren't seen (only their walks are kept): show_map is for the result at
    // the end, so they mustn't use up a map's first full view.
    const asked = this.core.mapAsked;
    this.core.mapAsked = false;
    try {
      await this.travelTo(map, log);
    } finally {
      this.core.mapAsked = asked;
    }
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
    // The game's mechanics, not what the player knows: the raw map.
    const v = this.core.rawView(true);
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
      // A slide downhill that landed as the walk began takes a square off (walkStraight): one that
      // stopped before making it up is no squares the way asked, not fewer than none.
      // A slide is the whole leg's way that way, also across auto-runs (moved counts the leg).
      done.push(`${dir} ${Math.max(0, moved)}/${n}${r.slidPast ? ` (slid on: ${moved + r.slidPast} squares ${dir})` : ""}`);
      if (r.stopped !== "arrived") return `${done.join(", ")} — stopped: ${r.stopped}${ran()}`;
    }
    return `${done.join(", ")} — arrived${ran()}`;
  }

  /**
   * Nuzlocke auto-run: if the wild battle that just started doesn't count (area used, dupe,
   * no balls), run from it. Returns the species fled from, or null (it counts, or no escape).
   */
  private async tryAutoRun(): Promise<string | null> {
    // A walk stops the moment the game is in a battle (or as its last step lands, walkStraight);
    // which kind it is (wild, trainer) can show a few frames later: wait for it before deciding.
    let s = this.core.summary();
    for (let f = 0; f < 60 && s?.battle !== "wild" && s?.battle !== "trainer"; f += 6) {
      await this.core.requireGb().runFrames(6, 6);
      s = this.core.summary();
    }
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
    const where = typeof area === "string" ? huntableIn(area) : { land: true, water: true };
    if (!where.land && !where.water) throw new Error(`Nothing to hunt here: ${area}.`);
    // Pace between two neighbouring encounter squares: water while surfing, else grass, or any open floor in a cave.
    let v = this.core.view(true);
    const H = v.grid.length;
    const W = v.grid[0].length;
    const surfing = !!v.surfing;
    if (surfing && !where.water) throw new Error(`Only the land counts here (${area}): get back on land, then hunt.`);
    if (!surfing && !where.land) throw new Error(`What would count here is on the water (${area}): Surf first (face the water, field_move SURF), then hunt.`);
    // Grass or floor is the map's kind (the whole map, seen or not: a route whose grass isn't in
    // sight yet is still a grass route, not a cave); where to pace is only among what's been seen.
    const hasGrass = mapHasGrass(this.core.rawView(true));
    const square = surfing ? "~" : hasGrass ? '"' : ".";
    // The grid draws you as @: what's under you is the map's own square there (water, while surfing).
    const underYou = () => (surfing ? "~" : (v.beyond?.(v.originX + v.pc, v.originY + v.pr) ?? v.grid[v.pr]?.[v.pc]));
    if (square === '"' && underYou() !== '"' && !v.grid.some((row) => row.includes('"'))) {
      throw new Error("No tall grass seen yet on this map: explore further first, then hunt.");
    }
    // Read from the view as it is now (look): walking to the grass brings more of it into sight.
    const encounterSquare = (c: number, r: number) => (c === v.pc && r === v.pr ? underYou() : v.grid[r][c]) === square;
    // Never pace on a door or warp: stepping on (or off, at a mat on the map's edge) takes you away
    // (hunt right after coming into a cave paced on its entrance mat and walked back out, 2026-11-19).
    // The map's own doors: a mechanics read, not shown to the model.
    const warps = new Set((this.core.rawView(true).doors ?? []).map((d) => `${d.x - v.originX},${d.y - v.originY}`));
    const ok = (c: number, r: number) => r >= 0 && r < H && c >= 0 && c < W && encounterSquare(c, r) && !warps.has(`${c},${r}`) &&
      !(this.core.sight().avoidSight && v.watched?.has(r * W + c));
    const DIRS: [Dir, number, number][] = [["left", -1, 0], ["right", 1, 0], ["up", 0, -1], ["down", 0, 1]];
    // Both ways across: a cliff edge (or Crystal's one-sided wall) between two floor squares can't be paced.
    const paced = (c: number, r: number, nc: number, nr: number) => ok(nc, nr) && !pairBlocked(v, c, r, nc, nr) && !pairBlocked(v, nc, nr, c, r);
    const pairAt = (c: number, r: number) => (ok(c, r) ? DIRS.find(([, dx, dy]) => paced(c, r, c + dx, r + dy)) : undefined);
    let log = "";
    const fled: string[] = [];
    /** The view now: what the walk so far has brought into sight (a lone grass square's neighbours). */
    const look = () => (v = this.core.view(true));
    const pairHere = () => {
      const here = this.core.host.position();
      look();
      return pairAt(here.x - v.originX, here.y - v.originY);
    };
    /** LONE_SQUARES, with the walking done so far when there was some. */
    const loneSquares = () => new Error(log ? `${LONE_SQUARES} (Walked: ${log}.)` : LONE_SQUARES);
    /** Lone squares already walked onto to look around (map coordinates): not walked back to. */
    const looked = new Set<string>();
    // Walk to the nearest encounter square that has a neighbour to pace to (a walk can stop
    // short — a ledge, someone in the way — so try again from wherever it ended).
    for (let attempt = 0; attempt < 4 && !pairHere(); attempt++) {
      // pairHere has just looked: the view is the one now.
      const vv = v;
      const cands: [number, number][] = [];
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (pairAt(c, r)) cands.push([c, r]);
      // Nothing seen to pace between yet, only lone squares (one grass square at the screen's edge, a
      // cave's floor right inside the dark): walk onto one to look around, and look again. hunt said
      // walls or ledges were in the way of grass walk_to then reached (Crystal, 2026-11-20). Each
      // only once: two lone squares that show nothing more were walked between, A B A B.
      const lone = !cands.length;
      if (lone) {
        looked.add(`${vv.pc + vv.originX},${vv.pr + vv.originY}`);
        for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (ok(c, r) && !looked.has(`${c + vv.originX},${r + vv.originY}`)) cands.push([c, r]);
        if (!cands.length) throw loneSquares();
      }
      cands.sort((a, b) => Math.abs(a[0] - vv.pc) + Math.abs(a[1] - vv.pr) - (Math.abs(b[0] - vv.pc) + Math.abs(b[1] - vv.pr)));
      // Nearest first, and on until one is reachable: the nearest can all be behind a one-way ledge
      // with reachable grass further off (only the 12 nearest were tried, 2026-11-19).
      let reached = false;
      let sightInTheWay = false;
      for (const [c, r] of cands.slice(0, 200)) {
        const route = findPath(vv, c + vv.originX, r + vv.originY, this.core.sight());
        if (route?.sightStop) sightInTheWay = true;
        if (!route || route.sightStop) continue;
        log = await this.walkSegments(toSegments(route.dirs, vv));
        reached = true;
        break;
      }
      // No seen way to any of it: try one through unseen squares, as walk_to does (never in the
      // dark). hunt refused grass that walk_to then reached that way (2026-11-19).
      if (!reached) {
        for (const [c, r] of cands.slice(0, 50)) {
          const [gx, gy] = [c + vv.originX, r + vv.originY];
          const guess = planFrontierTarget(vv, gx, gy, this.core.sight(), !this.core.dark());
          if (guess?.sightStop) sightInTheWay = true;
          if (!guess || guess.sightStop) continue;
          log = String(((await this.walkTo(gx, gy, false)) as { walk?: string }).walk ?? "");
          reached = true;
          break;
        }
      }
      // Why not, as it is: a trainer's sight only when one was in the way (it was said for walls
      // and ledges too, with no trainer on the map).
      if (!reached) {
        throw new Error(sightInTheWay
          ? "No grass (or cave floor) reachable without crossing a trainer's sight (trainers: avoid)."
          : "No grass (or cave floor) you've seen can be walked to from here: walls or one-way ledges are in the way.");
      }
      if (this.core.host.position().battle) {
        // Ran from one that doesn't count on the way (flee_uncounted): keep going to the grass.
        const out = await this.huntBattle(log, 0, fled);
        if (out) return out;
        continue;
      }
      // Someone stopped you to talk (a trainer who saw you): that's the walk's result, not a failure.
      if (this.core.textBox(this.core.screenText()).open) return this.core.result({ walk: `on the way to the grass: ${log}`, map: this.core.mapText() });
    }
    const first = pairHere();
    if (!first) {
      // Squares side by side are in sight, and the walks there stopped short (someone in the way,
      // a walk guessed through unseen squares): that, not "none seen".
      let pairSeen = false;
      for (let r = 0; r < H && !pairSeen; r++) for (let c = 0; c < W && !pairSeen; c++) pairSeen = !!pairAt(c, r);
      if (pairSeen) throw new Error(`Couldn't reach the grass (${log || "no route"}).`);
      throw loneSquares();
    }
    const opposite: Record<Dir, Dir> = { left: "right", right: "left", up: "down", down: "up" };
    let dir: Dir = first[0];
    for (let step = 0; step < maxSteps; step++) {
      const { x, y } = this.core.host.position();
      const r = await this.walkStraight(dir, 1);
      // Turn back after every square stepped onto, a battle's included: the battle starts on arrival,
      // and after running from one the next step must head back, not off the pair (onto the shore).
      const to = this.core.host.position();
      const stepped = to.x !== x || to.y !== y;
      if (r.stopped === "a battle started") {
        if (stepped) dir = opposite[dir];
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
   * `tiles` squares (a ledge hop is two), at a wall (no movement for a while),
   * on a map change, or when a battle starts.
   */
  private async walkStraight(dir: Dir, tiles: number): Promise<{ moved: number; stopped: string; slidPast?: number }> {
    // On the naming keyboard a held direction moves its cursor off "A", where press name: starts
    // typing (it can't home the cursor: the keyboard wraps). Don't press anything there.
    if (isNamingKeyboardScreen(this.core.screenText())) return { moved: 0, stopped: NAMING_KEYBOARD_OPEN };
    const gb = this.core.requireGb();
    let last = this.core.host.position();
    const start = last;
    let moved = 0;
    let idle = 0;
    let stopped = "arrived";
    // The screen flashes each time poison hurts a Pokémon while walking: where poison can make it
    // faint (Gen 1), every flash stops the walk and says so, as a player sees each one, until the
    // model acknowledges that Pokémon's poison (ack_poison; it lapses once cured or fainted). Where
    // it can't (Crystal: it stops at 1 HP), the walk goes on and the result's Poison line has the damage.
    const poisonAtStart = this.core.game.data.poisonFaintsWhileWalking ? this.poisoned() : new Map();
    this.dropLapsedAcks();
    // On the downhill road a slide downhill already under way when the walk starts isn't a step the
    // way asked: there only squares that way count, and a square rolled back takes one off.
    const along = this.core.game.forcedDownhill?.(gb) ? SLOPE_STEP[dir] : null;
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
        if (p.map !== last.map || p.x !== last.x || p.y !== last.y) this.core.noteSeen();
        if (p.battle) { stopped = "a battle started"; break; }
        if (p.map !== last.map) { stopped = "entered a new map"; break; }
        if (p.x !== last.x || p.y !== last.y) {
          // Squares moved, the way toSegments counts a planned way: a ledge hop is two, whether the
          // game moves the player there in one update or two.
          moved += along
            ? (p.x - last.x) * along[0] + (p.y - last.y) * along[1]
            : Math.abs(p.x - last.x) + Math.abs(p.y - last.y);
          idle = 0;
          last = p;
          const hurt = [...this.poisoned()].find(([uid, now]) => !this.poisonAcked.has(uid) && now.hp < (poisonAtStart.get(uid)?.hp ?? now.hp));
          if (hurt) {
            const [uid, now] = hurt;
            const name = this.core.summary()?.party?.[now.slot]?.nickname ?? `party slot ${now.slot + 1}`;
            stopped = `${name} is hurt by poison (${poisonAtStart.get(uid)!.hp}→${now.hp}/${now.maxHp} HP; ack_poison and walks go on through it)`;
            // The step that hurt can be the one onto a ladder or door: let that warp happen, so the
            // walk ends on the new map (the damage is in the result's Poison line either way).
            gb.setButton(dir, false);
            for (let f = 0; f < 150 && !this.core.host.position().battle; f += 6) {
              await this.core.slopeFrames(6, 6);
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
          const screen = await this.core.settledScreen();
          // The naming keyboard (Crystal's rival, named in the lab) holds the player too: it waits
          // for a name, not for the scene to end.
          if (isNamingKeyboardScreen(screen)) { stopped = NAMING_KEYBOARD_OPEN; break; }
          const box = this.core.textBox(screen);
          if (!box.open) {
            // A trainer who has seen you walks over before anything shows, and a scene (a ship
            // leaving the dock) plays with the controls taken: wait while the game holds them, so the
            // walk says what happened instead of "blocked". (The direction is let go first.)
            gb.setButton(dir, false);
            let held = 0;
            for (let f = 0; (f < 90 || (this.core.host.position().scripted && f < SCENE_FRAMES)) && !this.core.host.position().battle; f += 6) {
              await this.core.slopeFrames(6, 6);
              const now = this.core.host.position();
              if (now.scripted) held = f + 6;
              if (now.map !== last.map) { stopped = "entered a new map"; break; }
              // A scene that ends on the keyboard (the direction is already let go).
              if (isNamingKeyboardScreen(this.core.screenText())) { stopped = NAMING_KEYBOARD_OPEN; break; }
              const later = this.core.textBox(this.core.screenText());
              if (later.open) {
                stopped = `stopped by a scripted event: a text box opened${later.lines.length ? ` ("${later.lines.join(" ")}")` : ""} (a trainer who saw you, or a scene) — advance_text reads it`;
                break;
              }
            }
            if (stopped === "arrived" && this.core.host.position().battle) stopped = "a battle started";
            if (stopped === "arrived" && held >= 90) {
              const at = this.core.host.position();
              const where = at.x !== last.x || at.y !== last.y ? `; it moved you to ${this.core.at(at.x, at.y)}` : "";
              stopped = this.core.host.position().scripted
                ? `a scene has the controls (still going after ${Math.round(held / 60)} s) — wait, then walk again`
                : `a scene had the controls for ${Math.round(held / 60)} s${where}; it's over — walk again`;
            }
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
      // (No frame runs before the settle below holds B again.)
      this.core.letGoOfSlope();
    }
    // Ledge hops finish on their own, a door walks you one step out, and a warp (also one that
    // starts after the last step, onto a door the game walks you to) loads the new map: the
    // returned coordinates and map view are the new map's. On the downhill road B stays held
    // through this (slopeFrames): with nothing held the game rolls the player back downhill.
    try {
      await this.core.slopeFrames(4);
      if (await this.core.settleMove(last.map, true)) stopped = "entered a new map";
    } finally {
      this.core.letGoOfSlope();
    }
    // A wild battle can start as the last step lands, after the loop's last look: the leg said
    // "arrived", so nothing ran from it (travel stopped in one under flee_uncounted, 2026-11-19).
    if (stopped === "arrived" && this.core.host.position().battle) stopped = "a battle started";
    // A trainer who saw the last step lands walks over after it, the game holding the controls: the
    // walk said "arrived" and the challenge came on the next call (a playtest, 2026-11-22). While a
    // script holds them, wait for what it says, as for one that starts mid-walk: a text box, the naming
    // keyboard, or a walk onto another map. Gen 1 gives the controls back a frame or two before the
    // box draws, so look on a little after the script lets go (review of #103).
    if (stopped === "arrived" && this.core.host.position().scripted) {
      try {
        for (let f = 0, after = 0; f < SCENE_FRAMES && !this.core.host.position().battle; f += 6) {
          await this.core.slopeFrames(6, 6);
          const now = this.core.host.position();
          if (now.map !== last.map) {
            stopped = "entered a new map";
            break;
          }
          if (isNamingKeyboardScreen(this.core.screenText())) {
            stopped = NAMING_KEYBOARD_OPEN;
            break;
          }
          if (this.core.textBox(this.core.screenText()).open) {
            // Read once it has finished printing (a first look read "O"), with B let go: held on the
            // downhill road, it would speed through the text or close it (review of #103).
            this.core.letGoOfSlope();
            const box = this.core.textBox(await this.core.settledScreen());
            if (box.open) {
              stopped = `stopped by a scripted event: a text box opened${box.lines.length ? ` ("${box.lines.join(" ")}")` : ""} (a trainer who saw you, or a scene) — advance_text reads it`;
              break;
            }
          }
          if (!now.scripted && ++after > 3) break;
        }
      } finally {
        this.core.letGoOfSlope();
      }
      if (stopped === "arrived" && this.core.host.position().battle) stopped = "a battle started";
    }
    // A door that leads elsewhere on the same map (a locked door in a Crystal underpass) moves
    // the player there with the map unchanged: "up 1/1 — arrived" hid a move of some 25 squares (a
    // playtest, 2026-11-22). A jump off the line walked, or back along it, is that; a slide on
    // and a ledge hop go on along it.
    let landed = this.core.host.position();
    // The game warps a little after the step onto the door has settled: on a door square, wait for it.
    if (stopped === "arrived" && landed.map === last.map && !landed.battle && this.core.rawView(true).doors?.some((d) => d.x === landed.x && d.y === landed.y)) {
      try {
        for (let f = 0; f < 90; f += 6) {
          await this.core.slopeFrames(6, 6);
          const p = this.core.host.position();
          if (p.map !== landed.map) {
            stopped = "entered a new map";
            break;
          }
          if (p.x !== landed.x || p.y !== landed.y || p.battle) break;
        }
      } finally {
        this.core.letGoOfSlope();
      }
      landed = this.core.host.position();
    }
    if (stopped === "arrived" && landed.map === last.map && !landed.battle && warpedOnMap(dir, last, landed)) {
      stopped = `went through a door/warp to ${this.core.at(landed.x, landed.y)}, on this map`;
    }
    // On ice the slide goes on after the squares asked for: say how far past them the player went
    // that way ("down 2/2" hid a slide of 8 squares, a playtest, 2026-11-21). Only from an ice
    // square and on a walk that arrived: a ledge hop the settle finished, or a scene that moved the
    // player, isn't a slide (review of #97).
    const end = this.core.host.position();
    const went = end.map === start.map && !end.battle ? (end.x - start.x) * SLOPE_STEP[dir][0] + (end.y - start.y) * SLOPE_STEP[dir][1] : 0;
    const onIce = () => this.core.rawView(true).grid[last.y]?.[last.x] === "*";
    return stopped === "arrived" && went > moved && onIce() ? { moved, stopped, slidPast: went - moved } : { moved, stopped };
  }

  /**
   * BridgeCore.tap, except that on the downhill road the wait after the press holds B
   * (slopeFrames): with nothing held there the game starts rolling the player downhill before the
   * next press. Elsewhere it's tap itself, frame for frame.
   */
  private async tapOnSlope(button: "up" | "down" | "left" | "right" | "a", hold: number, gap: number): Promise<void> {
    if (!this.core.game.forcedDownhill?.(this.core.requireGb())) return this.core.tap(button, hold, gap);
    await this.core.tap(button, hold, 0);
    try {
      await this.core.slopeFrames(gap);
    } finally {
      this.core.letGoOfSlope();
    }
    this.core.noteSeen();
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
    // Messages name squares in the model's coordinates: worked out on the view moved into them.
    const [sx, sy] = this.core.shown(x, y);
    const ledge = ledgeTarget(this.core.shownView(full), sx, sy);
    if (ledge) throw new Error(ledge);
    const toHole = full.grid[y - full.originY]?.[x - full.originX] === "O";
    let route = this.planTo(full, x, y);
    const guessed = Boolean(route?.guessed);
    const crossed = route?.crosses ?? [];
    // Said now, on this map: the walk may end through a door, on the next one.
    const sightNote = crossed.length ? ` (path crosses the sight of unbeaten trainers: ${this.describeCrossings(crossed)})` : "";
    if (!route) {
      // Say which kind of "no": a wall, off the map, or walkable but in a part you can't walk to from here.
      const at = full.grid[y - full.originY]?.[x - full.originX];
      // Past the map's edge, but never on screen: a player can't tell that from a square not seen yet
      // (saying "outside this map" would let walk_to measure the map).
      // In the dark, "seen" is what the dark view showed (SeenMaps.dark), not the lit memory.
      const seen = this.core.host.seen?.();
      const sawIt = seen && (this.core.dark() ? seen.sawInDark(startMap, x, y) : seen.has(startMap, x, y));
      const unseenOutside = at == null && !!seen && !sawIt;
      const blocker = at == null || at === "#" || at === "?" || (at === "~" && !full.surfing) ? null : wayBlocker(this.core.shownView(full), sx, sy);
      const by = blocker && { what: blocker.what, x: blocker.x + x - sx, y: blocker.y + y - sy };
      const why = unseenOutside || at === "?" ? "you haven't seen that square yet (? on the map): go closer and look"
        : at == null ? "it's outside this map"
        : at === "#" ? "that square is solid"
        : at === "~" && !full.surfing ? "that square is water"
        : `it's on this map, but no walk from where you stand reaches it${by ? `: ${by.what} is in the way` : ""}`;
      // The screen, grown to take in the target and what's in the way when they're off it: a map
      // that names a square it doesn't show reads as wrong (a boulder below the screen, 2026-11-08).
      // Not for a square not seen yet (nothing to show there), and never past what the run has seen
      // (seenPart): unseen rows out to the map's edge would give its size away.
      const screen = this.core.screenView();
      const sx1 = screen.originX + (screen.grid[0]?.length ?? 1) - 1, sy1 = screen.originY + screen.grid.length - 1;
      const xs = [x, ...(by ? [by.x] : [])], ys = [y, ...(by ? [by.y] : [])];
      const offScreen = at != null && at !== "?" && xs.some((px, i) => px < screen.originX || px > sx1 || ys[i] < screen.originY || ys[i] > sy1);
      const shown = offScreen
        ? seenPart(cropView(full, Math.min(screen.originX, ...xs.map((px) => px - 1)), Math.min(screen.originY, ...ys.map((py) => py - 1)),
          Math.max(sx1, ...xs.map((px) => px + 1)), Math.max(sy1, ...ys.map((py) => py + 1))))
        : screen;
      throw new Error(`No path to ${this.core.at(x, y)}: ${why}.\n${this.core.drawn(shown)}`);
    }
    let report = "already there";
    // Every leg walked, for the result: a guessed way is several, and the last alone doesn't say how
    // the player got where they are (a model took that for its coordinates shifting, 2026-11-19).
    const walked: string[] = [];
    // The view the route was planned on: its steps are walked in squares (toSegments), counted from it.
    let planned: AnyOverworldView = full;
    const replan = () => this.planTo((planned = this.core.view(true)), x, y);
    // A guessed way (through unseen squares) can run into a wall the walk then sees: re-plan more often.
    // A guessed way is walked only as far as the squares already seen (`route.legDirs`), then re-planned
    // with what that walk showed (the screen reaches 4-5 squares ahead): never blind into an unseen
    // trainer's sight, a warp, a hole or a ledge. Advancing that frontier has its own (larger) cap.
    // A guess can lead far round, wall after wall: past a few times the straight way there, it stops
    // and says so (a door 5 squares away took a walk of some 150 across a city and ended further off
    // than it began, a playtest, 2026-11-22). Never for a way through seen squares.
    const straight = Math.abs(x - here.x) + Math.abs(y - here.y);
    const budget = Math.max(GUESS_MIN_SQUARES, GUESS_TIMES_STRAIGHT * straight);
    let guessedSteps = 0;
    let guessGaveUp = false;
    for (let attempt = 0, legs = 0; route && route.dirs.length && attempt < 4;) {
      report = await this.walkSegments(toSegments(route.legDirs, planned));
      walked.push(report);
      if (route.guessed) guessedSteps += route.legDirs.length;
      here = this.core.host.position();
      if (here.battle || here.map !== startMap) break;
      // A leg that ran from a wild battle on the way still arrived where it was going.
      if (route.partial && ARRIVED.test(report) && legs++ < 30) {
        if (route.guessed && guessedSteps >= budget) {
          guessGaveUp = true;
          break;
        }
        route = replan();
        continue;
      }
      if (!report.includes("blocked")) break;
      attempt++;
      // Let the person move along, then re-plan (on the downhill road, without rolling back).
      await this.core.slopeFrames(30, 8);
      this.core.letGoOfSlope();
      route = replan();
    }
    // A trainer seen only off screen is assumed to look every way; once it is on screen its real
    // facing is known, so walking up to the sight line often clears it. Re-plan from there.
    for (let again = 0; route?.sightStop && route.dirs.length && again < 6; again++) {
      here = this.core.host.position();
      if (here.battle || here.map !== startMap) break;
      // The last leg stopped for something else (a poison flash, a text box): say so, don't walk on.
      if (!ARRIVED.test(report)) break;
      const next = replan();
      if (!next) break;
      route = next;
      if (!route.dirs.length) break;
      report = await this.walkSegments(toSegments(route.dirs, planned));
      walked.push(report);
    }
    if (route?.sightStop) {
      const [sx, sy] = route.sightStop;
      const sofar = walked.length ? legsSaid(walked).replace(ARRIVED, (m) => m.replace(" — arrived", "")) : "";
      return this.core.result({
        walk: `${sofar ? sofar + " — " : ""}stopped short: the only way on crosses an unbeaten trainer's sight at ${this.core.at(sx, sy)}${this.whoWatches(sx, sy)}. walk_to that trainer (interact) to fight it on purpose, or choose another target.`,
        map: this.core.mapText(),
      });
    }
    // Every leg walked, for the results below that end the walk elsewhere (a hole, a doormat).
    const legsSoFar = walked.length ? legsSaid(walked) : report;
    // A hole asked for: the fall (a spin or a drop, buttons ignored) changes the map well after the
    // step lands. Wait it out and report the floor below, with nothing pressed during it.
    const onHole = this.core.host.position();
    if (route && toHole && !onHole.battle && onHole.map === startMap && onHole.x === x && onHole.y === y) {
      await this.core.awaitWarp();
      const fell = this.core.host.position().map !== startMap;
      return this.core.result({ walk: `${legsSoFar}${fell ? `, then fell through the hole to ${this.core.mapName()}` : " (the hole didn't take you down)"}`, map: this.core.mapText() });
    }
    // A doormat at the map's edge takes you out only when you press toward the edge: do that. With
    // interact too: on a door square there's nothing to talk to, so going through is what's meant.
    if (route && /arrived|already there/.test(report) && !this.core.host.position().battle && this.core.host.position().map === startMap) {
      const here2 = this.core.host.position();
      const onDoor = here2.x === x && here2.y === y && !!this.core.rawView(true).doors?.some((d) => d.x === x && d.y === y);
      const out = onDoor ? this.edgeOf(x, y) : null;
      if (out) {
        await this.core.tap(out, 16, 50);
        await this.core.requireGb().runFrames(120, 30);
        const through = this.core.host.position();
        if (through.map !== startMap) return this.core.result({ walk: `${legsSoFar}, then ${out} through the door, now on ${this.core.mapName()}`, map: this.core.mapText() });
        // A door to elsewhere on this same map moves you there instead.
        if (!through.battle && (through.x !== x || through.y !== y) && warpedOnMap(out, { x, y }, through)) {
          return this.core.result({ walk: `${legsSoFar}, then ${out} through the door/warp to ${this.core.at(through.x, through.y)}, on this map`, map: this.core.mapText() });
        }
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
    // Arrived means the player is where the way was planned to end: the target, or beside a person,
    // sign or object (or across a counter from it) to face it. A guessed way can end its legs short of
    // the target when no way on shows, and the last leg's own "arrived" said nothing about that.
    const end = this.core.host.position();
    const [ex, ey] = route ? routeEnd(planned, route.dirs) : [x, y];
    // A last leg that stopped there for something else (a trainer who saw it, a scene) didn't arrive:
    // turning to face and pressing A then would press into that text.
    const reached = !!route && !end.battle && end.map === startMap && end.x === ex && end.y === ey && !/ — stopped: /.test(report);
    let said = legsSoFar;
    if (!reached && walked.length && ARRIVED.test(said) && !end.battle && end.map === startMap) {
      said = said.replace(ARRIVED, (m) => m.replace(" — arrived", "")) +
        ` — stopped at ${this.core.at(end.x, end.y)}, short of ${this.core.at(x, y)}${
          guessGaveUp ? `: the way it was trying through squares you hadn't seen had taken ${guessedSteps} squares (${straight} in a straight line from where you started), so it stopped`
          : route ? "" : ": no way on there through squares you've seen"}`;
    }
    let messages: string[] | undefined;
    if (reached) {
      if (route?.face) {
        await this.tapOnSlope(route.face, 6, 12); // long enough to register a turn
        said += `, facing ${route.face}`;
      }
      if (interact) {
        await this.tapOnSlope("a", 4, 24);
        messages = (await this.menus.advanceText(30)).messages;
      }
    }
    const guessNote = guessed ? " (no seen way there, so it tried a way through squares you hadn't seen)" : "";
    return this.core.result({ walk: said + sightNote + guessNote, messages, map: this.core.mapText() });
  }

  /**
   * findPath to (x, y) over the squares the run has seen; when no seen way gets there, a guess:
   * the unseen squares taken as open floor, as a player heads toward a place they can see through
   * parts they haven't (the walk then shows what's really there, and walkTo re-plans when it's
   * blocked). Never to an unseen square itself.
   */
  private planTo(v: AnyOverworldView, x: number, y: number) {
    return planFrontierTarget(v, x, y, this.core.sight(), !this.core.dark());
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
      let view = this.core.view(false);
      let route = pathFurthest(view, dir, this.core.sight());
      if (!route && this.core.host.rom()) {
        view = this.core.view(true);
        route = pathFurthest(view, dir, this.core.sight());
      }
      if (!route) {
        // Avoiding sight, a way on that only crosses trainers' sight isn't "no way": say whose.
        const through = this.core.sight().avoidSight ? pathFurthest(view, dir, { avoidSight: false }) : null;
        const crosses = through ? sightCrossings(view, through) : [];
        why = crosses.length
          ? `stopped: the only way further ${dir} crosses the sight of unbeaten trainers: ${this.describeCrossings(crosses)}. ` +
            "Walk to one (walk_to or fight_trainer) to fight it on purpose, or travel with trainers: ignore"
          : `stopped: no way further ${dir} on this map from where you stand — try another direction or get_map`;
        break;
      }
      const crosses = this.core.sight().avoidSight ? [] : sightCrossings(view, route);
      // Said before the leg: it may cross into the next map.
      const crossed = crosses.length ? ` (crossed the sight of ${this.describeCrossings(crosses)})` : "";
      const report = await this.walkSegments(toSegments(route, view));
      legs.push(report.replace(" — arrived", "") + crossed);
      // A leg that ran from a wild battle on the way ("— arrived (ran from X)") went on as planned too.
      if (!ARRIVED.test(report)) {
        const stop = report.split(" — stopped: ")[1];
        why = stop === "entered a new map" || stop === "a battle started" ? stop : `stopped: ${stop ?? "?"}`;
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

  /**
   * Walks to the map's edge in `dir` and steps across into the connected map. `explored`: a second
   * look after heading that way; `from`: where the player asked from (which doors are that way).
   */
  async exitMap(dir: Dir, explored = false, from?: { x: number; y: number }): Promise<unknown> {
    if (!["up", "down", "left", "right"].includes(dir)) throw new Error("direction must be up, down, left or right");
    await this.core.alignToVBlank();
    if (this.core.host.position().battle) throw new Error("Can't walk during a battle.");
    const startMapOf = this.core.host.position().map;
    const full = this.core.view(true);
    if (full.exits && !full.exits.length) {
      // No edges, only doors. When they all lead to the same place there's nothing to choose:
      // leave through the nearest one. Otherwise which door is the player's call.
      // While part of the map is unseen, only the doors the way asked count: the one seen may be the
      // one the player came in by, behind them (exit_map up in a forest took the south door back
      // out, 2026-11-19). With the whole map seen, every door (a building's one way out).
      const here0 = from ?? this.core.host.position();
      // The door underfoot counts too when the way asked is a wall or the map's edge from it: then a
      // step that way can only go through it (Crystal's rooms are seldom seen whole on arrival, and
      // you arrive on the doormat). Not when that way is open (the forest's south door, asked up).
      const [sx, sy] = dir === "up" ? [0, -1] : dir === "down" ? [0, 1] : dir === "left" ? [-1, 0] : [1, 0];
      const beyond = (x: number, y: number) => full.grid[y - full.originY]?.[x - full.originX];
      const underfoot = (d: { x: number; y: number }) =>
        d.x === here0.x && d.y === here0.y && [undefined, "#"].includes(beyond(d.x + sx, d.y + sy));
      const ahead = (d: { x: number; y: number }) => underfoot(d) ||
        (dir === "up" ? d.y < here0.y : dir === "down" ? d.y > here0.y : dir === "left" ? d.x < here0.x : d.x > here0.x);
      const doors = hasFog(full) ? (full.doors ?? []).filter(ahead) : full.doors ?? [];
      // No door in sight yet that way (fog of war, e.g. a run resumed inside): head the way asked
      // through what's been seen, looking as you go, as a player would; then, if that brought a way
      // out into sight, take it (once: no second look-around).
      if (!doors.length && hasFog(full)) {
        if (explored) throw new Error(`No door in sight yet that way: look around (walk, travel) and try exit_map again.`);
        const out = (await this.travel(dir, 12, 1)) as Record<string, unknown>;
        const head = `no door in sight yet ${dir} of you, so heading ${dir}: ${String(out.walk ?? "")}`;
        const now = this.core.host.position();
        if (now.battle || now.map !== startMapOf || !this.core.view(true).doors?.length) return { ...out, walk: head };
        try {
          const through = (await this.exitMap(dir, true, here0)) as Record<string, unknown>;
          return { ...through, walk: `${head}; then ${String(through.walk ?? "")}` };
        } catch (e) {
          // Say why it didn't go on (a door came into sight that leads somewhere the run doesn't know:
          // walk_to it), not only the heading's dead end (a playtest, 2026-11-22).
          return { ...out, walk: `${head}; ${e instanceof Error ? e.message : String(e)}` };
        }
      }
      // Out of a building means outdoors: where some of its known doors lead to a town or route, the
      // known ones that don't (a Crystal Pokémon Center's stairs up) drop out. A door the run doesn't
      // know ("?") stays: it may be the way out (a gate's far side on a first visit).
      const outdoors = doors.filter((d) => d.outside && d.to !== "?");
      const out = outdoors.length ? doors.filter((d) => d.outside || d.to === "?") : doors;
      // Still more than one place (a gate, out to a town one side and a route the other): the doors the
      // way asked, when they all lead to one place. A gate seen whole counted both sides.
      const towards = out.filter((d) => dir === "up" ? d.y < here0.y : dir === "down" ? d.y > here0.y : dir === "left" ? d.x < here0.x : d.x > here0.x);
      const ways = new Set(out.map((d) => d.to)).size > 1 && towards.length && new Set(towards.map((d) => d.to)).size === 1 ? towards : out;
      const places = [...new Set(ways.map((d) => d.to))];
      // One way out only if every door lands on the same spot (a building's doormat, maybe two squares
      // wide). A cave's ladders can all go to the next floor, but to parts of it that don't connect.
      const xs = ways.map((d) => d.tx ?? -1);
      const ys = ways.map((d) => d.ty ?? -1);
      const oneSpot = Math.max(...xs) - Math.min(...xs) <= 1 && Math.max(...ys) - Math.min(...ys) <= 1;
      // Not through a door the run doesn't know ("?"): where that leads is the player's to find out.
      if (places.length === 1 && places[0] !== "?" && oneSpot) {
        const here = this.core.host.position();
        const door = [...ways].sort((a, b) => Math.abs(a.x - here.x) + Math.abs(a.y - here.y) - (Math.abs(b.x - here.x) + Math.abs(b.y - here.y)))[0];
        // Said in this map's coordinates: once through the door the player is on the next map.
        const doorAt = this.core.at(door.x, door.y);
        const out = (await this.walkTo(door.x, door.y, false)) as Record<string, unknown>;
        return { ...out, walk: `no edge exits here, so out through the door at ${doorAt} to ${places[0]}: ${String(out.walk ?? "")}` };
      }
      throw new Error(`This map has no exit ${dir}: leave through a door (D) — walk_to its square to go through it. Doors: ${(this.core.shownView({ ...full, doors }).doors ?? []).map((d) => `(${d.x},${d.y}) → ${d.to}${d.tx != null ? ` (${d.tx},${d.ty})` : ""}`).join("; ") || "none seen"}.`);
    }
    if (full.exits && !full.exits.includes(dir)) {
      throw new Error(`This map has no exit ${dir}. Exits: ${full.exits.join(", ")}.`);
    }
    const startMap = this.core.host.position().map;
    // One entry per try ("| retry:" between them, for people in the way); the legs of a guessed way
    // go in front of the entry that ends them, so every leg walked is said (see walkTo).
    const reports: string[] = [];
    const pending: string[] = [];
    const report = (s: string) => reports.push([...pending.splice(0), s].join("; then "));
    let note = "";
    // A wandering NPC can block the planned path: wait a moment and re-plan (a few times).
    for (let attempt = 0, legs = 0, first = true; attempt < 10; attempt++, first = false) {
      const view = first ? full : this.core.view(true);
      const route = planFrontierEdge(view, dir, this.core.sight(), !this.core.dark());
      if (!route) {
        if (!first) {
          // Said with the legs a guessed way walked before it ran out, if any (they'd be lost otherwise).
          if (!reports.length || pending.length) report(`no way to the ${dir} edge found from here`);
          break;
        }
        throw new Error(`Can't reach the ${dir} edge from here.\n${this.core.drawn(seenPart(view))}`);
      }
      if (route.guessed && !note && !reports.length) note = `(no seen way to the ${dir} edge: trying one through squares you hadn't seen) `;
      if (route.sightStop) {
        const [sx, sy] = route.sightStop;
        const walked = route.dirs.length ? (await this.walkSegments(toSegments(route.dirs, view))).replace(" — arrived", "") + " — " : "";
        // Up close the trainer's real facing is known: re-plan before giving up (see walkTo).
        const pos = this.core.host.position();
        if (route.dirs.length && !pos.battle && pos.map === startMap && attempt < 8) {
          report(walked.replace(/ — $/, ""));
          continue;
        }
        report(`${walked}stopped short: the way ${dir} crosses an unbeaten trainer's sight at ${this.core.at(sx, sy)}${this.whoWatches(sx, sy)}. walk_to that trainer (interact) to fight it on purpose, or find another way.`);
        break;
      }
      // A guessed way: walk only the part over seen squares (`route.legDirs`), then re-plan with what
      // it showed (see walkTo). That frontier advance doesn't use up the retries for people in the way.
      if (route.partial) {
        const leg = await this.walkSegments(toSegments(route.legDirs, view));
        const at = this.core.host.position();
        // A leg that ran from a wild battle on the way still got where it was going.
        if (ARRIVED.test(leg) && !at.battle && at.map === startMap && legs++ < 30) {
          pending.push(leg.replace(" — arrived", ""));
          attempt--;
          continue;
        }
        report(leg);
        if (at.map !== startMap || at.battle || !/blocked/.test(leg)) break;
        await this.core.requireGb().runFrames(40, 8);
        continue;
      }
      // Said before the walk: it crosses into the next map.
      const crossed = route.crosses?.length ? ` (path crosses the sight of unbeaten trainers: ${this.describeCrossings(route.crosses)})` : "";
      let said = route.dirs.length ? await this.walkSegments(toSegments(route.dirs, view)) : "at the edge";
      // At the edge, even after running from a wild battle on the way: step across.
      if (ARRIVED.test(said) || said === "at the edge") {
        said += `; crossing: ${await this.walkSegments([[dir, 3]])}`;
      }
      said += crossed;
      report(said);
      const pos = this.core.host.position();
      if (pos.map !== startMap || pos.battle || !/blocked/.test(said)) break;
      if (this.core.textBox(this.core.screenText()).open) break; // someone is talking: let the caller read it
      await this.core.requireGb().runFrames(40, 8);
    }
    return this.core.result({ walk: note + reports.join(" | retry: "), map: this.core.mapText() });
  }

  /**
   * "(8,12) WALKER" for each crossing (names are known in the Nuzlocke), in this map's coordinates
   * and with its trainers: say it before a walk that may leave the map (through a door, over an edge).
   */
  private describeCrossings(crosses: [number, number][]): string {
    const known = this.core.host.mapTrainers();
    return crosses.map(([x, y]) => {
      const t = known.find((k) => k.x === x && k.y === y);
      return `${this.core.at(x, y, true)}${t ? ` ${t.name}` : ""}`;
    }).join(", ");
  }

  /** " (watched by the trainer at (63,3) WALKER)" for a square in an unbeaten trainer's sight. */
  private whoWatches(x: number, y: number): string {
    const v = this.core.view(true);
    const w = v.watchers?.get((y - v.originY) * (v.grid[0]?.length ?? 0) + (x - v.originX)) ?? [];
    return w.length ? ` (watched by the trainer at ${this.describeCrossings(w)})` : "";
  }

  /**
   * ack_poison: the model knows this party Pokémon (nickname, species or slot 1-6) is poisoned, so
   * walks stop no more for its poison until it's cured or faints.
   */
  ackPoison(who: string | number): unknown {
    this.dropLapsedAcks();
    const party = this.core.summary()?.party ?? [];
    const key = String(who).trim().toUpperCase();
    const index = /^[1-6]$/.test(key) ? Number(key) - 1
      : party.findIndex((m) => m.nickname?.toUpperCase() === key || m.species?.toUpperCase() === key);
    const mon = party[index];
    if (!mon) throw new Error(`No party Pokémon "${who}": give its nickname, species or slot (1-6).`);
    const name = mon.nickname ?? mon.species;
    const hit = [...this.poisoned()].find(([, p]) => p.slot === index && p.hp > 0);
    if (!hit) throw new Error(`${name} isn't poisoned.`);
    this.poisonAcked.add(hit[0]);
    return this.core.result({ note: `Walks won't stop for ${name}'s poison until it's cured or faints (each hit still shows in the Poison line).` });
  }

  /** Acks lapse once the Pokémon is cured or has fainted (no longer poisoned with HP left). */
  private dropLapsedAcks(): void {
    if (!this.poisonAcked.size) return;
    const now = this.poisoned();
    for (const uid of this.poisonAcked) if (!now.get(uid)?.hp) this.poisonAcked.delete(uid);
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
