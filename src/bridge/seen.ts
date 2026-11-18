// What the run has seen of each map, as a player remembers it: every square that has been on the
// screen, and the doors it has been through (where they lead). The whole map (get_map full=true)
// shows only that, so a maze, a teleporter or a ladder is found out by going there.

import type { Door, OverworldView } from "./overworld";

/** The screen around the player: 10×9 squares, the player at column 4, row 4 (both games). */
const SCREEN = { left: 4, right: 5, up: 4, down: 4 };

/** A door's place: where it is, or where it lets you out (you know the door you arrive by). */
type Spot = [number, number];

export interface SeenData {
  /** Map → row (y) → seen runs of x, [from, to] inclusive, sorted and apart. */
  squares: Record<string, Record<string, [number, number][]>>;
  /** Map → squares the player stood on just before warping away, or just after arriving. */
  doors: Record<string, Spot[]>;
}

/** Buildings a player knows from outside (their roofs and signs say so): their doors are named at once. */
const KNOWN_FROM_OUTSIDE = /POKECENTER|(^|_)MART($|_1F)|_GYM$|DEPT_STORE_1F/;

/** Maps out in the open: a town, a city, a route. */
const OUTDOORS = /^(ROUTE_\d+(_(NORTH|SOUTH|EAST|WEST))?|[A-Z_]+_(TOWN|CITY|ISLAND|PLATEAU)|SAFARI_ZONE_(EAST|WEST|NORTH|CENTER)|LAKE_OF_RAGE|SILVER_CAVE_OUTSIDE|VIRIDIAN_FOREST|ILEX_FOREST|NATIONAL_PARK)$/;

export class SeenMaps {
  readonly data: SeenData;
  /** Something new was seen since the last take (so the page saves it). */
  private changed = false;

  constructor(data?: SeenData | null) {
    this.data = { squares: data?.squares ?? {}, doors: data?.doors ?? {} };
  }

  /** Marks the screen around (x, y) on `map` seen. */
  sawScreen(map: number, x: number, y: number): void {
    const rows = (this.data.squares[map] ??= {});
    for (let r = y - SCREEN.up; r <= y + SCREEN.down; r++) {
      if (addRun((rows[r] ??= []), x - SCREEN.left, x + SCREEN.right)) this.changed = true;
    }
  }

  has(map: number, x: number, y: number): boolean {
    return (this.data.squares[map]?.[y] ?? []).some(([a, b]) => x >= a && x <= b);
  }

  /** Whether anything new was seen since the last saved checkpoint (without clearing the flag). */
  hasChanged(): boolean {
    return this.changed;
  }

  /** The player went from (x, y) on `from` to (tx, ty) on `to` by a warp: both ends are known doors now. */
  wentThrough(from: number, x: number, y: number, to: number, tx: number, ty: number): void {
    for (const [map, sx, sy] of [[from, x, y], [to, tx, ty]] as const) {
      const spots = (this.data.doors[map] ??= []);
      if (!spots.some(([a, b]) => a === sx && b === sy)) {
        spots.push([sx, sy]);
        this.changed = true;
      }
    }
  }

  /** Whether the run knows where this door leads: been through it (or out of it), or it's a building a player knows. */
  knowsDoor(map: number, d: Door, bottomRow?: number): boolean {
    if (KNOWN_FROM_OUTSIDE.test(d.to)) return true;
    // A doormat on a building's bottom row leads back out into the open: a player sees it's the
    // way out (the run may have started upstairs, never having come in by it).
    if (bottomRow != null && d.y === bottomRow && OUTDOORS.test(d.to)) return true;
    // Next to the square too: the poll can catch the player a step before the warp, and a wide door's squares go to one place.
    return (this.data.doors[map] ?? []).some(([x, y]) => Math.abs(x - d.x) + Math.abs(y - d.y) <= 1);
  }

  /** True once after anything new was seen (the page saves then). */
  takeChanged(): boolean {
    const was = this.changed;
    this.changed = false;
    return was;
  }

  /**
   * The view as the run knows it: squares never on screen are "?", and doors it hasn't been through
   * lead to "?". `map` is the view's map; `bottomRow` its last row (y), for doormats out.
   */
  fog(view: OverworldView, map: number, bottomRow?: number): OverworldView {
    const grid = view.grid.map((row, r) => row.map((ch, c) => (this.has(map, view.originX + c, view.originY + r) ? ch : "?")));
    const inSight = view.doors?.filter((d) => this.has(map, d.x, d.y));
    const known = inSight?.filter((d) => this.knowsDoor(map, d, bottomRow)) ?? [];
    // A wide door (a gate, a building's 2-square mat) is one way through: known on any square, known on all.
    const sameDoor = (a: Door, b: Door) => a.to === b.to && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
    const doors = inSight?.map((d) => (known.includes(d) || known.some((k) => sameDoor(k, d)) ? d : { ...d, to: "?", tx: null, ty: null }));
    // Trainers' sight only from trainers the run has seen, onto squares it has seen: otherwise an
    // unseen trainer's ! (and where it stands) would show through the fog, and paths steer round it.
    const W = view.grid[0]?.length ?? 0;
    const watchers = view.watchers && new Map(
      [...view.watchers]
        .filter(([k]) => grid[Math.floor(k / W)]?.[k % W] !== "?")
        .map(([k, who]) => [k, who.filter(([x, y]) => this.has(map, x, y))] as [number, [number, number][]])
        .filter(([, who]) => who.length),
    );
    const watched = watchers && new Set(watchers.keys());
    return { ...view, grid, doors, ...(watchers ? { watchers, watched } : {}) };
  }
}

/** Adds [a, b] to sorted, apart runs, merging; whether anything was new. */
function addRun(runs: [number, number][], a: number, b: number): boolean {
  if (runs.some(([x, y]) => a >= x && b <= y)) return false;
  runs.push([a, b]);
  runs.sort((p, q) => p[0] - q[0]);
  const merged: [number, number][] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && run[0] <= last[1] + 1) last[1] = Math.max(last[1], run[1]);
    else merged.push([run[0], run[1]]);
  }
  runs.splice(0, runs.length, ...merged);
  return true;
}
