// Smoke test for the MCP server: spawns it over stdio, waits for the browser
// tab to connect ("🤖 AI control"), then exercises the tools.
//   node scripts/mcp-smoke.mjs
//   node scripts/mcp-smoke.mjs --headless [--rom path/to/red.gb]   (no tab: needs npm run build + Playwright)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "smoke", version: "0.0.1" });
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i < 0 ? undefined : argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "1";
};
// The SDK passes the server only a few env variables by default: hand over ours, plus the flags.
const env = { ...process.env };
if (flag("--headless")) env.NUZLOCKE_HEADLESS = "1";
if (flag("--rom")) env.NUZLOCKE_ROM = flag("--rom");
await client.connect(new StdioClientTransport({ command: process.execPath, args: ["mcp-server/server.mjs"], env }));

const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));

const text = (r) => r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
const call = async (name, args = {}) => {
  /** @type {any} */
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) throw new Error(`${name}: ${text(r)}`);
  return r;
};

console.log("waiting for the browser to connect…");
for (let i = 0; ; i++) {
  try {
    await call("read_screen_text");
    break;
  } catch (e) {
    if (i > 90) throw e;
    await new Promise((r) => setTimeout(r, 1000));
  }
}
console.log("connected.");

console.log("--- rules ---\n" + text(await call("get_rules")).slice(0, 300));
let r = await call("press", { buttons: "wait:200 start wait:60 start wait:60 a" });
console.log("--- after start ---\n" + text(r).split("\n").slice(0, 20).join("\n"));
r = await call("get_screen", { scale: 2 });
const img = r.content.find((c) => c.type === "image");
console.log("--- screenshot ---", img ? `${img.mimeType}, ${img.data.length} base64 chars` : "missing");
r = await call("get_state");
console.log("--- state ---\n" + text(r).slice(0, 600));
await client.close();
