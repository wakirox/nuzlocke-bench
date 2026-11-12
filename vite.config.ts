import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error plain ESM module without type declarations
import { BUILD_INFO, gitState } from "./mcp-server/provenance.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const shim = (name: string) => path.resolve(root, "src/shims", `${name}.ts`);

// The vendored UPR-ZX engine (vendor/randomizer/ts-src; the ROM reader uses its Gen 1 handler) was
// written for Node. Alias the Node built-ins it touches to small in-memory browser shims.
const nodeShims: Record<string, string> = {};
for (const mod of ["fs", "path", "url", "os", "crypto"]) {
  nodeShims[mod] = shim(mod);
  nodeShims[`node:${mod}`] = shim(mod);
}

export default defineConfig({
  base: "./",
  plugins: [
    {
      // dist/build-info.json: the commit the page was built from, for the run log (mcp-server/provenance.mjs).
      name: "build-info",
      apply: "build",
      generateBundle() {
        const { commit, dirty } = gitState(root);
        this.emitFile({ type: "asset", fileName: BUILD_INFO, source: JSON.stringify({ commit, dirty, builtAt: new Date().toISOString() }) });
      },
    },
  ],
  resolve: {
    alias: {
      ...nodeShims,
      "@randomizer": path.resolve(root, "vendor/randomizer/ts-src"),
    },
  },
  worker: {
    format: "es",
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 4000,
  },
});
