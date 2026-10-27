import js from "@eslint/js";
import ts from "typescript-eslint";
import prettier from "eslint-config-prettier";
import hooks from "eslint-plugin-react-hooks";
import stylistic from "@stylistic/eslint-plugin";
import javascriptEmptyLines from "./eslint/empty-lines/javascript.cjs";
import typescriptEmptyLines from "./eslint/empty-lines/typescript.cjs";
import reactRules from "./eslint/react/rules.cjs";
import jsdocRules from "./eslint/jsdoc/jsdoc-rules.cjs";

export default ts.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.next/**",
      "eslint/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["**/*.{mjs,ts,tsx}"],
    plugins: { "@stylistic": stylistic },
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
  },
  {
    files: ["**/*.tsx"],
    plugins: { "react-hooks": hooks },
    rules: hooks.configs.recommended.rules,
  },
  prettier,
  // Keep local formatting rules after Prettier so they remain enabled.
  javascriptEmptyLines,
  typescriptEmptyLines,
  reactRules,
  jsdocRules,
);
