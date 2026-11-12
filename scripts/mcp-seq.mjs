// Runs several MCP tool calls over one connection (dev helper).
//   node scripts/mcp-seq.mjs '[["press",{"buttons":"a"}],["advance_text",{}]]'
// Prints each result's first lines (pass a second arg with a line count, default 12).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const steps = JSON.parse(process.argv[2] ?? "[]");
const maxLines = Number(process.argv[3] ?? 12);
const client = new Client({ name: "mcp-seq", version: "0.0.1" });
// The SDK passes the server only a few env variables by default: hand over ours (NUZLOCKE_HEADLESS, NUZLOCKE_ROM…).
await client.connect(new StdioClientTransport({ command: process.execPath, args: ["mcp-server/server.mjs"], env: { ...process.env }, stderr: "ignore" }));

for (const [tool, args = {}] of steps) {
  let r;
  for (let i = 0; ; i++) {
    r = await client.callTool({ name: tool, arguments: args });
    if (!(r.isError && /No game connected|isn.t connected|No game is running/.test(r.content?.[0]?.text ?? "")) || i > 100) break;
    await new Promise((res) => setTimeout(res, 300));
  }
  const text = r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  const lines = text.split("\n").filter((l) => l.trim() && !/^[\s·]+$/.test(l));
  console.log(`▶ ${tool} ${JSON.stringify(args)}${r.isError ? " [ERROR]" : ""}`);
  console.log(lines.slice(0, maxLines).map((l) => "  " + l).join("\n"));
  if (r.isError) break;
}
await client.close();
