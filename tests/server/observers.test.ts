// Watch-only observers (mcp-server/observers.mjs): an outside module that gets the page to look at and
// paths of its own on the game's port, and nothing that plays.

import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error plain ESM module without type declarations
import { loadObserver } from "../../mcp-server/observers.mjs";
// @ts-expect-error plain ESM module without type declarations
import { createRequestHandler } from "../../mcp-server/http-routes.mjs";

// Inside the project: the test runner only loads modules from there.
const dir = mkdtempSync(join(process.cwd(), ".observer-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let n = 0;

/** An observer module on disk: the body of its default export, and whether it wants frames. */
const moduleWith = (body: string, wantsFrames = false) => {
  const file = join(dir, `obs-${n++}.mjs`);
  writeFileSync(file, `${wantsFrames ? "export const wantsFrames = true;\n" : ""}export default function observe(api) {\n${body}\n}\n`);
  return file;
};

/** A request/response pair the handlers can answer, with what they answered. */
const call = (handler: (req: unknown, res: unknown) => unknown, method: string, path: string) => {
  const out = { status: 0, body: "" };
  const res = {
    headersSent: false,
    writeHead(status: number) {
      out.status = status;
      return res;
    },
    end(body = "") {
      out.body = String(body);
      return res;
    },
    setHeader() {},
  };
  const handled = handler({ method, url: path, headers: { host: "127.0.0.1:7890" }, on() {} }, res);
  return { ...out, handled };
};

describe("watch-only observers", () => {
  it("get each page as it opens (null when it closes), and say whether they want frames", async () => {
    const file = moduleWith("globalThis.__pages = []; api.onPage((p) => globalThis.__pages.push(p));", true);
    const obs = await loadObserver(file, { savesDir: "/saves", transcript: "/t.jsonl" });
    expect(obs.wantsFrames).toBe(true);
    obs.page({ id: 1 });
    obs.page(null);
    expect((globalThis as unknown as { __pages: unknown[] }).__pages).toEqual([{ id: 1 }, null]);
    expect((await loadObserver(moduleWith(""))).wantsFrames).toBe(false);
  });

  it("are given paths, a log and their own routes, nothing that plays", async () => {
    const file = moduleWith("globalThis.__api = Object.keys(api).sort();");
    await loadObserver(file);
    expect((globalThis as unknown as { __api: string[] }).__api).toEqual(["log", "onPage", "route", "savesDir", "transcript"]);
  });

  it("can't take the app's paths, the save backups or the transcript", async () => {
    for (const prefix of ["/", "/backup", "/backup/x", "/transcript", "/assets", "watch", "/watch/"]) {
      await expect(loadObserver(moduleWith(`api.route(${JSON.stringify(prefix)}, () => {});`))).rejects.toThrow(/observer route/);
    }
  });

  it("answer GET under their prefix; other methods there get 405, other paths aren't theirs", async () => {
    const file = moduleWith(`api.route("/watch", (req, res, rest) => res.writeHead(200).end("seen " + req.method + " " + rest));`);
    const obs = await loadObserver(file);
    const handle = (method: string, path: string) => call((req, res) => obs.handle(req, res), method, path);
    expect(handle("GET", "/watch/live.jpg")).toMatchObject({ handled: true, status: 200, body: "seen GET /live.jpg" });
    expect(handle("POST", "/watch/tap")).toMatchObject({ handled: true, status: 200 });
    expect(handle("DELETE", "/watch/x")).toMatchObject({ handled: true, status: 405 });
    expect(handle("GET", "/watchers")).toMatchObject({ handled: false });
    expect(handle("POST", "/backup/x")).toMatchObject({ handled: false });
  });

  it("are served by the bridge's HTTP side, which keeps its own routes", async () => {
    const saves = mkdtempSync(join(tmpdir(), "saves-"));
    const obs = await loadObserver(moduleWith(`api.route("/watch", (req, res) => res.writeHead(200).end("watching"));`));
    const handler = createRequestHandler({ savesDir: saves, roms: new Map(), transcript: null, dist: null, log: () => {}, observer: obs });
    expect(call(handler, "GET", "/watch")).toMatchObject({ status: 200, body: "watching" });
    // The save backups are still the bridge's own (an observer can't take /backup).
    expect(call(handler, "GET", "/backup")).toMatchObject({ status: 200, body: "{}" });
  });
});
