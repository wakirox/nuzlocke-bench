// The MCP server's HTTP side (mcp-server/server.mjs), started for real: bad requests get an error
// answer and never end the process, other hosts are refused, one corrupt save doesn't hide the rest.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const freePort = () => new Promise<number>((ok) => {
  const s = createServer().listen(0, "127.0.0.1", () => {
    const { port } = s.address() as { port: number };
    s.close(() => ok(port));
  });
});

/** A raw GET, so the Host header can be anything. */
const get = (port: number, path: string, host = `127.0.0.1:${port}`) => new Promise<{ status: number; body: string }>((ok, fail) => {
  const req = request({ host: "127.0.0.1", port, path, headers: { host } }, (res) => {
    let body = "";
    res.on("data", (c) => (body += c));
    res.on("end", () => ok({ status: res.statusCode ?? 0, body }));
  });
  req.on("error", fail);
  req.end();
});

describe("the server's HTTP side", () => {
  let server: ChildProcess;
  let port: number;
  let exited = false;
  const saves = mkdtempSync(join(tmpdir(), "saves-"));

  beforeAll(async () => {
    port = await freePort();
    writeFileSync(join(saves, "good.json"), JSON.stringify({ ok: 1 }));
    writeFileSync(join(saves, "broken.json"), "{ half a save");
    server = spawn(process.execPath, ["mcp-server/server.mjs"], {
      env: { ...process.env, NUZLOCKE_BRIDGE_PORT: String(port), NUZLOCKE_SAVES_DIR: saves, NUZLOCKE_RUN_LOG: "off", NUZLOCKE_HEADLESS: "" },
      stdio: ["pipe", "ignore", "ignore"],
    });
    server.on("exit", () => (exited = true));
    for (let i = 0; i < 100; i++) {
      try {
        await get(port, "/backup");
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    throw new Error("the server didn't start");
  });

  afterAll(() => {
    server?.kill();
    rmSync(saves, { recursive: true, force: true });
  });

  it("answers a malformed address with 400 and keeps running", async () => {
    expect((await get(port, "/backup/%zz")).status).toBe(400);
    expect((await get(port, "/%zz")).status).toBeLessThan(500);
    expect((await get(port, "/transcript?from=-1")).status).toBe(200);
    expect(exited).toBe(false);
    expect((await get(port, "/backup")).status).toBe(200);
  });

  it("refuses a request addressed to another host (DNS rebinding)", async () => {
    expect((await get(port, "/backup", "attacker.example:" + port)).status).toBe(403);
    expect((await get(port, "/backup", `localhost:${port}`)).status).toBe(200);
  });

  it("restores the saves it can read when one is corrupt", async () => {
    const r = await get(port, "/backup");
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ good: { ok: 1 } });
  });
});
