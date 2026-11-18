// Does a change alter what the model sees? Plays the same tool calls from the same saves on two
// versions of the harness (each built in its own worktree) and compares every word the model would
// read: the tool list (in the order it's offered) and each call's result. Needs a ROM, so it runs
// on a machine that has one, not in CI.
//
//   node scripts/model-view-diff.mjs --rom path/to/red.gb --saves <saves folder> [--saves <another>…]
//        [--base origin/master] [--head HEAD] [--preset <id>] [--calls calls.json] [--out <dir>] [--keep]
//
// --saves: a run's saves folder, e.g. one written by scripts/snapshot-run.mjs (a milestone of a
//   real run). It's copied, never changed.
// --calls: a JSON list of [tool, args] pairs (default: DEFAULT_CALLS below, which only reads and
//   walks a few steps, so it fits any overworld save).
// Exit code 0 when both versions show the same, 1 when they differ (the differences are printed and
// kept in --out), 2 on a usage error.
//
// The game only advances on the model's inputs, so two runs of one version from one save give the
// same results: a difference is the harness's, not chance. Run it with --base and --head on the
// same commit once to see that on your machine.

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);

function usage(problem) {
  if (problem) console.error(problem);
  console.error("usage: node scripts/model-view-diff.mjs --rom <game> --saves <saves folder> [--saves …] [--base origin/master] [--head HEAD] [--preset <id>] [--calls calls.json] [--out <dir>] [--keep]");
  process.exit(2);
}
const many = (name) => argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]] : []));
const one = (name, fallback) => many(name).at(-1) ?? fallback;

const rom = one("--rom", process.env.NUZLOCKE_ROM);
const savesDirs = many("--saves").map((s) => resolve(s));
if (!rom || !existsSync(rom)) usage("Give the game with --rom (or NUZLOCKE_ROM).");
if (!savesDirs.length) usage("Give at least one --saves folder.");
for (const s of savesDirs) if (!existsSync(join(s, "run.json"))) usage(`${s} has no run.json: not a run's saves folder.`);
const base = one("--base", "origin/master");
const head = one("--head", "HEAD");
const preset = one("--preset", "hardcore-nuzlocke+firstrival+hardcap");
const out = resolve(one("--out", mkdtempSync(join(tmpdir(), "model-view-"))));
const keep = argv.includes("--keep");

/**
 * Reads and short walks only: every call is one the model could make on an overworld save, and none
 * of them spends much of the game (a battle or a door could follow a walk, which is fine: both
 * versions meet it alike).
 */
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

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

/** A worktree of `ref` with the page built (the server serves its own dist/). */
function checkout(ref) {
  const sha = git("rev-parse", "--verify", `${ref}^{commit}`);
  const dir = join(out, `tree-${sha.slice(0, 10)}`);
  if (!existsSync(dir)) {
    git("worktree", "add", "--detach", dir, sha);
    symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"));
  }
  if (!existsSync(join(dir, "dist", "index.html"))) {
    const b = spawnSync("npm", ["run", "build"], { cwd: dir, encoding: "utf8" });
    if (b.status !== 0) throw new Error(`Building ${ref} failed:\n${b.stdout}\n${b.stderr}`);
  }
  return { ref, sha, dir };
}

/** Wall-clock values differ between any two plays: they aren't the harness's doing. */
const steady = (text) =>
  text
    .replace(/"realMs":\s*\d+/g, '"realMs": 0')
    .replace(/\b\d+h \d+m real\b|\b\d+m \d+s real\b|\b\d+s real\b/g, "<real time>");

/** Plays `calls` from a copy of `saves` on the version in `tree`: the tool list and every result, as the model reads them. */
async function play(tree, saves, port) {
  const savesCopy = join(out, `saves-${tree.sha.slice(0, 10)}-${basename(dirname(saves))}-${basename(saves)}`);
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
  };
  delete env.NUZLOCKE_HEADED;
  const client = new Client({ name: "model-view-diff", version: "1.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(tree.dir, "mcp-server", "server.mjs")], cwd: tree.dir, env, stderr: "ignore" }));
  const lines = [];
  try {
    const { tools } = await client.listTools();
    lines.push("=== tools/list (in the order offered) ===", JSON.stringify(tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })), null, 1));
    for (const [tool, args = {}] of calls) {
      /** @type {any} */
      let r;
      // The headless game takes a few seconds to load: the first call waits for it.
      for (let i = 0; ; i++) {
        r = await client.callTool({ name: tool, arguments: args });
        const t = r.content?.[0]?.text ?? "";
        if (!(r.isError && /No game connected|isn.t connected|No game is running/.test(t)) || i > 200) break;
        await new Promise((res) => setTimeout(res, 300));
      }
      const text = (r.content ?? []).map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n");
      lines.push(`=== ${tool} ${JSON.stringify(args)}${r.isError ? " [error]" : ""} ===`, steady(text));
    }
  } finally {
    await client.close();
  }
  return lines.join("\n") + "\n";
}

mkdirSync(out, { recursive: true });
const trees = [checkout(base), checkout(head)];
console.log(`base ${base} = ${trees[0].sha.slice(0, 10)}, head ${head} = ${trees[1].sha.slice(0, 10)}; output in ${out}`);
let differ = 0;
let port = 7990;
for (const saves of savesDirs) {
  const files = [];
  for (const tree of trees) {
    const file = join(out, `${basename(dirname(saves))}-${basename(saves)}.${tree === trees[0] ? "base" : "head"}.txt`);
    writeFileSync(file, await play(tree, saves, port++));
    files.push(file);
  }
  const d = spawnSync("diff", ["-u", ...files], { encoding: "utf8" });
  if (d.status === 0) console.log(`same: ${saves}`);
  else {
    differ++;
    console.log(`DIFFERENT: ${saves}\n${d.stdout}`);
  }
}
if (!keep) for (const tree of trees) git("worktree", "remove", "--force", tree.dir);
console.log(differ ? `${differ} of ${savesDirs.length} saves show the model something different.` : "The model sees the same on both versions.");
process.exit(differ ? 1 : 0);
