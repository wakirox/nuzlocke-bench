// Reading the text box line by line as it scrolls.

import { describe, expect, it } from "vitest";
import { newBoxLines } from "../../src/bridge/text-lines";

/** Feeds boxes as advance_text reads them, the way it records messages. */
const read = (boxes: string[][]) => {
  const out: string[] = [];
  let last: string[] = [];
  for (const b of boxes) {
    const { replaceLast, add } = newBoxLines(last, b);
    if (replaceLast !== null) out[out.length - 1] = replaceLast;
    out.push(...add);
    if (b.length) last = b;
  }
  return out;
};

describe("newBoxLines", () => {
  it("finishes a line read while it was still printing instead of repeating it", () => {
    // A shop clerk's one-line reply came out twice, the second time finished.
    expect(read([["Good day!", "What can I do?"], ["Have a look"], ["Have a look."]])).toEqual(["Good day!", "What can I do?", "Have a look."]);
    expect(read([["Wild MONA", "appea"], ["Wild MONA", "appeared!"]])).toEqual(["Wild MONA", "appeared!"]);
    expect(read([["Hello there!", "Welcome"], ["Welcome to the", "world of monsters!"]])).toEqual(["Hello there!", "Welcome to the", "world of monsters!"]);
  });

  it("doesn't take a finished sentence for a line still printing", () => {
    expect(read([["NOVA used", "BLAZE!"], ["BLAZE! It hit", "hard!"]])).toEqual(["NOVA used", "BLAZE!", "BLAZE! It hit", "hard!"]);
  });

  it("keeps lines in order when two messages share their first line", () => {
    // Battle call 139 of run 2026-10-16T07-00-15-324Z came out as "used …!" before the nickname.
    expect(read([["Enemy MONA", "used STING!"], ["NOVA", "was poisoned!"], ["NOVA", "used CLAW!"]]))
      .toEqual(["Enemy MONA", "used STING!", "NOVA", "was poisoned!", "NOVA", "used CLAW!"]);
  });

  it("takes only the new line when the box scrolls up", () => {
    expect(read([["Hello there!", "Welcome to the"], ["Welcome to the", "world of monsters!"]]))
      .toEqual(["Hello there!", "Welcome to the", "world of monsters!"]);
  });

  it("records a box read twice, or read before its second line printed, once", () => {
    expect(read([["Go! NOVA!"], ["Go! NOVA!"], [], ["Wild MONA"], ["Wild MONA", "appeared!"]]))
      .toEqual(["Go! NOVA!", "Wild MONA", "appeared!"]);
  });
});
