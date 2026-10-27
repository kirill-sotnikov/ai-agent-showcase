import "eslint-plugin-only-warn";
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import auto from "eslint-config-canonical/auto";
import { recommended as node } from "eslint-config-canonical/node";
import nextVitals from "eslint-config-next/core-web-vitals";
import prettier from "eslint-plugin-prettier/recommended";
import reactRefresh from "eslint-plugin-react-refresh";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";
import emptyLinesJs from "./eslint/empty-lines/javascript.cjs";
import emptyLinesTs from "./eslint/empty-lines/typescript.cjs";
import jsdocRules from "./eslint/jsdoc/jsdoc-rules.cjs";
import reactRules from "./eslint/react/rules.cjs";

const canonicalPlugins = Object.assign(
  {},
  ...auto.map((config) => config.plugins),
);

const codeFiles = ["**/*.{js,mjs,cjs,jsx,ts,tsx}"];

// Reuse Canonical's plugin instances when extending Next.js configurations.
const nextConfig = nextVitals.map((config) => ({
  ...config,
  ...(config.plugins && {
    plugins: Object.fromEntries(
      Object.entries(config.plugins).map(([name, plugin]) => [
        name,
        canonicalPlugins[name] ?? plugin,
      ]),
    ),
  }),
}));

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    ".yarn/**",
    ".pnp.*",
    "yarn.lock",
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/dist/**",
    "**/coverage/**",
    "**/next-env.d.ts",
    "**/*.tsbuildinfo",
    "playwright-report/**",
    "test-results/**",
  ]),
  {
    files: codeFiles,
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  auto,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        project: [
          "./packages/service/tsconfig.json",
          "./packages/app/tsconfig.json",
        ],
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["warn", "interface"],
    },
  },
  {
    files: [
      "packages/service/**/*.{js,mjs,cjs,ts}",
      "*.{js,mjs,cjs,ts}",
      "eslint/**/*.cjs",
    ],
    extends: [node],
    rules: { "import/no-default-export": "warn" },
  },
  {
    files: ["packages/app/**/*.{js,mjs,cjs,jsx,ts,tsx}"],
    extends: [nextConfig],
    settings: { next: { rootDir: "packages/app/" } },
  },
  {
    files: ["packages/app/**/*.{jsx,tsx}"],
    plugins: { "react-refresh": reactRefresh },
    rules: {
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
          allowExportNames: [
            "metadata",
            "generateMetadata",
            "viewport",
            "generateViewport",
          ],
        },
      ],
      "react/display-name": "warn",
      "react/jsx-sort-props": "off",
      "react/jsx-sort-default-props": "off",
      "react/sort-default-props": "off",
      "react/jsx-handler-names": "off",
      "react/forbid-component-props": "off",
    },
  },
  jsdocRules,
  reactRules,
  {
    files: codeFiles,
    plugins: {
      "simple-import-sort": simpleImportSort,
      "unused-imports": unusedImports,
    },
    rules: {
      "canonical/sort-keys": "off",
      "canonical/filename-match-exported": "off",
      "canonical/filename-match-regex": "off",
      "unicorn/filename-case": "warn",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "warn",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      // Canonical 47 adds a second sorting system; use the template's rules.
      ...Object.fromEntries(
        Object.keys(canonicalPlugins.perfectionist.rules).map((name) => [
          `perfectionist/${name}`,
          "off",
        ]),
      ),
      "simple-import-sort/exports": "warn",
      "simple-import-sort/imports": [
        "warn",
        { groups: [["^\\u0000", "^node:", "^@?\\w", "^", "^\\."]] },
      ],
      "no-irregular-whitespace": "off",
      "id-length": [
        "warn",
        {
          min: 2,
          properties: "never",
          exceptions: ["_", "$", "a", "b", "x", "y", "z"],
        },
      ],
    },
  },
  {
    files: ["eslint.config.mjs", "packages/app/next.config.ts"],
    rules: {
      "import/no-default-export": "off",
      "import/no-unassigned-import": "off",
    },
  },
  {
    files: ["packages/service/src/config.ts", "packages/app/next.config.ts"],
    rules: { "n/no-process-env": "off" },
  },
  {
    files: ["packages/service/src/**/*.ts"],
    rules: { "no-console": ["warn", { allow: ["info", "error"] }] },
  },
  {
    files: ["packages/app/src/app/layout.tsx"],
    rules: {
      "import/no-unassigned-import": [
        "warn",
        { allow: ["**/*.css", "**/*.css.ts"] },
      ],
    },
  },
  {
    files: ["eslint/empty-lines/utils.cjs"],
    rules: { "unicorn/prevent-abbreviations": "off" },
  },
  {
    files: ["**/*.json"],
    rules: {
      "jsonc/sort-keys": "off",
      "jsonc/object-curly-spacing": "off",
      "jsonc/array-element-newline": "off",
      "jsonc/array-bracket-newline": "off",
    },
  },
  {
    ...auto.find((config) => config.plugins?.yml),
    files: ["**/*.{yml,yaml}"],
    rules: {
      ...auto.find((config) => config.plugins?.yml).rules,
      "yml/sort-keys": "off",
      "yml/no-multiple-empty-lines": "off",
    },
  },
  { ...prettier, plugins: { prettier: canonicalPlugins.prettier } },
  {
    files: codeFiles,
    plugins: { "@stylistic": canonicalPlugins["@stylistic"] },
    extends: [
      { ...emptyLinesJs, plugins: { react: canonicalPlugins.react } },
      { ...emptyLinesTs, plugins: {} },
    ],
    rules: { "prettier/prettier": ["warn", {}, { usePrettierrc: true }] },
  },
]);
