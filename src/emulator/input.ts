import type { Button, GameBoy } from "./gameboy";

export const KEY_BINDINGS: Record<string, Button> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyX: "a",
  KeyZ: "b",
  Enter: "start",
  Backspace: "select",
  ShiftRight: "select",
};

// Standard Gamepad mapping, positional like RetroArch: bottom face = B, right face = A.
const PAD_BUTTONS: [number, Button][] = [
  [1, "a"], [0, "b"], [2, "b"], [3, "a"],
  [9, "start"], [8, "select"],
  [12, "up"], [13, "down"], [14, "left"], [15, "right"],
];
const PAD_FAST_FORWARD = [5, 7]; // R1 / R2
const STICK_DEADZONE = 0.5;

export interface InputHooks {
  onFastForward: (held: boolean) => void;
  onSaveState: () => void;
  onLoadState: () => void;
}

/** Wires keyboard, gamepads and the on-screen pad to a GameBoy. Returns a disposer. */
export function attachInput(gb: GameBoy, hooks: InputHooks, touchRoot: HTMLElement | null): () => void {
  const isTyping = (ev: KeyboardEvent) =>
    ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement;

  const keyDown = (ev: KeyboardEvent) => {
    if (isTyping(ev)) return;
    gb.resumeAudio();
    const btn = KEY_BINDINGS[ev.code];
    if (btn) {
      gb.setButton(btn, true);
      ev.preventDefault();
    } else if (ev.code === "Space") {
      hooks.onFastForward(true);
      ev.preventDefault();
    } else if (ev.code === "F2" && !ev.repeat) {
      hooks.onSaveState();
      ev.preventDefault();
    } else if (ev.code === "F4" && !ev.repeat) {
      hooks.onLoadState();
      ev.preventDefault();
    }
  };
  const keyUp = (ev: KeyboardEvent) => {
    if (isTyping(ev)) return;
    const btn = KEY_BINDINGS[ev.code];
    if (btn) {
      gb.setButton(btn, false);
      ev.preventDefault();
    } else if (ev.code === "Space") {
      hooks.onFastForward(false);
      ev.preventDefault();
    }
  };
  const blur = () => {
    for (const b of ["up", "down", "left", "right", "a", "b", "start", "select"] as Button[]) gb.setButton(b, false);
    hooks.onFastForward(false);
  };
  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);
  window.addEventListener("blur", blur);

  // Gamepads are polled; only push changes so keyboard input isn't clobbered.
  const padState = new Map<Button, boolean>();
  let padFF = false;
  let polling = 0;
  const poll = () => {
    polling = requestAnimationFrame(poll);
    const pads = navigator.getGamepads?.() ?? [];
    const pressed = new Map<Button, boolean>();
    let ff = false;
    let any = false;
    for (const pad of pads) {
      if (!pad) continue;
      any = true;
      for (const [idx, btn] of PAD_BUTTONS) if (pad.buttons[idx]?.pressed) pressed.set(btn, true);
      const [x = 0, y = 0] = pad.axes;
      if (x < -STICK_DEADZONE) pressed.set("left", true);
      if (x > STICK_DEADZONE) pressed.set("right", true);
      if (y < -STICK_DEADZONE) pressed.set("up", true);
      if (y > STICK_DEADZONE) pressed.set("down", true);
      if (PAD_FAST_FORWARD.some((i) => pad.buttons[i]?.pressed)) ff = true;
    }
    if (!any) return;
    for (const b of ["up", "down", "left", "right", "a", "b", "start", "select"] as Button[]) {
      const now = pressed.get(b) ?? false;
      if ((padState.get(b) ?? false) !== now) {
        padState.set(b, now);
        gb.setButton(b, now);
        if (now) gb.resumeAudio();
      }
    }
    if (ff !== padFF) {
      padFF = ff;
      hooks.onFastForward(ff);
    }
  };
  polling = requestAnimationFrame(poll);

  // On-screen buttons: any element with data-gb-button="a" etc.
  const touchCleanups: (() => void)[] = [];
  if (touchRoot) {
    touchRoot.querySelectorAll<HTMLElement>("[data-gb-button]").forEach((el) => {
      const btn = el.dataset.gbButton as Button;
      const down = (ev: PointerEvent) => {
        ev.preventDefault();
        el.setPointerCapture(ev.pointerId);
        el.classList.add("pressed");
        gb.resumeAudio();
        gb.setButton(btn, true);
      };
      const up = (ev: PointerEvent) => {
        ev.preventDefault();
        el.classList.remove("pressed");
        gb.setButton(btn, false);
      };
      el.addEventListener("pointerdown", down);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      touchCleanups.push(() => {
        el.removeEventListener("pointerdown", down);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
      });
    });
  }

  return () => {
    window.removeEventListener("keydown", keyDown);
    window.removeEventListener("keyup", keyUp);
    window.removeEventListener("blur", blur);
    cancelAnimationFrame(polling);
    touchCleanups.forEach((f) => f());
  };
}
