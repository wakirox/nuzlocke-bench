// Unit tests for stage-typed map lenses (`maskView`, `guessUnseenView`, `mapHasGrass`) and
// frontier-truncated route planning (`planFrontierTarget`, `planFrontierEdge`).

import { describe, expect, it } from "vitest";
import {
  asRawView,
  guessUnseenView,
  mapHasGrass,
  maskView,
  planFrontierEdge,
  planFrontierTarget,
} from "../../src/bridge/map-lens";
import { renderView, sealFromWholeMap, type OverworldView } from "../../src/bridge/overworld";

function makeView(rows: string[], extra: Partial<OverworldView> = {}): OverworldView {
  const grid = rows.map((r) => [...r]);
  const pr = grid.findIndex((r) => r.includes("@"));
  return { grid, originX: 0, originY: 0, pc: grid[pr].indexOf("@"), pr, ...extra };
}

describe("map-lens stage pipeline", () => {
  it("atomically masks grid, doors, watchers and watched, stripping unseen trainers' sight", () => {
    const raw = asRawView(makeView([
      "@..T",
      "...D",
    ], {
      doors: [{ x: 3, y: 1, to: "CAVE_B1F", tx: 2, ty: 2 }],
      // Square (1,0) is watched by an unseen trainer at (3,0); square (0,1) by a seen trainer at (1,1).
      watchers: new Map([
        [1, [[3, 0]]],
        [4, [[1, 1]]],
      ]),
      watched: new Set([1, 4]),
    }));

    const known = maskView(raw, {
      isVisible: (x) => x <= 1,
      mapDoor: (d) => ({ ...d, to: "?", tx: null, ty: null }),
    });

    expect(known.stage).toBe("known");
    expect(known.grid.map((r) => r.join(""))).toEqual(["@.??", "..??"]);
    // Door at x=3 is unseen and dropped.
    expect(known.doors).toEqual([]);
    // Unseen trainer at (3,0) cannot project sight onto seen square (1,0).
    expect(known.watched?.has(1)).toBe(false);
    expect(known.watched?.has(4)).toBe(true);
    expect(known.watchers?.get(4)).toEqual([[1, 1]]);
  });

  it("enforces view stages at compile time for raw map geometry and player-visible rendering", () => {
    const raw = asRawView(makeView(['@."']));
    const known = maskView(raw, { isVisible: (x) => x === 0 });
    const guessed = guessUnseenView(known);

    expect(mapHasGrass(raw)).toBe(true);
    expect(guessed.stage).toBe("guessed");

    if (Date.now() < 0) {
      // @ts-expect-error fogged ("known") views cannot be used to classify whether a map has grass
      mapHasGrass(known);
      // @ts-expect-error fogged ("known") views cannot be passed as the un-fogged whole map for sealing
      sealFromWholeMap(known, known);
      // @ts-expect-error optimistic ("guessed") views must never be rendered into player-facing map text
      renderView(guessed);
    }
  });

  it("plans frontier-truncated legs across unseen squares for both target and map-edge walks", () => {
    const fogged = maskView(makeView(["@...."], { exits: ["right"] }), {
      isVisible: (x) => x <= 1 || x === 4,
    });
    expect(fogged.grid[0].join("")).toBe("@.??.");

    const toTarget = planFrontierTarget(fogged, 4, 0, { avoidSight: true });
    expect(toTarget).toMatchObject({
      guessed: true,
      partial: true,
      dirs: ["right", "right", "right", "right"],
      legDirs: ["right"],
    });

    const toEdge = planFrontierEdge(fogged, "right", { avoidSight: true });
    expect(toEdge).toMatchObject({
      guessed: true,
      partial: true,
      dirs: ["right", "right", "right", "right"],
      legDirs: ["right"],
    });

    // Already-seen targets aren't marked guessed or truncated.
    const seen = planFrontierTarget(fogged, 1, 0, { avoidSight: true });
    expect(seen).toMatchObject({
      guessed: false,
      partial: false,
      dirs: ["right"],
      legDirs: ["right"],
    });
  });
});
