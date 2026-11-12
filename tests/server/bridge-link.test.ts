// The server's link to the game page (mcp-server/bridge-link.mjs), with a fake page on a real
// WebSocket: calls go through, and after new_run (the page reloads) calls wait for the new page,
// or fail with what happened when it doesn't come back.

import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
// @ts-expect-error the ws package ships no type declarations
import WebSocket from "ws";
// @ts-expect-error plain ESM module without type declarations
import { createBridgeLink } from "../../mcp-server/bridge-link.mjs";

let http: Server | null = null;
const pages: WebSocket[] = [];

afterEach(async () => {
  for (const p of pages.splice(0)) p.close();
  await new Promise<void>((ok) => (http ? http.close(() => ok()) : ok()));
  http = null;
});

async function start(reloadWaitMs = 300) {
  const link = createBridgeLink({ log: () => {}, port: 0, headless: false, logFile: "-", reloadWaitMs });
  http = createServer();
  link.attach(http);
  await new Promise<void>((ok) => http!.listen(0, "127.0.0.1", () => ok()));
  const { port } = http.address() as { port: number };
  /** A page that answers every request with { ok: method }. */
  const page = () => new Promise<WebSocket>((ok, fail) => {
    const ws: WebSocket = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { origin: "http://localhost:5173" } });
    ws.on("message", (data: Buffer) => {
      const msg = JSON.parse(String(data));
      ws.send(JSON.stringify({ id: msg.id, result: { ok: msg.method } }));
    });
    ws.on("open", () => (pages.push(ws), ok(ws)));
    ws.on("error", fail);
  });
  const connected = async () => {
    for (let i = 0; i < 50 && !link.isConnected(); i++) await new Promise((r) => setTimeout(r, 10));
  };
  return { link, page, connected };
}

describe("the link to the game page", () => {
  it("passes calls to the page and back", async () => {
    const { link, page, connected } = await start();
    await page();
    await connected();
    expect(await link.call("get_state")).toEqual({ ok: "get_state" });
  });

  it("after new_run, waits for the reloaded page instead of failing on the gap", async () => {
    const { link, page, connected } = await start(2000);
    const first = await page();
    await connected();
    await link.call("new_run");
    first.close(); // the page reloads…
    const next = link.call("get_state"); // …a call made meanwhile waits
    setTimeout(() => void page(), 100); // …and the new page connects
    expect(await next).toEqual({ ok: "get_state" });
  });

  it("says the page didn't come back when it doesn't reconnect after new_run", async () => {
    const { link, page, connected } = await start(200);
    const first = await page();
    await connected();
    await link.call("new_run");
    first.close();
    await expect(link.call("get_state")).rejects.toThrow(/hasn't reconnected after/);
    await expect(link.waitForReload(100)).rejects.toThrow(/hasn't reconnected/);
  });
});
