// The model's own route book: how to get from one map to a neighbour, written down by the
// model as it finds its way (note_route). Nothing is known in advance — go_to only follows
// links the model recorded this run, so fast travel is earned by having walked it.

import type { Dir } from "./overworld";

/** Cross this map's edge, or step onto a door square (and then `push` that way if the warp needs it). */
export type Link = { exit: Dir } | { door: [number, number]; push?: Dir };

/** from map → to map → how. */
export type Routes = Record<string, Record<string, Link>>;

const DIRS: Dir[] = ["up", "down", "left", "right"];

export function describeLink(from: string, to: string, l: Link): string {
  return "exit" in l
    ? `${from} → ${to}: ${l.exit} edge`
    : `${from} → ${to}: door (${l.door[0]},${l.door[1]})${l.push ? ` then ${l.push}` : ""}`;
}

export class RouteBook {
  constructor(public routes: Routes = {}) {}

  /** Records (or replaces) one link. Throws on a malformed one, so a typo doesn't sit there unnoticed. */
  note(from: string, to: string, how: { exit?: string; door?: [number, number]; push?: string }): Link {
    if (!from || !to) throw new Error("Give both maps, e.g. from ROUTE_1 to ROUTE_2.");
    if (from === to) throw new Error("A route links two different maps.");
    let link: Link;
    if (how.exit && !how.door) {
      if (!DIRS.includes(how.exit as Dir)) throw new Error(`exit must be one of ${DIRS.join(", ")}.`);
      link = { exit: how.exit as Dir };
    } else if (how.door && !how.exit) {
      const [x, y] = how.door;
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) throw new Error("door needs map coordinates x, y.");
      if (how.push && !DIRS.includes(how.push as Dir)) throw new Error(`push must be one of ${DIRS.join(", ")}.`);
      link = how.push ? { door: [x, y], push: how.push as Dir } : { door: [x, y] };
    } else {
      throw new Error("Give exactly one of exit (a direction) or door (x, y).");
    }
    (this.routes[from] ??= {})[to] = link;
    return link;
  }

  forget(from: string, to: string): boolean {
    const had = !!this.routes[from]?.[to];
    if (had) {
      delete this.routes[from][to];
      if (!Object.keys(this.routes[from]).length) delete this.routes[from];
    }
    return had;
  }

  link(from: string, to: string): Link | undefined {
    return this.routes[from]?.[to];
  }

  /** Every link, one per line (empty when nothing is noted yet). */
  list(): string[] {
    return Object.entries(this.routes).flatMap(([from, tos]) => Object.entries(tos).map(([to, l]) => describeLink(from, to, l)));
  }

  /** Shortest chain of noted links from `from` to `to` (maps after `from`), or null. */
  plan(from: string, to: string): string[] | null {
    if (from === to) return [];
    const prev = new Map<string, string>();
    const queue = [from];
    const seen = new Set([from]);
    while (queue.length) {
      const m = queue.shift()!;
      for (const n of Object.keys(this.routes[m] ?? {})) {
        if (seen.has(n)) continue;
        seen.add(n);
        prev.set(n, m);
        if (n === to) {
          const path = [n];
          for (let k = n; prev.get(k) !== from; k = prev.get(k)!) path.unshift(prev.get(k)!);
          return path;
        }
        queue.push(n);
      }
    }
    return null;
  }
}
