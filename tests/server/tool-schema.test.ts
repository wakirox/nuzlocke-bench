// What the model is offered: every tool's name, description and arguments, from the real server
// under the benchmark preset. The snapshot (tool-schema.snap.json) changes only on purpose: a tool's
// wording or arguments are part of the benchmark, so a change shows up in review. After an
// intended change: npx vitest run tests/server/tool-schema.test.ts -u, and check the diff.

import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function toolsUnder(preset: string) {
  const client = new Client({ name: "tool-schema-test", version: "1.0.0" });
  const env: Record<string, string> = { ...(process.env as Record<string, string>), NUZLOCKE_BENCHMARK: preset, NUZLOCKE_RUN_LOG: "off", NUZLOCKE_BRIDGE_PORT: "0" };
  delete env.NUZLOCKE_HEADLESS;
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ["mcp-server/server.mjs"], env, stderr: "ignore" }));
  try {
    const { tools } = await client.listTools();
    return tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })).sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    await client.close();
  }
}

describe("the tools the model is offered", () => {
  it("match the snapshot, under the benchmark preset and with hints", async () => {
    const plain = await toolsUnder("hardcore-nuzlocke+firstrival+hardcap");
    const hints = await toolsUnder("hardcore-nuzlocke+firstrival+hardcap+hints");
    // The hints option adds exactly one tool, and get_state then promises each move's effectiveness
    // (shown only in the hints group); nothing else changes.
    expect(hints.map((t) => t.name).filter((n) => !plain.some((p) => p.name === n))).toEqual(["hint"]);
    const promise = (tools: typeof plain) => tools.find((t) => t.name === "get_state")?.description;
    expect(promise(plain)).not.toMatch(/effectiveness/);
    expect(promise(hints)).toMatch(/type\/power\/PP\/effectiveness/);
    const same = (t: (typeof plain)[number]) => (t.name === "get_state" ? { ...t, description: "" } : t);
    expect(hints.filter((t) => t.name !== "hint").map(same)).toEqual(plain.map(same));
    await expect(JSON.stringify(hints, null, 2) + "\n").toMatchFileSnapshot("./tool-schema.snap.json");
  }, 30_000);
});
