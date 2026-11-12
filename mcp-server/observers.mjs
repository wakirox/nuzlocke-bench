// Watch-only observers (bench-run --observer <module>): an outside module that may look at a run
// while it plays, never play it. It gets the headless page as it opens and closes (to watch it), a
// prefix of its own on the game's HTTP port (to show what it sees), a log, and the run's file paths.
// It gets nothing that plays: no bridge, no tools, no input. What the model sees is unchanged, so a
// run with an observer stays an official result (docs/benchmark.md).
//
// The module's default export is called once with that API; `export const wantsFrames = true` asks
// the headless page to draw its frames (a headless page otherwise skips drawing, to play faster).
//
//   export const wantsFrames = true;
//   export default function observe({ onPage, route, log, savesDir, transcript }) { … }

import { pathToFileURL } from "node:url";

/** Prefixes an observer may not take: the app, the save backups, the transcript. */
const RESERVED = /^\/(?:$|backup(?:\/|$)|transcript(?:\/|$)|assets(?:\/|$)|index\.html$)/;

/**
 * Loads the observer at `path` (an absolute module path) and returns what the server needs from it:
 * `wantsFrames`, `page(p)` to hand it each page (null when one closes), and `handle(req, res)` that
 * answers the requests under its prefixes (false when a request isn't its own).
 */
export async function loadObserver(path, { savesDir = null, transcript = null, log = () => {} } = {}) {
  const mod = await import(pathToFileURL(path).href);
  if (typeof mod.default !== "function") throw new Error(`observer ${path}: its default export isn't a function`);
  const pageListeners = [];
  const routes = [];
  const api = Object.freeze({
    onPage: (cb) => void pageListeners.push(cb),
    route: (prefix, handler) => {
      if (typeof prefix !== "string" || !prefix.startsWith("/") || prefix.endsWith("/") || RESERVED.test(prefix)) {
        throw new Error(`observer route ${JSON.stringify(prefix)}: a path of its own like "/watch", not the app's`);
      }
      routes.push({ prefix, handler });
    },
    log: (...a) => log("observer:", ...a),
    savesDir,
    transcript,
  });
  await mod.default(api);
  return {
    wantsFrames: mod.wantsFrames === true,
    page(p) {
      for (const cb of pageListeners) {
        try {
          cb(p);
        } catch (e) {
          log("observer page hook failed:", e.message);
        }
      }
    },
    /** Answers a request under one of the observer's prefixes (GET/HEAD, and POST under its own prefix). */
    handle(req, res) {
      const path = new URL(req.url ?? "/", "http://localhost").pathname;
      const r = routes.find((x) => path === x.prefix || path.startsWith(`${x.prefix}/`));
      if (!r) return false;
      if (!["GET", "HEAD", "POST"].includes(req.method ?? "")) {
        res.writeHead(405).end();
        return true;
      }
      r.handler(req, res, path.slice(r.prefix.length));
      return true;
    },
  };
}
