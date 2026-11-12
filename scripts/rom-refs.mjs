// Shrinks saved runs: every ROM copy in their saves that matches a ROM file byte for byte becomes a
// reference (mcp-server/rom-refs.mjs), as new runs save it. Anything else is left as it is.
//   node scripts/rom-refs.mjs --roms <dir> [runs/<id> …]   what it would save (default: every run in runs/)
//   node scripts/rom-refs.mjs --roms <dir> --write [runs/<id> …]   do it
// A file is rewritten only when its references read back to exactly what was there.
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { knownRoms, restoreRoms, stripRoms } from "../mcp-server/rom-refs.mjs";

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i < 0 ? null : argv[i + 1];
};
const romsDir = flag("--roms");
if (!romsDir || !existsSync(romsDir)) {
  console.error("Give the folder with the ROM files: --roms <dir>");
  process.exit(1);
}
const write = argv.includes("--write");
const roms = knownRoms({ dirs: [resolve(romsDir)] });
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const given = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--roms");
const runs = (given.length ? given.map((r) => resolve(r)) : readdirSync(root).map((d) => join(root, d)))
  .filter((d) => existsSync(d) && statSync(d).isDirectory());

let before = 0, after = 0, files = 0;
for (const run of runs) {
  const saves = existsSync(join(run, "saves")) ? join(run, "saves") : run;
  if (!existsSync(saves)) continue;
  for (const f of readdirSync(saves).filter((n) => n.endsWith(".json"))) {
    const file = join(saves, f);
    const text = readFileSync(file, "utf8");
    if (!text.includes('"$ta"')) continue;
    const value = JSON.parse(text);
    const stripped = JSON.stringify(stripRoms(value, roms));
    if (stripped.length >= text.length) continue;
    // Only when the references read back to the same record.
    if (JSON.stringify(restoreRoms(JSON.parse(stripped), roms)) !== JSON.stringify(value)) {
      console.error(`skipped ${file}: it doesn't read back the same`);
      continue;
    }
    before += text.length;
    after += stripped.length;
    files++;
    if (write) {
      writeFileSync(`${file}.tmp`, stripped);
      renameSync(`${file}.tmp`, file);
    }
  }
}
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
console.log(`${write ? "rewrote" : "would rewrite"} ${files} file(s) in ${runs.length} run(s): ${mb(before)} → ${mb(after)}`);
