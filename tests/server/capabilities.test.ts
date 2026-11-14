// What a run shows about the model (mcp-server/capabilities.mjs): tool use, planning and story knowledge,
// measured from its records.

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { capabilitiesOf, joinToolUse, stepCallsOf, toolUseOf } from "../../mcp-server/capabilities.mjs";

const call = (tool: string, args: Record<string, unknown> = {}) => ({ tool, args });

describe("tool use", () => {
  it("counts presses, moves made for the model, batches and loops", () => {
    const calls = [
      call("press", { button: "a" }), call("go_to", { map: "X" }), call("do", { steps: [] }),
      call("walk_to", { x: 1, y: 2 }), call("walk_to", { x: 1, y: 2 }), call("walk_to", { x: 1, y: 2 }), // a loop
      call("fight", { move: 1 }), call("fight", { move: 1 }), call("fight", { move: 1 }), // the same move: play
      call("get_state"),
    ];
    expect(toolUseOf(calls)).toEqual({ calls: 10, presses: 1, planned: 5, batches: 1, loops: 1 });
  });

  it("counts a long loop once, and two loops twice", () => {
    const same = Array.from({ length: 6 }, () => call("press", { button: "b" }));
    expect(toolUseOf(same).loops).toBe(1);
    expect(toolUseOf([...same.slice(0, 3), call("get_state"), ...same.slice(0, 3)]).loops).toBe(2);
  });

  it("adds a continued run's legs up, and has nothing for runs from before it was recorded", () => {
    expect(joinToolUse([{ calls: 2, presses: 1, planned: 0, batches: 0, loops: 0 }, undefined, { calls: 3, presses: 0, planned: 2, batches: 1, loops: 1 }]))
      .toEqual({ calls: 5, presses: 1, planned: 2, batches: 1, loops: 1 });
    expect(joinToolUse([undefined])).toBeNull();
  });
});

describe("story steps", () => {
  it("gives each reached milestone the calls since the one before it, in story order", () => {
    const steps = stepCallsOf({ rival1: 40, badge1: 300, cave1: 450 }, ["rival1", "badge1", "cave1"]);
    expect(steps).toEqual({ rival1: 40, badge1: 260, cave1: 150 });
  });

  it("leaves out milestones not reached or without a call", () => {
    expect(stepCallsOf({ rival1: 40, badge1: 300 }, ["badge1"])).toEqual({ badge1: 300 });
    expect(stepCallsOf({}, ["badge1"])).toEqual({});
  });
});

describe("a run's three groups", () => {
  it("measures tool use, planning and knowledge from the dashboard's run", () => {
    const got = capabilitiesOf({
      calls: 200, rejected: 0, wrongCalls: 10, screenshots: 2, deaths: 3, badges: 2,
      dark: { result: "crossed with light", calls: 100, flashAt: 4 },
      hardAreas: [{ id: "cave", label: "First cave", entries: 2, done: true, calls: 50 }],
      objectiveCalls: { badge1: 120, badge2: 180 }, reached: ["badge1", "badge2"],
      toolUse: { calls: 200, presses: 20, planned: 90, batches: 15, loops: 1 },
    });
    expect(got.tools).toEqual({ failedPct: 5, screenshotPct: 1, plannedMovePct: 45, pressPct: 10, batches: 15, loops: 1 });
    expect(got.planning).toEqual({ flash: true, deathsPerBadge: 1.5 });
    expect(got.knowledge.steps).toEqual({ badge1: 120, badge2: 60 });
  });

  it("says nothing it can't know: no tool use recorded, no tunnel, no badge", () => {
    const got = capabilitiesOf({ calls: 0, deaths: 1, badges: 0, reached: [] });
    expect(got.tools).toMatchObject({ failedPct: null, screenshotPct: null, plannedMovePct: null, batches: null });
    expect(got.planning).toEqual({ flash: null, deathsPerBadge: null });
  });
});
