#!/usr/bin/env node
// Makes a resumable saves folder from a run's recording, at a chosen moment.
//
//   node scripts/snapshot-run.mjs runs/<id> --at-call 912 --rom game.gb --out /tmp/saves-912
//   node scripts/snapshot-run.mjs runs/<id> --at-time 2:19:02 --rom game.gb --out /tmp/saves-t
//   node scripts/snapshot-run.mjs runs/<id> --milestone badge3 --rom game.gb --out /tmp/saves-b3
//
// --milestone takes the save the run kept when it first reached that milestone (report.mjs's
// objectives: badge3, rival2, lastCave…; saves/run.milestone.<id>.json, runs since 2026-11-08) and
// only cuts the recording there: no replay, so it takes a second.
//
// A run folder keeps only its latest save, but its recording (saves/run.replay.json) replays the
// whole run: the emulator is deterministic, so playing the button presses from power-on, with a
// tracker polled every 6 frames like the app, reaches any earlier moment. At the chosen moment
// this writes the emulator state, the tracker snapshot and the recording cut there, so
// `bench-run.mjs --resume` (or the MCP server on that folder) carries on from exactly there.
//
// Finding the moment: the run log has no frame numbers, only each call's in-game clock (whole
// seconds) and `where` (map, x/y unless dark, battle). --at-call n is the first 6-frame poll of
// the replay that shows call n's second, map, x/y and battle with all buttons let go (see
// snapshot-lib.mjs). --at-time h:mm:ss is the first such poll in that game second. Within a second
// (60 frames) the replay may differ from the true end of the call by a few steps, never by a
// different map, position or counters: those are checked against the log line below.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { knownRoms, restoreRoms, stripRoms } from "../mcp-server/rom-refs.mjs";
import { locateRun } from "../mcp-server/run-folder.mjs";
import { battleName, callTarget, compareWithLog, fmtPlayTime, firstMatch, parsePlayTime } from "./snapshot-lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const usage = (msg) => {
  if (msg) console.error(msg);
  console.error("usage: node scripts/snapshot-run.mjs runs/<id> (--at-call <n> | --at-time <h:mm:ss> | --milestone <id>) --rom <ROM .gb> --out <saves dir>");
  process.exit(2);
};
if (args.includes("--help") || args.includes("-h")) usage();
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v ?? usage(`${name} needs a value`);
};
const atCall = flag("--at-call");
const atTime = flag("--at-time");
const milestone = flag("--milestone");
const romPath = flag("--rom");
const outDir = flag("--out");
const runArg = args[0];
if (!runArg || !romPath || !outDir || [atCall, atTime, milestone].filter((v) => v != null).length !== 1) usage();

