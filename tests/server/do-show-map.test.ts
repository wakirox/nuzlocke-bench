// The real server's `do` tool with a fake game page: show_map on the batch's last move shows the
// map, the same as on that move called alone.

import { mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
// @ts-expect-error the ws package ships no type declarations
import WebSocket from "ws";

const MAP = "Map exits: north\n#..#\n#.@#";

const freePort = () => new Promise<number>((ok) => {
  const s = createServer().listen(0, "127.0.0.1", () => {
    const { port } = s.address() as { port: number };
    s.close(() => ok(port));
  });
});

async function withServer(run: (client: Client) => Promise<void>) {
  const port = await freePort();
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    NUZLOCKE_RUN_LOG: "off", NUZLOCKE_BRIDGE_PORT: String(port), NUZLOCKE_SAVES_DIR: mkdtempSync(join(tmpdir(), "do-map-")),
  };
  delete env.NUZLOCKE_HEADLESS;
  delete env.NUZLOCKE_BENCHMARK;
  const client = new Client({ name: "do-show-map-test", version: "1.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ["mcp-server/server.mjs"], env, stderr: "ignore" }));
  let page: WebSocket | null = null;
  try {
    // The fake page: every move ends on the same spot, with the area's map.
    for (let i = 0; i < 100 && !page; i++) {
      page = await new Promise<WebSocket | null>((ok) => {
        const ws: WebSocket = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { origin: "http://localhost:5173" } });
        ws.on("open", () => ok(ws));
        ws.on("error", () => setTimeout(() => ok(null), 50));
      });
    }
    page!.on("message", (data: Buffer) => {
      const msg = JSON.parse(String(data));
      page!.send(JSON.stringify({ id: msg.id, result: { status: { location: "ROUTE 1 [ROUTE_1] x1 y1", battle: "none" }, map: MAP, screenText: [] } }));
    });
    await run(client);
  } finally {
    page?.close();
    await client.close();
  }
}

const textOf = (r: unknown) => ((r as { content: { text?: string }[] }).content).map((c) => c.text ?? "").join("\n");

describe("do with show_map", () => {
  it("shows the map when the last move asks for it, and leaves it out when it doesn't", async () => {
    await withServer(async (client) => {
      const asked = textOf(await client.callTool({ name: "do", arguments: { steps: [{ tool: "walk", args: { path: "U1" } }, { tool: "walk", args: { path: "U1", show_map: true } }] } }));
      expect(asked).toContain(`Map:\n${MAP}`);
      const not = textOf(await client.callTool({ name: "do", arguments: { steps: [{ tool: "walk", args: { path: "U1" } }, { tool: "walk", args: { path: "U1" } }] } }));
      expect(not).toContain("Map: not shown (get_map shows it)");
    });
  }, 30_000);
});
