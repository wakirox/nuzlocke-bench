// What the model is offered: every tool's name, description and arguments, from the real server
// under the benchmark preset. The snapshot (tool-schema.snap.json) changes only on purpose: a tool's
// wording or arguments are part of the benchmark, so a change shows up in review. After an
// intended change: npx vitest run tests/server/tool-schema.test.ts -u, and check the diff.

import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function toolsUnder(preset: string, extraEnv: Record<string, string> = {}) {
  const client = new Client({ name: "tool-schema-test", version: "1.0.0" });
  const env: Record<string, string> = { ...(process.env as Record<string, string>), NUZLOCKE_BENCHMARK: preset, NUZLOCKE_RUN_LOG: "off", NUZLOCKE_BRIDGE_PORT: "0", ...extraEnv };
  delete env.NUZLOCKE_HEADLESS;
  if (!("NUZLOCKE_GRID" in extraEnv)) delete env.NUZLOCKE_GRID;
  if (!("NUZLOCKE_BOULDER_SWITCH" in extraEnv)) delete env.NUZLOCKE_BOULDER_SWITCH;
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ["mcp-server/server.mjs"], env, stderr: "ignore" }));
  try {
    const { tools } = await client.listTools();
    const offered = tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
    // Sorted for the schema snapshot (a readable diff per tool); the order as offered is pinned on its own.
    return Object.assign([...offered].sort((a, b) => a.name.localeCompare(b.name)), {
      order: offered.map((t) => t.name),
      instructions: client.getInstructions() ?? "",
    });
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
    // The model reads the tool list in this order: moving a tool is a change to what it sees, like
    // rewording one (a refactor that re-registered the tools once reordered them all).
    expect(hints.order.filter((n) => n !== "hint")).toEqual(plain.order);
    await expect(hints.order.join("\n") + "\n").toMatchFileSnapshot("./tool-order.snap.txt");
    // The server's instructions go into the model's system prompt.
    expect(hints.instructions).toBe(plain.instructions);
    await expect(plain.instructions + "\n").toMatchFileSnapshot("./server-instructions.snap.txt");
  }, 30_000);

  it("swaps only get_map's grid note under NUZLOCKE_GRID=compact, leaving everything else unchanged", async () => {
    const plain = await toolsUnder("hardcore-nuzlocke+firstrival+hardcap");
    const compact = await toolsUnder("hardcore-nuzlocke+firstrival+hardcap", { NUZLOCKE_GRID: "compact" });
    expect(plain.find((t) => t.name === "get_map")?.description).toContain("each column's last digit");
    const compactDesc = compact.find((t) => t.name === "get_map")?.description ?? "";
    expect(compactDesc).toContain("5-column blocks");
    expect(compactDesc).toContain("floor switches");
    expect(compactDesc).toContain("Cliffs");
    expect(compactDesc).not.toContain("each column's last digit");
    expect(compact.order).toEqual(plain.order);
    expect(compact.instructions).toBe(plain.instructions);
    const same = (t: (typeof plain)[number]) => (t.name === "get_map" ? { ...t, description: "" } : t);
    expect(compact.map(same)).toEqual(plain.map(same));
  }, 30_000);

  it("adds b to get_map's legend only when NUZLOCKE_BOULDER_SWITCH is on, leaving everything else unchanged", async () => {
    const plain = await toolsUnder("hardcore-nuzlocke+firstrival+hardcap");
    const withSwitch = await toolsUnder("hardcore-nuzlocke+firstrival+hardcap", { NUZLOCKE_BOULDER_SWITCH: "1" });
    expect(plain.find((t) => t.name === "get_map")?.description).not.toContain("b boulder on a floor switch");
    expect(withSwitch.find((t) => t.name === "get_map")?.description).toContain("B boulder, b boulder on a floor switch, o floor switch");
    expect(withSwitch.order).toEqual(plain.order);
    expect(withSwitch.instructions).toBe(plain.instructions);
    const same = (t: (typeof plain)[number]) => (t.name === "get_map" ? { ...t, description: "" } : t);
    expect(withSwitch.map(same)).toEqual(plain.map(same));

    // Compact + boulderSwitch together: get_map's description includes b in both Map legend and the compact Points note.
    const both = await toolsUnder("hardcore-nuzlocke+firstrival+hardcap", { NUZLOCKE_GRID: "compact", NUZLOCKE_BOULDER_SWITCH: "1" });
    const bothDesc = both.find((t) => t.name === "get_map")?.description ?? "";
    expect(bothDesc).toContain("b boulder on a floor switch");
    expect(bothDesc).toContain("I C S P $ H B b o O");
  }, 30_000);
});
