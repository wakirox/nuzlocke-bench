// The bridge's HTTP side: save backups on disk, the transcript route, the built
// app (headless), and the guards that keep other sites out.
//
//   const handler = createRequestHandler({ savesDir, roms, transcript, dist, log });
//   createServer(handler)

import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { serveStatic } from "./headless.mjs";
import { readFeed, readUsage } from "./transcript-feed.mjs";
import { restoreRoms, stripRoms } from "./rom-refs.mjs";
import { isLocalHost, isLocalOrigin } from "./local-guards.mjs";

// ---------------------------------------------------------------------------
// Save backups on disk. The page's IndexedDB can vanish (a browser pane without persistent
// storage, cleared site data), so it mirrors every write here: GET /backup returns all
// keys, PUT /backup/<key> stores one, DELETE removes it. Files live in <project>/saves.

/** The file that holds one save key in the saves folder. */
export const saveFileOf = (savesDir) => (key) => join(savesDir, `${encodeURIComponent(key)}.json`);

/** The request handler of the bridge's HTTP server. `dist` is the built app (null: not served), `transcript` the transcript file (or null). */
export function createRequestHandler({ savesDir: SAVES_DIR, roms: ROMS, transcript: TRANSCRIPT, dist: DIST, log }) {
  const fileOf = saveFileOf(SAVES_DIR);

  function handleBackup(req, res) {
    const origin = req.headers.origin;
    if (!isLocalOrigin(origin)) {
      res.writeHead(403).end();
      return;
    }
    const cors = {
      "Access-Control-Allow-Origin": origin ?? "*",
      "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      // Chrome's Private Network Access preflight for localhost requests.
      "Access-Control-Allow-Private-Network": "true",
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors).end();
      return;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    const m = url.pathname.match(/^\/backup(?:\/(.+))?$/);
    if (!m) {
      res.writeHead(404, cors).end();
      return;
    }
    let key = null;
    try {
      key = m[1] ? decodeURIComponent(m[1]) : null;
    } catch {
      res.writeHead(400, cors).end();
      return;
    }
    try {
      mkdirSync(SAVES_DIR, { recursive: true });
      if (req.method === "GET" && !key) {
        const all = {};
        for (const f of readdirSync(SAVES_DIR)) {
          if (!f.endsWith(".json")) continue;
          // One unreadable save (half-written, hand-edited) is left out, not the reason none load.
          try {
            all[decodeURIComponent(f.slice(0, -5))] = restoreRoms(JSON.parse(readFileSync(join(SAVES_DIR, f), "utf8")), ROMS);
          } catch (e) {
            log("backup read skipped:", f, e.message);
          }
        }
        res.writeHead(200, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify(all));
        return;
      }
      if (req.method === "DELETE" && key) {
        rmSync(fileOf(key), { force: true });
        res.writeHead(204, cors).end();
        return;
      }
      if (req.method === "PUT" && key) {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          try {
            const body = Buffer.concat(chunks).toString("utf8");
            const value = JSON.parse(body); // only store valid JSON
            const tmp = `${fileOf(key)}.tmp`;
            writeFileSync(tmp, JSON.stringify(stripRoms(value, ROMS)));
            renameSync(tmp, fileOf(key)); // atomic: never leave a half-written save
            res.writeHead(204, cors).end();
          } catch (e) {
            log("backup write failed:", key, e.message);
            res.writeHead(500, cors).end(String(e.message));
          }
        });
        return;
      }
      res.writeHead(405, cors).end();
    } catch (e) {
      log("backup error:", e.message);
      res.writeHead(500, cors).end(String(e.message));
    }
  }

  function route(req, res) {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if ((path === "/transcript" || path === "/transcript/usage") && req.method === "GET") {
      const from = Number(new URL(req.url ?? "/", "http://localhost").searchParams.get("from") ?? 0) || 0;
      // Like /backup: only pages on this machine (same-origin GETs carry no Origin).
      const origin = req.headers.origin;
      if (origin && !isLocalOrigin(origin)) return void res.writeHead(403).end();
      res.writeHead(200, { ...(origin ? { "Access-Control-Allow-Origin": origin } : {}), "Content-Type": "application/json" })
        .end(JSON.stringify(path === "/transcript" ? { ...readFeed(TRANSCRIPT, from), usage: readUsage(TRANSCRIPT) } : { usage: readUsage(TRANSCRIPT) }));
      return;
    }
    if (DIST && path !== "/backup" && !path.startsWith("/backup/") && serveStatic(DIST, req, res)) return;
    handleBackup(req, res);
  }

  return (req, res) => {
    if (!isLocalHost(req.headers.host)) return void res.writeHead(403).end();
    // One bad request answers with an error; it never takes the server (and the run) down.
    try {
      route(req, res);
    } catch (e) {
      log("request failed:", req.method, req.url, e?.message ?? e);
      if (res.headersSent) res.destroy();
      else res.writeHead(e instanceof URIError ? 400 : 500).end();
    }
  };
}
