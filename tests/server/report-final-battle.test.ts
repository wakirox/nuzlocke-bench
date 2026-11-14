// The deaths in a run's last battle, for a win's floor (docs/scoring.md).

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { finalBattleDeathsOf, lastBattleDeathsOf } from "../../mcp-server/report.mjs";

const call = (where: string, deaths: number) => ({ tool: "fight", where: `[CHAMPIONS_ROOM] | battle: ${where}`, deaths });

describe("finalBattleDeathsOf", () => {
  it("counts the Champion fight's deaths though the run went on to the Hall of Fame", () => {
    const calls = [call("none", 8), call("trainer", 9), call("trainer", 11), call("none", 12), { tool: "advance_text", where: "[HALL_OF_FAME] | battle: none", deaths: 12 }];
    expect(finalBattleDeathsOf(calls)).toBe(4);
    expect(lastBattleDeathsOf(calls)).toBe(0);
  });

  it("matches lastBattleDeathsOf for a run that ended in battle", () => {
    const calls = [call("none", 2), call("trainer", 3), call("trainer", 5)];
    expect(finalBattleDeathsOf(calls)).toBe(lastBattleDeathsOf(calls));
  });

  it("is 0 with no battle", () => {
    expect(finalBattleDeathsOf([call("none", 1)])).toBe(0);
    expect(finalBattleDeathsOf([])).toBe(0);
  });
});
