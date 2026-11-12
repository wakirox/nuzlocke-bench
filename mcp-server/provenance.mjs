// Which harness produced a run, for the run log: the package version, the git commit, tracked
// files changed since that commit, and the page actually served (dist/). The page is built
// separately and can be older than the code, so dist/ carries the commit it was built from
// (build-info.json, written by vite.config.ts) and the run log keeps a hash of it.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export const BUILD_INFO = "build-info.json";

/** HEAD and the tracked files that differ from it; nulls outside a git checkout. */
export function gitState(root) {
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    const commit = git("rev-parse", "HEAD");
    const dirty = git("diff", "--name-only", "HEAD").split("\n").filter(Boolean);
    return { commit, dirty };
  } catch {
    return { commit: null, dirty: null };
  }
}

/** A hash of every file under `dir` (paths and contents), the build info aside. */
export function hashDir(dir) {
  const hash = createHash("sha256");
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(d, e.name);
      const rel = relative(dir, p).split("\\").join("/");
      if (e.isDirectory()) walk(p);
      else if (rel !== BUILD_INFO) hash.update(`${rel}\0`).update(readFileSync(p)).update("\0");
    }
  };
  walk(dir);
  return hash.digest("hex");
}

/** The served page: what it was built from (null if built before build info existed) and its hash; null with no build. */
export function pageInfo(dist) {
  if (!dist || !existsSync(dist)) return null;
  let builtFrom = null;
  try {
    builtFrom = JSON.parse(readFileSync(join(dist, BUILD_INFO), "utf8"));
  } catch {
    /* an older build */
  }
  return { builtFrom, hash: hashDir(dist) };
}

/** The run log's harness record. */
export function harnessVersion(root, dist) {
  let pkg = {};
  try {
    pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  } catch {
    /* running outside the project */
  }
  const { commit, dirty } = gitState(root);
  return { name: pkg.name, version: pkg.version, commit, ...(dirty?.length ? { dirty } : {}), page: pageInfo(dist) };
}

/** Changed files that can change play (documentation can't). */
const playFiles = (files) => (files ?? []).filter((f) => !/\.md$/i.test(f));

/**
 * The harness as the report shows it: version@commit, then what makes it differ from that commit:
 * uncommitted changes, or a page built from another commit (or with changes, or of unknown origin).
 */
export function harnessLabel(h) {
  if (!h) return null;
  let s = `${h.version}${h.commit ? `@${h.commit.slice(0, 7)}` : ""}`;
  if (playFiles(h.dirty).length) s += " +uncommitted changes";
  if (h.page === undefined) return s; // logged before the page was recorded
  const b = h.page?.builtFrom;
  if (!b) s += " (page build unknown)";
  else if (b.commit !== h.commit || playFiles(b.dirty).length) s += ` (page built from ${b.commit?.slice(0, 7) ?? "?"}${playFiles(b.dirty).length ? " +changes" : ""})`;
  return s;
}
