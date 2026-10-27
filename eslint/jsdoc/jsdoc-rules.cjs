/**
 * JSDoc Rules Collection
 * Replaces regex/invalid-jsdoc functionality with separate rules
 */

const jsdocMultiline = require("./jsdoc-rules/jsdoc-multiline.cjs");
const jsdocEmptyLineBefore = require("./jsdoc-rules/jsdoc-empty-line-before.cjs");
const jsdocNoEmptyStart = require("./jsdoc-rules/jsdoc-no-empty-start.cjs");
const jsdocSpaceAfterAsterisk = require("./jsdoc-rules/jsdoc-space-after-asterisk.cjs");
const jsdocMultipleEmptyLines = require("./jsdoc-rules/jsdoc-multiple-empty-lines.cjs");
const jsdocEmptyLineAfter = require("./jsdoc-rules/jsdoc-empty-line-after.cjs");
const jsdocNoEmptyEnd = require("./jsdoc-rules/jsdoc-no-empty-end.cjs");

/**
 * @type {import('eslint').Linter.FlatConfig}
 */
const jsdocRules = {
  files: ["**/*.{js,cjs,mjs,ts,tsx}"],
  plugins: {
    "custom-jsdoc": {
      rules: {
        // @ts-expect-error
        "jsdoc-multiline": jsdocMultiline,
        // @ts-expect-error
        "jsdoc-empty-line-before": jsdocEmptyLineBefore,
        // @ts-expect-error
        "jsdoc-no-empty-start": jsdocNoEmptyStart,
        // @ts-expect-error
        "jsdoc-space-after-asterisk": jsdocSpaceAfterAsterisk,
        // @ts-expect-error
        "jsdoc-multiple-empty-lines": jsdocMultipleEmptyLines,
        // @ts-expect-error
        "jsdoc-empty-line-after": jsdocEmptyLineAfter,
        // @ts-expect-error
        "jsdoc-no-empty-end": jsdocNoEmptyEnd,
      },
    },
  },
  rules: {
    "custom-jsdoc/jsdoc-multiline": "warn",
    "custom-jsdoc/jsdoc-empty-line-before": "warn",
    "custom-jsdoc/jsdoc-no-empty-start": "warn",
    "custom-jsdoc/jsdoc-space-after-asterisk": "warn",
    "custom-jsdoc/jsdoc-multiple-empty-lines": "warn",
    "custom-jsdoc/jsdoc-empty-line-after": "warn",
    "custom-jsdoc/jsdoc-no-empty-end": "warn",
  },
};

module.exports = jsdocRules;
