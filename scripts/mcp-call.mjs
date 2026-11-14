// One-shot MCP tool call against the running browser tab (dev helper).
//   node scripts/mcp-call.mjs press '{"buttons":"a a a"}'
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [tool = "get_state", rawArgs = "{}"] = process.argv.slice(2);
const client = new Client({ name: "mcp-call", version: "0.0.1" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ["mcp-server/server.mjs"], stderr: "ignore" }));

/** @type {any} */
let result;
for (let i = 0; ; i++) {
  result = await client.callTool({ name: tool, arguments: JSON.parse(rawArgs) });
  const msg = result.content?.[0]?.text ?? "";
  if (!(result.isError && /No game connected/.test(msg)) || i > 30) break;
  await new Promise((r) => setTimeout(r, 500)); // browser reconnects every 2 s
}
for (const c of result.content) {
  if (c.type === "text") console.log(c.text);
  else {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync("dev-rom", { recursive: true });
    writeFileSync("dev-rom/last-screen.png", Buffer.from(c.data, "base64"));
    console.log(`[${c.type} ${c.mimeType} saved to dev-rom/last-screen.png]`);
  }
}
await client.close();
process.exit(result.isError ? 1 : 0);
