// Lint for the whole repo (npm run lint; warnings fail it too). The clean state is the baseline:
// fix a finding rather than turning its rule off, and say why when a rule is changed here.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "vendor/", "public/", "runs/", "saves/", "saves-headless/", ".claude/", "coverage/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // The app runs in the browser; the server, scripts and tests in Node.
  { files: ["src/**/*.ts"], languageOptions: { globals: globals.browser } },
  { files: ["mcp-server/**/*.mjs", "scripts/**/*.mjs", "tests/**/*.ts", "*.mjs", "*.ts"], languageOptions: { globals: globals.node } },
  // A leading underscore marks a parameter or variable kept on purpose (a shim's signature, a skipped field).
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
);
