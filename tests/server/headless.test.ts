// Headless mode's static file server (mcp-server/headless.mjs).

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module without type declarations
import { distDir, serveStatic } from "../../mcp-server/headless.mjs";

let root = "";
let server: Server;
let base = "";

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "nuzlocke-bench-dist-"));
  mkdirSync(join(root, "dist", "binjgb"), { recursive: true });
  writeFileSync(join(root, "dist", "index.html"), "<!doctype html><title>app</title>");
  writeFileSync(join(root, "dist", "binjgb", "binjgb.wasm"), new Uint8Array([0, 0x61, 0x73, 0x6d]));
  writeFileSync(join(root, "secret.txt"), "outside dist");
  const dist = distDir(root);
  server = createServer((req, res) => {
    if (!serveStatic(dist, req, res)) res.writeHead(405).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("headless static server", () => {
  it("serves the app page for / (query strings included)", async () => {
    const res = await fetch(`${base}/?ai&headless`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    expect(await res.text()).toContain("<title>app</title>");
  });

  it("serves wasm with the type streaming compilation needs", async () => {
    const res = await fetch(`${base}/binjgb/binjgb.wasm`);
    expect(res.headers.get("content-type")).toBe("application/wasm");
  });

  it("never serves files outside dist/", async () => {
    for (const p of ["/../secret.txt", "/%2e%2e/secret.txt", "/binjgb/%2e%2e/%2e%2e/secret.txt"]) {
      const res = await fetch(base + p);
      expect(res.status, p).not.toBe(200);
    }
  });

  it("404s missing files and leaves other methods to the caller", async () => {
    expect((await fetch(`${base}/nope.js`)).status).toBe(404);
    expect((await fetch(`${base}/index.html`, { method: "PUT", body: "x" })).status).toBe(405);
  });

  it("refuses to start without a build", () => {
    expect(() => distDir(mkdtempSync(join(tmpdir(), "nuzlocke-bench-nobuild-")))).toThrow(/npm run build/);
  });
});
