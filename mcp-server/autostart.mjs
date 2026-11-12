// Headless runs: launching the headless Chromium once the bridge listens, and starting a run by
// itself from NUZLOCKE_ROM (see headless.mjs for the browser side).

import { existsSync, readFileSync } from "node:fs";
import { applyPreset } from "./benchmark.mjs";
import { launchHeadless } from "./headless.mjs";

/**
 * The headless Chromium of this server: `start()` opens the page once the bridge listens,
 * `closeOnExit()` makes sure it doesn't outlive the MCP client.
 */
export function createHeadlessLauncher({ port, headed, log }) {
  let stopHeadless = null;
  return {
    start() {
      // A visible window (NUZLOCKE_HEADED) is for watching: the page then paces frames like a normal tab.
      // NUZLOCKE_HEADED=fast: the window, but at full speed (it redraws every refresh instead of pacing).
      const watch = headed ? `&watch${process.env.NUZLOCKE_HEADED === "fast" ? "=fast" : ""}` : "";
      launchHeadless({ url: `http://127.0.0.1:${port}/?ai&headless${watch}`, log })
        .then((stop) => { stopHeadless = stop; })
        .catch((e) => log("headless launch failed:", e.message));
    },
    // Don't leave a headless Chromium behind when the MCP client goes away.
    closeOnExit() {
      const quit = async () => {
        await stopHeadless?.();
        process.exit(0);
      };
      process.stdin.on("close", quit);
      process.on("SIGINT", quit);
      process.on("SIGTERM", quit);
    },
  };
}

/**
 * Headless with NUZLOCKE_ROM: start a run by itself when the save folder has none, so every
 * benchmark attempt begins the same way (NUZLOCKE_MODE picks the ruleset; default nuzlocke).
 * `pending()` is the promise tools wait for until that run exists (null when there is none to wait for).
 */
export function createAutoStart({ headless, preset, rulesetIds, fileOf, call, log }) {
  /**
   * Whether the save folder holds a run the app can resume. A run saved under a ruleset that was
   * removed since (or an unreadable file) doesn't count: the page won't resume it either.
   */
  function hasPlayableRun() {
    if (!existsSync(fileOf("run"))) return false;
    try {
      return rulesetIds.includes(JSON.parse(readFileSync(fileOf("run"), "utf8"))?.mode);
    } catch {
      return false;
    }
  }

  let autoStarted = false;
  // Until that run exists, tools wait for it (see wrap): the model's first calls (get_rules…)
  // must describe the run it will play, not a page with no run yet.
  let markAutoStartDone = () => {};
  let autoStartReady = headless && process.env.NUZLOCKE_ROM && !hasPlayableRun()
    ? new Promise((resolve) => (markAutoStartDone = () => { autoStartReady = null; resolve(); }))
    : null;

  function maybeAutoStart() {
    const rom = process.env.NUZLOCKE_ROM;
    if (!headless || !rom || autoStarted || hasPlayableRun()) return markAutoStartDone();
    autoStarted = true;
    setTimeout(async () => {
      try {
        const params = applyPreset(preset, {
          mode: preset ? undefined : process.env.NUZLOCKE_MODE ?? rulesetIds[0],
          hard_level_caps: preset ? undefined : /^(1|true|yes)$/i.test(process.env.NUZLOCKE_HARD_LEVEL_CAPS ?? "") || undefined,
          first_rival_free: preset ? undefined : /^(1|true|yes)$/i.test(process.env.NUZLOCKE_FIRST_RIVAL_FREE ?? "") || undefined,
          goal_badges: preset || !process.env.NUZLOCKE_GOAL_BADGES ? undefined : Number(process.env.NUZLOCKE_GOAL_BADGES),
          rom: readFileSync(rom).toString("base64"),
          rom_name: rom.split(/[\\/]/).pop(),
        });
        log(`auto-starting a ${params.mode} run from ${rom}`);
        await call("new_run", params);
      } catch (e) {
        log("auto-start failed:", e.message);
      } finally {
        markAutoStartDone();
      }
    }, 1500); // let the page finish booting first
  }

  return { maybeAutoStart, pending: () => autoStartReady };
}
