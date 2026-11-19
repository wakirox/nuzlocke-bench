// What the run has seen of each map, as a player remembers it: every square that has been on the
// screen, and the doors it has been through (where they lead). The whole map (get_map full=true)
// shows only that, so a maze, a teleporter or a ladder is found out by going there.

import { maskView } from "./map-lens";
import type { AnyOverworldView, Door, KnownOverworldView } from "./overworld";

/** The screen around the player: 10×9 squares, the player at column 4, row 4 (both games). */
const SCREEN = { left: 4, right: 5, up: 4, down: 4 };

/** A door's place: where it is, or where it lets you out (you know the door you arrive by). */
type Spot = [number, number];

export interface SeenData {
  /** Map → row (y) → seen runs of x, [from, to] inclusive, sorted and apart. */
  squares: Record<string, Record<string, [number, number][]>>;
  /** Map → squares the player stood on just before warping away, or just after arriving. */
  doors: Record<string, Spot[]>;
  /** Map → floor-switch squares the run has seen uncovered (`o`), for showing a boulder later pushed onto one as `b`. */
  switches?: Record<string, Spot[]>;
  /** Map → "x,y" → what the square showed in the dark (#, ., , or D): a dark map shows what the run saw there. */
  dark?: Record<string, Record<string, string>>;
  /**
   * Map → the square the run first stood on there: (0,0) of the coordinates the model sees on that
   * map, so they say nothing about where the map's edges are.
   */
  origins?: Record<string, Spot>;
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
    this.data = {
      squares: data?.squares ?? {},
      doors: data?.doors ?? {},
      ...(data?.switches ? { switches: data.switches } : {}),
      ...(data?.dark ? { dark: data.dark } : {}),
      ...(data?.origins ? { origins: data.origins } : {}),
    };
  }

  /** The (0,0) of `map`'s coordinates as the model sees them, once the run has stood there. */
  origin(map: number): Spot | undefined {
    return this.data.origins?.[map];
  }

  /** The (0,0) of `map`'s coordinates: set to (x, y), where the player stands, the first time. */
  originAt(map: number, x: number, y: number): Spot {
    const origins = (this.data.origins ??= {});
    if (!origins[map]) {
      origins[map] = [x, y];
      this.changed = true;
    }
    return origins[map];
  }

  /** Marks the screen around (x, y) on `map` seen. */
  sawScreen(map: number, x: number, y: number): void {
    const rows = (this.data.squares[map] ??= {});
    for (let r = y - SCREEN.up; r <= y + SCREEN.down; r++) {
      if (addRun((rows[r] ??= []), x - SCREEN.left, x + SCREEN.right)) this.changed = true;
    }
  }

  /**
   * Remembers uncovered floor switches (`o`) currently inside the player's 10×9 screen:
   * a boulder later pushed onto one can be drawn as `b`, whereas a boulder on a switch the run
   * never saw uncovered stays `B`.
   */
  sawSwitches(map: number, view: AnyOverworldView, px: number, py: number): void {
    const x0 = px - SCREEN.left, x1 = px + SCREEN.right;
    const y0 = py - SCREEN.up, y1 = py + SCREEN.down;
    for (let r = 0; r < view.grid.length; r++) {
      const y = view.originY + r;
      if (y < y0 || y > y1) continue;
      for (let c = 0; c < view.grid[r].length; c++) {
        if (view.grid[r][c] !== "o") continue;
        const x = view.originX + c;
        if (x < x0 || x > x1) continue;
        const byMap = (this.data.switches ??= {});
        const spots = (byMap[map] ??= []);
        if (!spots.some(([a, b]) => a === x && b === y)) {
          spots.push([x, y]);
          this.changed = true;
        }
      }
    }
  }

  /**
   * Remembers what the dark view's squares (darkSquares, its top-left square at originX, originY)
   * show now: every square but the dark ("?") and the player. Kept apart from the lit memory
   * (sawScreen), so a map lit later (Flash) shows what it always did.
   */
  sawDark(map: number, squares: string[][], originX: number, originY: number): void {
    for (let r = 0; r < squares.length; r++) {
      for (let c = 0; c < squares[r].length; c++) {
        const ch = squares[r][c];
        if (ch === "?" || ch === "@") continue;
        const known = ((this.data.dark ??= {})[map] ??= {});
        const key = `${originX + c},${originY + r}`;
        if (known[key] !== ch) {
          known[key] = ch;
          this.changed = true;
        }
      }
    }
  }

  /** Whether the run has seen floor switch `(x, y)` on `map` uncovered. */
  hasSwitch(map: number, x: number, y: number): boolean {
    return (this.data.switches?.[map] ?? []).some(([a, b]) => a === x && b === y);
  }

  /** Whether the dark view has shown square (x, y) of `map` (sawDark). */
  sawInDark(map: number, x: number, y: number): boolean {
    return `${x},${y}` in (this.data.dark?.[map] ?? {});
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
  fog(view: AnyOverworldView, map: number, bottomRow?: number, opts?: { boulderSwitch?: boolean }): KnownOverworldView {
    // A wide door (a gate, a building's 2-square mat) is one way through: known on any square, known on all.
    const sameDoor = (a: Door, b: Door) => a.to === b.to && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
    return maskView(view, {
      isVisible: (x, y) => this.has(map, x, y),
      mapCell: (ch, x, y) => (ch === "b" && !(opts?.boulderSwitch && this.hasSwitch(map, x, y)) ? "B" : ch),
      mapDoors: (inSight) => {
        const known = inSight.filter((k) => this.knowsDoor(map, k, bottomRow));
        return inSight.map((d) => (known.includes(d) || known.some((k) => sameDoor(k, d)) ? d : { ...d, to: "?", tx: null, ty: null }));
      },
    });
  }

  /**
   * A dark map as the run knows it: only the squares the dark view showed (sawDark), each as it
   * showed then (a person standing on one since is a black sprite, not shown), and the player.
   * Walks plan over this in the dark, never guessing through the rest.
   */
  fogDark(view: AnyOverworldView, map: number, bottomRow?: number): KnownOverworldView {
    const known = this.data.dark?.[map] ?? {};
    const sameDoor = (a: Door, b: Door) => a.to === b.to && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
    // No trainers' sight in the dark: they're black sprites there, so no ! and no walk steering
    // round one (maskView would keep a watcher standing on a square remembered as floor).
    return maskView({ ...view, watched: undefined, watchers: undefined }, {
      isVisible: (x, y) => `${x},${y}` in known || (x === view.originX + view.pc && y === view.originY + view.pr),
      // A lower floor is "." on the grid, as on a lit map: renderView draws it "," from its tile.
      mapCell: (ch, x, y) => (ch === "@" ? ch : known[`${x},${y}`] === "," ? "." : known[`${x},${y}`]),
      mapDoors: (inSight) => {
        const doors = inSight.filter((d) => known[`${d.x},${d.y}`] === "D");
        const knownDoors = doors.filter((k) => this.knowsDoor(map, k, bottomRow));
        return doors.map((d) => (knownDoors.includes(d) || knownDoors.some((k) => sameDoor(k, d)) ? d : { ...d, to: "?", tx: null, ty: null }));
      },
    });
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
