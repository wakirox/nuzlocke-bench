// Steering the party screen's cursor by what the screen shows. The party screen fades in, and the
// game drops presses made during the fade: counting presses from where the cursor should be can
// land on someone else, so each press is checked against the ▶ on screen.

/** What steering needs from the screen and the buttons. */
export interface PartyCursorIo {
  /** The party slot (0-based) the ▶ is on, or -1 while the party screen isn't drawn. */
  cursor(): number;
  /** Lets a few frames pass. */
  wait(): Promise<void>;
  /** Presses up or down once. */
  press(dir: "up" | "down"): Promise<void>;
}

/**
 * Moves the party screen's cursor to `slot` (0-based): waits for the screen to be drawn, then
 * steps one press at a time, looking where the ▶ is after each. True only when it's on `slot`;
 * the caller presses A only then.
 */
export async function steerPartyCursor(io: PartyCursorIo, slot: number): Promise<boolean> {
  for (let i = 0; i < 20 && io.cursor() < 0; i++) await io.wait();
  for (let tries = 0; tries < 12; tries++) {
    const at = io.cursor();
    if (at < 0 || at === slot) break;
    await io.press(at < slot ? "down" : "up");
  }
  return io.cursor() === slot;
}
