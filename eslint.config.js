import {defineConfig, globalIgnores} from "eslint/config";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

/**
 * Flat config, following syncawesome's — the same three rules it cares about,
 * minus its React plugins, since nothing here is React.
 */
export default defineConfig([
  globalIgnores(["**/dist/**", "**/node_modules/**"]),
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      curly: ["error", "all"],
      "@typescript-eslint/array-type": ["error", {default: "generic"}],
      "@typescript-eslint/no-unused-vars": ["error", {argsIgnorePattern: "^_"}],
    },
  },
  {
    // The Node scripts in scripts/ are plain .mjs — same rules the TS files get
    // (bar the TypeScript-only array-type), with Node's globals in scope.
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
    rules: {
      curly: ["error", "all"],
      "no-unused-vars": ["error", {argsIgnorePattern: "^_"}],
    },
  },
]);
