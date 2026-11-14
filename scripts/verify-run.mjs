#!/usr/bin/env node
// Checks a finished run's recording on its own: plays its button presses from power-on on your
// copy of the game, judges them with a fresh tracker under a benchmark preset's rules, and
// reports what really happened (src/verify/verify.ts).
//
//   npm run verify -- saves-headless/replay.attempt-3.json --rom red.gb --preset hardcore-nuzlocke-badge1
//
// --json prints the verdict as JSON. Exit code: 0 verified, 1 not verified, 2 usage/setup error.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { benchmarkPreset, presetHelp } from "../mcp-server/benchmark.mjs";
import { knownRoms, restoreRoms } from "../mcp-server/rom-refs.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** @returns {never} */
function usage(msg) {
  if (msg) console.error(msg);
  console.error("usage: npm run verify -- <recording.json> --rom <your Red/Blue/Yellow .gb> --preset <id> [--json]");
  console.error(`\n${presetHelp()}`);
  process.exit(2);
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Checks a run's recording on its own: plays its button presses from power-on on your copy of
the game, judges them with a fresh tracker under a preset's rules, and says what really happened.

Usage: npm run verify -- <recording.json> --rom <your Red/Blue/Yellow .gb> --preset <id> [--json]

  --json      the verdict as JSON
  -h, --help  this help
Exit code: 0 verified, 1 not verified, 2 usage or setup error.

${presetHelp()}`);
  process.exit(0);
}
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v ?? usage(`${name} needs a value`);
};
const asJson = args.includes("--json") && (args.splice(args.indexOf("--json"), 1), true);
const romPath = flag("--rom");
const presetId = flag("--preset");
const recordingPath = args[0];
if (!recordingPath || !romPath || !presetId) usage();
let preset;
try {
  preset = benchmarkPreset(presetId);
} catch (e) {
  usage(e.message);
}
if (preset.ruleset !== "nuzlocke") usage("Only Hardcore Nuzlocke presets can be verified.");

/** The app's save-file JSON: typed arrays stored as {"$ta", "b64"} (storage.ts). */
const TYPED = { Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array };
function readSaveFile(path) {
  // A ROM kept by reference (rom-refs.mjs) comes back from the --rom file and its folder.
  const restored = JSON.stringify(restoreRoms(JSON.parse(readFileSync(path, "utf8")), knownRoms({ rom: resolve(romPath) })));
  return JSON.parse(restored, (_k, v) => {
    if (v && typeof v === "object" && typeof v.$ta === "string" && typeof v.b64 === "string" && v.$ta in TYPED) {
      const bytes = Buffer.from(v.b64, "base64");
      return new TYPED[v.$ta](bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    }
    return v;
  });
}

/** Bundles src/verify/node-entry.ts the way the page's worker is built: the engine's Node built-ins go to the browser shims. */
async function loadVerifier() {
  let esbuild;
  try {
    esbuild = await import("esbuild");
  } catch {
    usage("esbuild isn't installed (it comes with the dev dependencies: npm install).");
  }
  const shim = (name) => join(ROOT, "src", "shims", `${name}.ts`);
  const alias = { "@randomizer": join(ROOT, "vendor", "randomizer", "ts-src") };
  for (const mod of ["fs", "path", "url", "os", "crypto"]) alias[mod] = alias[`node:${mod}`] = shim(mod);
  const dir = mkdtempSync(join(tmpdir(), "verify-run-"));
  const outfile = join(dir, "verifier.mjs");
  try {
    await esbuild.build({
      entryPoints: [join(ROOT, "src", "verify", "node-entry.ts")], bundle: true, platform: "neutral", format: "esm",
      mainFields: ["module", "main"], outfile, alias, logLevel: "error", target: "es2022",
    });
    return await import(pathToFileURL(outfile).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const { verifyRecording, NodeGameBoy, prepareNuzlocke } = await loadVerifier();
const replay = readSaveFile(resolve(recordingPath));
const baseRom = new Uint8Array(readFileSync(resolve(romPath)));
const loadFile = async (path) => new Uint8Array(readFileSync(join(ROOT, "public", path)));
const core = { js: readFileSync(join(ROOT, "public", "binjgb", "binjgb.js"), "utf8"), wasm: readFileSync(join(ROOT, "public", "binjgb", "binjgb.wasm")) };

let prepared;
try {
  prepared = await prepareNuzlocke(baseRom, loadFile);
} catch (e) {
  usage(`Couldn't read ${romPath}: ${e.message}`);
}
const { rom, data } = prepared;
const started = Date.now();
const verdict = await verifyRecording({
  replay, baseRom: rom, data,
  conditions: {
    preset: presetId,
    rareCandies: preset.rare_candies,
    options: {
      hardLevelCaps: preset.hard_level_caps, firstRivalFree: preset.first_rival_free, endOnViolation: preset.end_on_violation,
      lenientRules: preset.lenient_rules, goalBadges: preset.goal_badges ?? undefined,
    },
  },
  createGameBoy: (r) => NodeGameBoy.create(r, core),
  onProgress: asJson ? undefined : (f) => process.stderr.write(`\rplaying back… ${Math.round(f * 100)}%`),
});
if (!asJson) process.stderr.write("\r");

if (asJson) {
  console.log(JSON.stringify(verdict, null, 2));
} else {
  const r = verdict.result;
  console.log(verdict.ok ? `✅ VERIFIED under ${verdict.preset}` : `❌ NOT VERIFIED under ${verdict.preset}`);
  console.log(`   outcome:    ${r.outcome ? `${r.outcome.kind} — ${r.outcome.detail}` : "(unfinished)"}`);
  console.log(`   badges:     ${r.badges}   deaths: ${r.deaths}   violations: ${r.violations.length}`);
  console.log(`   in-game:    ${r.playTime}   emulated: ${(r.seconds / 3600).toFixed(2)} h   inputs: ${r.buttonChanges} button changes, ${r.interventions} harness interventions`);
  for (const v of r.violations) console.log(`   ⚠️  ${v}`);
  for (const p of verdict.problems) console.log(`   ✗ ${p}`);
  for (const n of verdict.notes) console.log(`   · ${n}`);
  console.log(`   checked in ${((Date.now() - started) / 1000).toFixed(0)} s. This proves what was played, not who played it.`);
}
process.exit(verdict.ok ? 0 : 1);
