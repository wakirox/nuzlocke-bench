import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@randomizer": path.resolve(root, "vendor/randomizer/ts-src") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
