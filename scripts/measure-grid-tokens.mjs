// Measures narrow vs compact map grid token counts on the same saves and tool calls.
// Runs mcp-server/server.mjs headlessly against the built dist/ (run `npm run build` first) on a
// temporary copy of each --saves folder, once with NUZLOCKE_GRID=narrow and once with
// NUZLOCKE_GRID=compact, and counts tokens for map sections and whole tool results.
//
//   node scripts/measure-grid-tokens.mjs --rom path/to/game.gb --saves <saves folder> [--saves ...]
//        [--preset <id>] [--calls calls.json] [--counter auto|anthropic|o200k_base] [--model <id>]
//
// Counter:
//   - anthropic: Anthropic Messages count_tokens endpoint (needs ANTHROPIC_API_KEY).
//   - o200k_base: OpenAI o200k_base via Python tiktoken (proxy — not Claude tokens).
//   - auto (default): anthropic when ANTHROPIC_API_KEY is set, otherwise o200k_base proxy.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);

function usage(problem) {
  if (problem) console.error(problem);
  console.error("usage: node scripts/measure-grid-tokens.mjs --rom <game> --saves <saves folder> [--saves ...] [--preset <id>] [--calls calls.json] [--counter auto|anthropic|o200k_base] [--model <id>]");
  process.exit(2);
}

const many = (name) => argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]] : []));
const one = (name, fallback) => many(name).at(-1) ?? fallback;

const rom = one("--rom", process.env.NUZLOCKE_ROM);
const savesDirs = many("--saves").map((s) => resolve(s));
if (!rom || !existsSync(rom)) usage("Give the game with --rom (or NUZLOCKE_ROM).");
if (!savesDirs.length) usage("Give at least one --saves folder.");
for (const s of savesDirs) if (!existsSync(join(s, "run.json"))) usage(`${s} has no run.json: not a run's saves folder.`);
if (!existsSync(join(ROOT, "dist", "index.html"))) usage("dist/index.html is missing: run `npm run build` first.");

const preset = one("--preset", "hardcore-nuzlocke+firstrival+hardcap");
const model = one("--model", "claude-sonnet-4-6");
const requestedCounter = one("--counter", "auto");
if (!["auto", "anthropic", "o200k_base"].includes(requestedCounter)) usage(`Unknown --counter ${requestedCounter}.`);
const counter = requestedCounter === "auto" ? (process.env.ANTHROPIC_API_KEY ? "anthropic" : "o200k_base") : requestedCounter;
if (counter === "anthropic" && !process.env.ANTHROPIC_API_KEY) usage("--counter anthropic requires ANTHROPIC_API_KEY.");

// Same calls as scripts/model-view-diff.mjs (DEFAULT_CALLS): reads and short walks that fit any
// overworld save. Note: on a fresh session the bridge promotes the first get_map on a lit map to
// its full view (src/bridge/bridge-core.ts), while subsequent calls on that map return the screen.
const DEFAULT_CALLS = [
  ["get_rules", {}],
  ["get_state", {}],
  ["get_map", { legend: true }],
  ["read_screen_text", {}],
  ["notes", {}],
  ["routes", {}],
  ["policies", {}],
  ["walk", { direction: "up", tiles: 2 }],
  ["walk", { direction: "left", tiles: 2 }],
  ["walk", { direction: "down", tiles: 2, show_map: true }],
  ["walk", { direction: "right", tiles: 2 }],
  ["do", { steps: [{ tool: "walk", args: { direction: "down", tiles: 1 } }, { tool: "get_map" }] }],
  ["press", { buttons: "start" }],
  ["read_screen_text", {}],
  ["press", { buttons: "b" }],
  ["walk", { direction: "sideways" }],
  ["get_state", {}],
];

const callsFile = one("--calls", "");
if (callsFile && !existsSync(callsFile)) usage(`No file ${callsFile}.`);
const calls = callsFile ? JSON.parse(readFileSync(callsFile, "utf8")) : DEFAULT_CALLS;
const CONNECT_MS = 90_000;

