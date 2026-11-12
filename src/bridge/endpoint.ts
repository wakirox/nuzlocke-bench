// Where the MCP server is. Normally it listens on 127.0.0.1:7878 next to the dev server;
// in headless mode it serves this page itself (any port), so the page talks to its own origin.
//
//   ?headless         served by the MCP server: use this page's origin, run frames without pacing
//   &watch            with ?headless: someone watches the window (NUZLOCKE_HEADED), so pace frames anyway
//   &watch=fast       watched, but at full speed: redraw every screen refresh, as many frames between as fit
//   ?bridge=<url>     explicit server origin, e.g. http://127.0.0.1:7900

const params = typeof location === "undefined" ? new URLSearchParams() : new URLSearchParams(location.search);

/** Driven by the MCP server's headless browser: nobody is watching, so don't pace frames for viewers. */
export const HEADLESS = params.has("headless");

/** Frames are drawn at a watchable pace: a normal tab, or a headless run shown in a window (?headless&watch). */
export const PACED = !HEADLESS || params.has("watch");

/** A run shown in a window to watch (?headless&watch): the page fits the game screen to the window. */
export const WATCHED = HEADLESS && params.has("watch");

/** Watched at full speed (?headless&watch=fast): the window keeps up without slowing the run. */
export const FAST_WATCH = HEADLESS && params.get("watch") === "fast";

/** HTTP origin of the MCP server (for /backup). */
export const BRIDGE_HTTP = (params.get("bridge") ?? (HEADLESS ? location.origin : "http://127.0.0.1:7878")).replace(/\/+$/, "");

/** WebSocket URL of the MCP bridge. */
export const BRIDGE_WS = BRIDGE_HTTP.replace(/^http/, "ws");
