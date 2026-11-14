// PUT /backup/<key> refuses a body past the limit (mcp-server/http-routes.mjs), with or without a
// length up front, and stores nothing; a body within it is stored as before.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error plain ESM module without type declarations
import { createRequestHandler, MAX_BACKUP_BYTES, saveFileOf } from "../../mcp-server/http-routes.mjs";

const LIMIT = 1024;
const saves = mkdtempSync(join(tmpdir(), "saves-"));
let server: Server;
let port = 0;

beforeAll(async () => {
  server = createServer(createRequestHandler({ savesDir: saves, roms: new Map(), transcript: null, dist: null, log: () => {}, maxBackupBytes: LIMIT }));
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
  port = (server.address() as { port: number }).port;
});
afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

/** A PUT of `body`; chunked = no Content-Length, the body sent in pieces. */
const put = (key: string, body: string, chunked = false) => new Promise<number>((ok, fail) => {
  const headers: Record<string, string | number> = { "Content-Type": "application/json" };
  if (!chunked) headers["Content-Length"] = Buffer.byteLength(body);
  const req = request({ host: "127.0.0.1", port, method: "PUT", path: `/backup/${key}`, headers }, (res) => {
    res.resume();
    res.on("end", () => ok(res.statusCode ?? 0));
  });
  req.on("error", fail);
  if (chunked) for (let i = 0; i < body.length; i += 256) req.write(body.slice(i, i + 256));
  else req.write(body);
  req.end();
});

const json = (bytes: number) => JSON.stringify({ pad: "x".repeat(bytes - 10) });

describe("save backup size limit", () => {
  it("stores a save within the limit", async () => {
    expect(await put("small", json(LIMIT))).toBe(204);
    expect(JSON.parse(readFileSync(saveFileOf(saves)("small"), "utf8")).pad).toHaveLength(LIMIT - 10);
  });

  it("refuses one past it when the length says so, and stores nothing", async () => {
    expect(await put("big", json(LIMIT + 1))).toBe(413);
    expect(existsSync(saveFileOf(saves)("big"))).toBe(false);
  });

  it("refuses one past it sent without a length", async () => {
    expect(await put("streamed", json(LIMIT * 4), true)).toBe(413);
    expect(existsSync(saveFileOf(saves)("streamed"))).toBe(false);
  });

  it("allows far more than a real save by default", () => {
    // A save with its ROMs base64 is a few MB.
    expect(MAX_BACKUP_BYTES).toBeGreaterThanOrEqual(32 * 1024 * 1024);
  });
});