/** Extracts the `Map:\n...` section (before `\nScreen:`) from a tool result, or null if absent. */
function mapSectionOf(text) {
  const start = text.indexOf("Map:\n");
  if (start < 0) return null;
  const end = text.indexOf("\nScreen:", start);
  const section = end < 0 ? text.slice(start) : text.slice(start, end);
  // Skip one-line notices like "Map: unchanged" or "(in battle — no map)".
  return /\n(?:y\s*-?\d+|It.s dark)/.test(section) ? section : null;
}

/** Plays `calls` from a copy of `saves` under `grid` (`narrow` or `compact`). */
async function play(saves, grid, port, workDir) {
  const savesCopy = join(workDir, `saves-${grid}-${port}`);
  rmSync(savesCopy, { recursive: true, force: true });
  cpSync(saves, savesCopy, { recursive: true });
  /** @type {Record<string, string>} */
  const env = {
    .../** @type {Record<string, string>} */ (process.env),
    NUZLOCKE_HEADLESS: "1",
    NUZLOCKE_BENCHMARK: preset,
    NUZLOCKE_ROM: resolve(rom),
    NUZLOCKE_BRIDGE_PORT: String(port),
    NUZLOCKE_SAVES_DIR: savesCopy,
    NUZLOCKE_RUN_LOG: "off",
    NUZLOCKE_GRID: grid,
  };
  delete env.NUZLOCKE_HEADED;
  const client = new Client({ name: "measure-grid-tokens", version: "1.0.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(ROOT, "mcp-server", "server.mjs")], cwd: ROOT, env, stderr: "pipe" });
  let log = "";
  transport.stderr?.on("data", (b) => (log += b.toString()));
  const failed = (why) => new Error(`${grid} on ${saves}: ${why}\nServer log (last lines):\n${log.split("\n").slice(-15).join("\n")}`);
  let closed = false;
  client.onclose = () => (closed = true);
  await client.connect(transport);
  const results = [];
  try {
    for (const until = Date.now() + CONNECT_MS; !log.includes("browser connected"); ) {
      if (Date.now() > until) throw failed(`the game didn't connect within ${CONNECT_MS / 1000} s`);
      if (closed || /EADDRINUSE|headless launch failed/.test(log)) throw failed("the server or its game failed to start");
      await new Promise((res) => setTimeout(res, 200));
    }
    for (const [tool, args = {}] of calls) {
      /** @type {any} */
      const r = await client.callTool({ name: tool, arguments: args });
      const text = (r.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
      if (r.isError && /No game connected|isn.t connected|No game is running/.test(text)) throw failed(`the game dropped out at ${tool}: ${text}`);
      results.push({ tool, args, text, map: mapSectionOf(text) });
    }
  } finally {
    await client.close();
  }
  return results;
}

/** Counts tokens for an array of strings using Anthropic's count_tokens API or tiktoken o200k_base. */
async function countAll(texts) {
  if (counter === "anthropic") {
    const ask = async (content) => {
      const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model, messages: [{ role: "user", content }] }),
      });
      if (!res.ok) throw new Error(`Anthropic count_tokens HTTP ${res.status}: ${await res.text()}`);
      /** @type {{ input_tokens: number }} */
      const data = await res.json();
      return data.input_tokens;
    };
    const base = await ask(".\n");
    const out = [];
    for (const t of texts) out.push((await ask(`.\n${t}`)) - base);
    return out;
  }
  const py = "import json, sys, tiktoken; enc = tiktoken.get_encoding('o200k_base'); print(json.dumps([len(enc.encode(t)) for t in json.load(sys.stdin)]))";
  const input = JSON.stringify(texts);
  let r = spawnSync("python3", ["-c", py], { input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) r = spawnSync("uv", ["run", "--with", "tiktoken", "python3", "-c", py], { input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`tiktoken failed (install tiktoken or uv, or set ANTHROPIC_API_KEY):\n${r.stderr}`);
  return JSON.parse(r.stdout);
}

const pct = (before, after) => (before ? `${(((after - before) / before) * 100).toFixed(1)}%` : "n/a");
const kindOf = (map) => (map.includes("It's dark") ? "dark" : map.includes("Map exits:") ? "full" : "screen");
const saveLabel = (dir) => (basename(dir) === "saves" ? basename(dirname(dir)) : basename(dir));

const workDir = mkdtempSync(join(tmpdir(), "measure-grid-"));
try {
  console.log(counter === "anthropic"
    ? `Counter: Anthropic /v1/messages/count_tokens (${model})`
    : "Counter: o200k_base via tiktoken (proxy — not Claude tokens; set ANTHROPIC_API_KEY for Claude token counts)");

  let port = 7950;
  const rows = [];
  for (const saves of savesDirs) {
    const narrow = await play(saves, "narrow", port++, workDir);
    const compact = await play(saves, "compact", port++, workDir);
    const label = saveLabel(saves);
    const infoFile = join(saves, "snapshot-info.txt");
    const info = existsSync(infoFile) ? JSON.parse(readFileSync(infoFile, "utf8")) : null;
    const mapCalls = narrow.flatMap((n, i) => (n.map && compact[i].map ? [{ index: i, tool: n.tool, kind: kindOf(n.map), nMap: n.map, cMap: compact[i].map, nAll: n.text, cAll: compact[i].text }] : []));
    const allTexts = [
      ...mapCalls.flatMap((m) => [m.nMap, m.cMap, m.nAll, m.cAll]),
      ...narrow.map((n) => n.text),
      ...compact.map((c) => c.text),
    ];
    const counts = await countAll(allTexts);
    let p = 0;
    const measured = mapCalls.map((m) => ({
      ...m,
      nMapTok: counts[p++],
      cMapTok: counts[p++],
      nAllTok: counts[p++],
      cAllTok: counts[p++],
    }));
    const nSession = counts.slice(p, p + narrow.length).reduce((a, b) => a + b, 0);
    const cSession = counts.slice(p + narrow.length).reduce((a, b) => a + b, 0);
    rows.push({ label, info, measured, nSession, cSession });
  }

  let totNMap = 0, totCMap = 0, totNFull = 0, totCFull = 0, totNAll = 0, totCAll = 0, totNSess = 0, totCSess = 0;
  for (const r of rows) {
    const src = r.info ? ` (run ${r.info.from}${r.info.milestone ? `, milestone ${r.info.milestone}` : r.info.call ? `, call ${r.info.call}` : ""})` : "";
    console.log(`\n=== ${r.label}${src} ===`);
    for (const m of r.measured) {
      console.log(`  call #${m.index + 1} ${m.tool} [${m.kind}]: map ${m.nMapTok} -> ${m.cMapTok} (${pct(m.nMapTok, m.cMapTok)}), result ${m.nAllTok} -> ${m.cAllTok} (${pct(m.nAllTok, m.cAllTok)})`);
      totNMap += m.nMapTok; totCMap += m.cMapTok;
      if (m.kind === "full") { totNFull += m.nMapTok; totCFull += m.cMapTok; }
      totNAll += m.nAllTok; totCAll += m.cAllTok;
    }
    totNSess += r.nSession; totCSess += r.cSession;
    const sN = r.measured.reduce((a, m) => a + m.nMapTok, 0);
    const sC = r.measured.reduce((a, m) => a + m.cMapTok, 0);
    console.log(`  maps subtotal: ${sN} -> ${sC} (${pct(sN, sC)}) | all ${calls.length} results: ${r.nSession} -> ${r.cSession} (${pct(r.nSession, r.cSession)})`);
  }
  console.log("\n=== Totals across saves ===");
  console.log(`  map sections (all):  ${totNMap} -> ${totCMap} (${pct(totNMap, totCMap)})`);
  if (totNFull) console.log(`  map sections (full): ${totNFull} -> ${totCFull} (${pct(totNFull, totCFull)})`);
  console.log(`  map-bearing results: ${totNAll} -> ${totCAll} (${pct(totNAll, totCAll)})`);
  console.log(`  all call results:    ${totNSess} -> ${totCSess} (${pct(totNSess, totCSess)})`);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