const TYPED = { Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array };
const roms = knownRoms({ rom: resolve(romPath) });
function readSaveFile(path) {
  const restored = JSON.stringify(restoreRoms(JSON.parse(readFileSync(path, "utf8")), roms));
  return JSON.parse(restored, (_k, v) => {
    if (v && typeof v === "object" && typeof v.$ta === "string" && typeof v.b64 === "string" && v.$ta in TYPED) {
      const bytes = Buffer.from(v.b64, "base64");
      return new TYPED[v.$ta](bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    }
    return v;
  });
}
/** The app's save-file encoding (storage.ts encode), with known ROMs kept by reference. */
function writeSaveFile(path, value) {
  const text = JSON.stringify(value, (_k, v) => ArrayBuffer.isView(v) && v.constructor.name in TYPED
    ? { $ta: v.constructor.name, b64: Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64") } : v);
  writeFileSync(path, JSON.stringify(stripRoms(JSON.parse(text), roms)));
}

async function loadEngine() {
  const esbuild = await import("esbuild");
  const shim = (name) => join(ROOT, "src", "shims", `${name}.ts`);
  const alias = { "@randomizer": join(ROOT, "vendor", "randomizer", "ts-src") };
  for (const mod of ["fs", "path", "url", "os", "crypto"]) alias[mod] = alias[`node:${mod}`] = shim(mod);
  const dir = mkdtempSync(join(tmpdir(), "snapshot-run-"));
  const outfile = join(dir, "engine.mjs");
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

// ---- The run and the moment ----
const run = locateRun(runArg);
const saves = run.saves;
for (const f of ["run.json", "run.replay.json"]) if (!existsSync(join(saves, f))) usage(`${join(saves, f)} is missing.`);
const log = milestone ? [] : readFileSync(run.runLog, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
let entry = null;
let target;
if (atCall != null) {
  entry = log.find((e) => e.n === Number(atCall));
  if (!entry) usage(`No call ${atCall} in ${run.runLog}.`);
  target = callTarget(entry);
} else if (atTime != null) {
  target = { sec: parsePlayTime(atTime) };
}

const runSave = readSaveFile(join(saves, "run.json"));
const rep = readSaveFile(join(saves, "run.replay.json"));
const { NodeGameBoy, prepareNuzlocke, ReplayPlayer, Tracker, gameFor, FIELDS } = await loadEngine();
const baseRom = new Uint8Array(readFileSync(resolve(romPath)));
const { rom } = await prepareNuzlocke(baseRom, async (path) => new Uint8Array(readFileSync(join(ROOT, "public", path))));
const data = runSave.data;
if (runSave.rom.length !== rom.length || !runSave.rom.every((b, i) => b === rom[i])) usage("--rom isn't the game this run was played on.");

/** The files a snapshot keeps as the run left them (see below). */
const KEPT = ["run.json", "baseRom.json", "attempts.json", "policies.json", "aiControl.json"];

// ---- A milestone's save: the machine, tracker and battery as the run kept them; cut the recording there ----
if (milestone) {
  const file = join(saves, `run.milestone.${milestone}.json`);
  if (!existsSync(file)) {
    const have = readdirSync(saves).map((f) => /^run\.milestone\.(\w+)\.json$/.exec(f)?.[1]).filter(Boolean);
    usage(`No save for milestone ${milestone} in ${saves} (${have.length ? `it has: ${have.join(", ")}` : "it has none: runs keep them since 2026-11-08"}).`);
  }
  const m = readSaveFile(file);
  let n = 0;
  while (n * FIELDS < rep.events.length && rep.events[n * FIELDS] <= m.ticks) n++;
  const cut = { start: rep.start, events: rep.events.slice(0, n * FIELDS), states: rep.states.filter((st) => st.at < n), endTicks: m.ticks };
  mkdirSync(outDir, { recursive: true });
  for (const name of KEPT) if (existsSync(join(saves, name))) cpSync(join(saves, name), join(outDir, name));
  writeSaveFile(join(outDir, "run.autoState.json"), m.state);
  if (m.battery) writeSaveFile(join(outDir, "run.battery.json"), m.battery);
  writeSaveFile(join(outDir, "run.tracker.json"), m.tracker);
  writeSaveFile(join(outDir, "run.replay.json"), cut);
  writeFileSync(join(outDir, "snapshot-info.txt"), `${JSON.stringify({ from: run.name, milestone, events: n, endTicks: m.ticks }, null, 1)}\n`);
  console.log(`snapshot at milestone ${milestone} of ${run.name} -> ${outDir}: ${n} of ${rep.events.length / FIELDS} input events, ${m.tracker.maxBadges ?? "?"} badges`);
  process.exit(0);
}
const options = {
  hardLevelCaps: !!runSave.hardLevelCaps, firstRivalFree: !!runSave.firstRivalFree,
  endOnViolation: runSave.endOnViolation ?? true, lenientRules: runSave.lenientRules ?? [], goalBadges: runSave.goalBadges,
};
const core = { js: readFileSync(join(ROOT, "public", "binjgb", "binjgb.js"), "utf8"), wasm: readFileSync(join(ROOT, "public", "binjgb", "binjgb.wasm")) };

// ---- Play it, as the app does: polls every 6 frames ----
const POLL = 6 * 70224;
const game = gameFor(data.version);
const gb = await NodeGameBoy.create(rom, core);
const player = new ReplayPlayer(gb.asGameBoy(), rep, { version: data.version });
const tracker = new Tracker(data, runSave.mode ?? "nuzlocke", null, () => {}, options);
const held = new Set();
let seen = 0;
const ev = rep.events;
const target0 = Date.now();
let found = null;
while (!player.done) {
  player.step(POLL);
  const s = game.readGameState(gb);
  tracker.update(s);
  for (; seen < player.eventIndex; seen++) {
    if (ev[seen * FIELDS + 1] !== 0) continue;
    if (ev[seen * FIELDS + 3] === 1) held.add(ev[seen * FIELDS + 2]);
    else held.delete(ev[seen * FIELDS + 2]);
  }
  if (!s.started) continue;
  const sample = {
    sec: s.playTime.h * 3600 + s.playTime.m * 60 + s.playTime.s, mapConst: s.mapConst, x: s.x, y: s.y,
    battle: battleName(s.battle), released: held.size === 0,
  };
  if (firstMatch(target, [sample]) === 0) {
    found = { state: s, eventIndex: player.eventIndex, ticks: gb.ticks };
    break;
  }
  if (!process.stderr.isTTY) continue;
  if (player.eventIndex % 64 === 0) process.stderr.write(`\rplaying… ${fmtPlayTime(sample.sec)}`);
}
process.stderr.write("\r");
if (!found) {
  gb.destroy();
  console.error(`The recording never reaches ${atCall != null ? `call ${atCall} (${entry.playTime}, ${entry.where})` : atTime}.`);
  process.exit(1);
}

// ---- Write the saves folder ----
const s = found.state;
const snap = structuredClone(tracker.snap);
const machine = gb.saveState();
const battery = gb.getExtRam();
const cut = {
  start: rep.start, events: ev.slice(0, found.eventIndex * FIELDS),
  states: rep.states.filter((st) => st.at < found.eventIndex), endTicks: found.ticks,
};
gb.destroy();
mkdirSync(outDir, { recursive: true });
const out = (name) => join(outDir, name);
// Kept as the run left them: the run (its game and rules), base ROM, attempt history, harness
// tuning (policies) and AI control. Left out: the model's own notes (model-notes.txt), route
// book (run.routes), the call budget (tool-calls.txt) and the slot state, so a new model starts fresh.
for (const name of KEPT) {
  if (existsSync(join(saves, name))) cpSync(join(saves, name), out(name));
}
writeSaveFile(out("run.autoState.json"), machine);
writeSaveFile(out("run.battery.json"), battery);
writeSaveFile(out("run.tracker.json"), snap);
writeSaveFile(out("run.replay.json"), cut);
writeFileSync(out("snapshot-info.txt"), `${JSON.stringify({
  from: run.name, call: entry?.n ?? null, atTime: fmtPlayTime(found.state.playTime.h * 3600 + found.state.playTime.m * 60 + found.state.playTime.s),
  map: s.mapConst, x: s.x, y: s.y, events: found.eventIndex, endTicks: found.ticks,
}, null, 1)}\n`);

// ---- Check it against the run log ----
const popcount = (n) => n.toString(2).replaceAll("0", "").length;
const sum = {
  playTime: `${s.playTime.h}:${String(s.playTime.m).padStart(2, "0")}:${String(s.playTime.s).padStart(2, "0")}`,
  mapConst: s.mapConst, x: s.x, y: s.y, battle: battleName(s.battle), badges: popcount(s.badges),
  deaths: snap.dead.length, violations: snap.violations.length, candies: snap.candies,
  candiedToCap: snap.candiedToCap.length, overCap: snap.overCap.length, firstRival: snap.firstRival,
};
console.log(`snapshot at ${atCall != null ? `call ${atCall} of ${run.name}` : `game time ${atTime}`} -> ${outDir}`);
console.log(`  ${sum.mapConst} x${sum.x} y${sum.y}, ${sum.playTime}, ${found.eventIndex} of ${rep.events.length / FIELDS} input events, ${((Date.now() - target0) / 1000).toFixed(0)} s to replay`);
console.log(`  party: ${s.party.map((m) => `${data.species[m.species]?.name ?? m.species} L${m.level}${m.hp ? "" : " (fainted)"}`).join(", ")}`);
let bad = 0;
if (entry) {
  console.log(`  checked against run-log call ${entry.n} (${entry.tool}):`);
  for (const r of compareWithLog(entry, sum)) {
    console.log(`    ${r.ok ? "ok  " : "FAIL"} ${r.label}: log ${r.logged}, replay ${r.got}`);
    if (!r.ok) bad++;
  }
  if (snap.maxBadges !== sum.badges) { console.log(`    FAIL tracker badges ${snap.maxBadges} vs RAM ${sum.badges}`); bad++; }
}
process.exit(bad ? 1 : 0);
