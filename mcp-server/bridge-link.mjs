// The link to the game page: a WebSocket server on the bridge's HTTP server, the single browser
// socket, and the requests waiting for its answers.
//
//   const link = createBridgeLink({ log, port, headless, logFile, onNewRun, onConnect });
//   link.attach(httpServer);
//   await link.call("get_state");

import { WebSocketServer } from "ws";
import { isLocalHost, isLocalOrigin } from "./local-guards.mjs";

const REQUEST_TIMEOUT_MS = 120_000;
const RELOAD_WAIT_MS = 30_000;

/**
 * `onNewRun` runs after a new_run request was answered; `onConnect` runs when a page connects.
 * `logFile` is only named in the "not connected" message of a headless run.
 */
export function createBridgeLink({ log, port, headless, logFile, onNewRun = () => {}, onConnect = () => {}, reloadWaitMs = RELOAD_WAIT_MS }) {
  let browser = null;
  /** The latest status line the page sent (location, outcome, badges, deaths), for the run log. */
  let lastStatus = null;
  /** Every map the page's results said were entered since takeMapsEntered() (a call can make several bridge requests). */
  let mapsEntered = [];
  let nextId = 1;
  const pending = new Map();
  // A bridge that can't listen (e.g. the port is taken by another server) never gets a game:
  // say why in every tool result instead of only "not connected".
  let bridgeError = null;
  // new_run reloads the page (a fresh emulator for every run). Until the new page connects, calls
  // would reach the old one, which has no run any more: they wait for it (30 s at most).
  let pageReloaded = null;
  let onPageConnected = () => {};

  const onBridgeError = (e) => {
    bridgeError = e.code === "EADDRINUSE" ? `port ${port} is already in use (another server running? NUZLOCKE_BRIDGE_PORT picks another)` : e.message;
    log("bridge error:", e.message);
  };

  function attach(http) {
    const wss = new WebSocketServer({
      server: http,
      verifyClient: ({ origin, req }) => isLocalOrigin(origin) && isLocalHost(req.headers.host),
    });
    http.on("error", onBridgeError);
    wss.on("error", onBridgeError);
    wss.on("connection", (ws) => {
      if (browser) browser.close(1000, "Replaced by a newer tab");
      browser = ws;
      log("browser connected");
      onPageConnected();
      onConnect();
      ws.on("message", (data) => {
        let msg;
        try {
          msg = JSON.parse(String(data));
        } catch {
          return;
        }
        if (msg.type === "hello") return;
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(msg.error));
        else {
          if (msg.result?.status) lastStatus = msg.result.status; // for the run log
          if (Array.isArray(msg.result?.status?.mapsEntered)) mapsEntered.push(...msg.result.status.mapsEntered);
          p.resolve(msg.result);
        }
      });
      ws.on("close", () => {
        if (browser === ws) browser = null;
        log("browser disconnected");
        for (const [id, p] of pending) {
          clearTimeout(p.timer);
          p.reject(new Error("The browser tab disconnected."));
          pending.delete(id);
        }
      });
    });
  }

  /**
   * After new_run: resolves once the reloaded page has connected, or fails with what happened (not
   * the generic "no game connected" a call would get by going ahead). Nothing to wait for otherwise.
   */
  async function waitForReload(ms = reloadWaitMs) {
    if (!pageReloaded) return;
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`The page reloads for the new run and hasn't reconnected after ${Math.round(ms / 1000)} s. Check that AI control is on.`)), ms);
    });
    try {
      await Promise.race([pageReloaded, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function call(method, params = {}) {
    await waitForReload();
    const result = await send(method, params);
    if (method === "new_run") onNewRun(); // a new run starts with no notes
    if (method === "new_run") pageReloaded = new Promise((resolve) => (onPageConnected = () => { pageReloaded = null; resolve(); }));
    return result;
  }

  function send(method, params) {
    if (bridgeError) return Promise.reject(new Error(`The game bridge couldn't start: ${bridgeError}.`));
    if (!browser || browser.readyState !== 1) {
      return Promise.reject(new Error(headless
        ? `The headless game isn't connected (still starting, or the browser failed — see ${logFile}).`
        : "No game connected. Open the web app, start a run, and click \"AI control\".",
      ));
    }
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, REQUEST_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      browser.send(JSON.stringify({ id, method, params }));
    });
  }

  return {
    attach,
    call,
    send,
    waitForReload,
    /** The current page's socket (null when none), to tell whether a newer page has connected. */
    socket: () => browser,
    isConnected: () => !!browser && browser.readyState === 1,
    lastStatus: () => lastStatus,
    takeMapsEntered: () => mapsEntered.splice(0),
  };
}
