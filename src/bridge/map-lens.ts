// Stage-typed view lenses and frontier route planning over OverworldView:
//   RawOverworldView ("raw")  ──maskView──▶  KnownOverworldView ("known")  ──guessUnseenView──▶  GuessedOverworldView ("guessed")
//
// Transforming `grid`, `doors`, `watchers`, and `watched` atomically in `maskView` prevents unseen
// trainer sight or unknown doors from leaking through a mask, while compile-time view stages prevent
// passing a fogged view where raw map geometry is needed (e.g. grass detection, lower-floor sealing)
// or rendering a guessed view into model-facing text.

import {
  findPath,
  pathToEdge,
  type AnyOverworldView,
  type Dir,
  type Door,
  type GuessedOverworldView,
  type KnownOverworldView,
  type RawOverworldView,
  type SightOptions,
  type UnfoggedView,
} from "./overworld";

const STEP: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const HOP: Record<string, Dir> = { v: "down", "<": "left", ">": "right" };

/** Stamps a view read straight from ROM/RAM as `"raw"`. */
export function asRawView(v: AnyOverworldView): RawOverworldView {
  return { ...v, stage: "raw" };
}

/** Stamps a view ready for player/model consumption as `"known"`. */
export function asKnownView(v: AnyOverworldView): KnownOverworldView {
  return { ...v, stage: "known" };
}

export interface MaskLensOptions {
  /** Whether map coordinate `(x, y)` is visible in the masked view (`false` becomes `"?"`). */
  isVisible: (x: number, y: number) => boolean;
  /** Optional door projection applied to each visible door (e.g. hiding unknown destinations as `"?"`). */
  mapDoor?: (door: Door, visibleDoors: Door[]) => Door;
}

/**
 * Atomically masks `grid`, `doors`, `watchers`, and `watched` to `isVisible` squares, returning a
 * `"known"` view where unseen trainers and unseen watched squares are both stripped.
 */
export function maskView(view: AnyOverworldView, { isVisible, mapDoor }: MaskLensOptions): KnownOverworldView {
  const grid = view.grid.map((row, r) =>
    row.map((ch, c) => (isVisible(view.originX + c, view.originY + r) ? ch : "?")),
  );
  const visibleDoors = view.doors?.filter((d) => isVisible(d.x, d.y));
  const doors = visibleDoors && mapDoor ? visibleDoors.map((d) => mapDoor(d, visibleDoors)) : visibleDoors;
  // Trainers' sight only from trainers the run has seen, onto squares it has seen: otherwise an
  // unseen trainer's ! (and where it stands) would show through the fog, and paths steer round it.
  const W = view.grid[0]?.length ?? 0;
  const watchers = view.watchers && new Map(
    [...view.watchers]
      .filter(([k]) => grid[Math.floor(k / W)]?.[k % W] !== "?")
      .map(([k, who]) => [k, who.filter(([x, y]) => isVisible(x, y))] as [number, [number, number][]])
      .filter(([, who]) => who.length > 0),
  );
  const watched = watchers && new Set(watchers.keys());
  return {
    ...view,
    stage: "known",
    grid,
    doors,
    ...(watchers ? { watchers, watched } : {}),
  };
}

/** The view has squares the run hasn't seen (fog of war). */
export function hasFog(view: AnyOverworldView): boolean {
  return view.grid.some((row) => row.includes("?"));
}

/** Whether the raw map contains any tall grass (`"`), regardless of what the run has seen so far. */
export function mapHasGrass(raw: UnfoggedView): boolean {
  return raw.grid.some((row) => row.includes('"'));
}

/**
 * A guess at the unseen part of a view: every `"?"` taken as open (the walk finds out): floor, or
 * water while surfing (a guess of land would end the surf and miss a sea route's edge). Tagged
 * `"guessed"` so TypeScript rejects passing it to `renderView` or `UnfoggedView` consumers.
 */
export function guessUnseenView(view: AnyOverworldView): GuessedOverworldView {
  const open = view.surfing ? "~" : ".";
  return {
    ...view,
    stage: "guessed",
    grid: view.grid.map((row) => row.map((ch) => (ch === "?" ? open : ch))),
  };
}

/** How many steps of `dirs` from the player stay on squares the view shows (not `"?"`), counting ledge hops as 2 tiles. */
export function seenSteps(v: AnyOverworldView, dirs: Dir[]): number {
  let c = v.pc;
  let r = v.pr;
  for (let i = 0; i < dirs.length; i++) {
    const [dx, dy] = STEP[dirs[i]];
    const hop = HOP[v.grid[r + dy]?.[c + dx]] === dirs[i] ? 2 : 1;
    c += dx * hop;
    r += dy * hop;
    if (v.grid[r]?.[c] === "?") return i;
  }
  return dirs.length;
}

export interface FrontierPlan {
  /** Full path to the destination (may cross `"?"` when `guessed` is true). */
  dirs: Dir[];
  /** Prefix of `dirs` staying strictly on seen squares, safe to execute in one leg before re-planning. */
  legDirs: Dir[];
  /** True when `legDirs` stops at the fog frontier short of `dirs`. */
  partial: boolean;
  /** True when no purely-seen path existed and `dirs` used `guessUnseenView`. */
  guessed: boolean;
  sightStop?: [number, number];
  crosses?: [number, number][];
}

function withFrontierLeg<T extends { dirs: Dir[]; sightStop?: [number, number]; crosses?: [number, number][] }>(
  knownView: AnyOverworldView,
  route: T,
  guessed: boolean,
): T & FrontierPlan {
  const seen = guessed ? seenSteps(knownView, route.dirs) : route.dirs.length;
  const partial = seen > 0 && seen < route.dirs.length;
  return {
    ...route,
    legDirs: partial ? route.dirs.slice(0, seen) : route.dirs,
    partial,
    guessed,
  };
}

/**
 * Plans a walk to `(x, y)` on `view`: uses a seen route when one exists; otherwise (when `(x, y)`
 * itself is seen and `view` has fog) plans optimistically over `guessUnseenView(view)` and truncates
 * `legDirs` at the edge of known ground.
 */
export function planFrontierTarget(
  view: AnyOverworldView,
  x: number,
  y: number,
  sight: SightOptions,
): (FrontierPlan & { face: Dir | null }) | null {
  const seenRoute = findPath(view, x, y, sight);
  if (seenRoute) return withFrontierLeg(view, seenRoute, false);
  if (view.grid[y - view.originY]?.[x - view.originX] === "?" || !hasFog(view)) return null;
  const guessedRoute = findPath(guessUnseenView(view), x, y, sight);
  return guessedRoute ? withFrontierLeg(view, guessedRoute, true) : null;
}

/**
 * Plans a walk to `view`'s map edge in `dir`: prefers a seen route; when no seen way exists (fog of
 * war), guesses through unseen squares as a player heads for an exit they haven't seen (a wall found
 * on the way blocks the walk, and `exitMap` re-plans).
 */
export function planFrontierEdge(
  view: AnyOverworldView,
  dir: Dir,
  sight: SightOptions,
): FrontierPlan | null {
  const seenRoute = pathToEdge(view, dir, sight);
  if (seenRoute) return withFrontierLeg(view, seenRoute, false);
  if (!hasFog(view)) return null;
  const guessedRoute = pathToEdge(guessUnseenView(view), dir, sight);
  return guessedRoute ? withFrontierLeg(view, guessedRoute, true) : null;
}
