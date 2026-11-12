// Reading the text box as it changes. The game prints two lines, then either scrolls them up one
// at a time (the second line moves up and a new one prints below it) or clears the box for the
// next paragraph. Comparing with the box as last read keeps each line once and in order, even
// when two messages share a line (a nickname, then "was poisoned!"; the nickname, then "used …!"),
// and a line read while it was still printing is finished, not repeated.

/** b is line a printed further (a was read mid-print). A finished sentence doesn't grow. */
const grows = (a: string, b: string) => a === b || (b.startsWith(a) && !/[.!?]$/.test(a));

/**
 * What the box `now` adds to the box as last read (`prev`): `replaceLast` is the full text of the
 * last line already recorded when that one was read mid-print, `add` the lines after it.
 */
export function newBoxLines(prev: string[], now: string[]): { replaceLast: string | null; add: string[] } {
  if (!now.length) return { replaceLast: null, add: [] };
  const last = prev.at(-1);
  if (last !== undefined) {
    // The same box, printed further since.
    const n = prev.length;
    if (n <= now.length && prev.slice(0, -1).every((l, i) => l === now[i]) && grows(last, now[n - 1])) {
      return { replaceLast: now[n - 1] === last ? null : now[n - 1], add: now.slice(n) };
    }
    // Scrolled up: its first line is the last one read.
    if (grows(last, now[0])) return { replaceLast: now[0] === last ? null : now[0], add: now.slice(1) };
  }
  return { replaceLast: null, add: now };
}
