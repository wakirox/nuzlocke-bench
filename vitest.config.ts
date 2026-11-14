import { defineConfig, type Plugin } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const vendor = path.resolve(root, "vendor/randomizer") + path.sep;
const SHIMMED = new Set(["fs", "path", "url", "os", "crypto"]);

/**
 * The vendored engine's Node built-ins go to the browser shims (src/shims), as in the page's
 * worker (vite.config.ts) and the run verifier, so tests run it on what it really runs on. Only
 * for the engine's own imports: the tests and the MCP server keep Node's.
 */
const engineShims: Plugin = {
  name: "engine-node-shims",
  enforce: "pre",
  // A transform, not resolveId: Vitest's module runner takes built-ins as external before resolving.
  transform(code, id) {
    if (!path.resolve(id.split("?")[0]).startsWith(vendor)) return null;
    const out = code.replace(/(from\s+|import\s*\(\s*|require\(\s*)(["'])(?:node:)?(\w+)\2/g,
      (all, lead: string, q: string, mod: string) => (SHIMMED.has(mod) ? `${lead}${q}${path.resolve(root, "src/shims", `${mod}.ts`)}${q}` : all));
    return out === code ? null : { code: out, map: null };
  },
};

export default defineConfig({
  plugins: [engineShims],
  resolve: {
    alias: { "@randomizer": path.resolve(root, "vendor/randomizer/ts-src") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
