import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EvaluateTestSuite } from "promptfoo";
import { readConfig } from "../packages/service/src/config/index.js";
import { scenarioAssertions } from "./evals/assertions.js";
import { EvaluationBudget, readLiveLimits } from "./evals/budget.js";
import { shoppingScenarios } from "./evals/datasets/shopping-v1.js";
import { runShoppingScenario } from "./evals/harness.js";
import { createShoppingSuite } from "./evals/suite.js";
import { readEvaluationOptions } from "./evals/options.js";
import type { ShoppingResult, ShoppingScenario } from "./evals/types.js";

const config = readConfig({});

const silent = () => {};

let evaluate: typeof import("promptfoo").evaluate;
let configDirectory: string;

describe("evaluation scenario selection", () => {
  it("selects only requested IDs and preserves the full-run report", () => {
    const options = readEvaluationOptions([
      "--live",
      "--cases",
      "pending-short-reply,price-filter,price-filter",
    ]);

    expect(options.live).toBe(true);

    expect(options.scenarios.map((entry) => entry.id)).toEqual([
      "price-filter",
      "pending-short-reply",
    ]);

    expect(options.outputPath).toBe("tests/evals/results/live-selected.json");

    const { caseCount } = createShoppingSuite({
      config,
      ...options,
      limits: { maxCases: 1, maxUSD: 2, inputPrice: 0.1, outputPrice: 0.5 },
      persist: false,
    });

    expect(caseCount).toBe(1);
  });

  it.each(["", "price-filter,", "unknown-case"])(
    "rejects invalid selection %j instead of running the full suite",
    (ids) => {
      expect(() => readEvaluationOptions(["--cases", ids])).toThrow();
    },
  );

  it("keeps the full suite as default and supports a separate report", () => {
    const defaults = readEvaluationOptions([]);

    expect(defaults.scenarios).toEqual(shoppingScenarios);
    expect(defaults.outputPath).toBe("tests/evals/results/fake-latest.json");

    expect(
      readEvaluationOptions(["--cases", "set-zero", "--output", "custom.json"])
        .outputPath,
    ).toBe("custom.json");
  });
});

beforeAll(async () => {
  configDirectory = await mkdtemp(join(tmpdir(), "shopping-promptfoo-"));
  process.env.PROMPTFOO_CONFIG_DIR = configDirectory;
  process.env.PROMPTFOO_DISABLE_TELEMETRY = "1";
  process.env.PROMPTFOO_DISABLE_UPDATE = "1";
  ({ evaluate } = await import("promptfoo"));
});

afterAll(async () => {
  await rm(configDirectory, { recursive: true, force: true });
});

function scenario(id: string) {
  const found = shoppingScenarios.find((entry) => entry.id === id);

  if (!found) throw new Error(`Missing scenario: ${id}`);

  return structuredClone(found);
}

async function gradeResult(test: ShoppingScenario, result: ShoppingResult) {
  const suite: EvaluateTestSuite = {
    prompts: ["{{message}}"],
    providers: [async () => ({ output: JSON.stringify(result) })],
    tests: [
      {
        vars: { message: test.message },
        assert: scenarioAssertions(test),
      },
    ],
    writeLatestResults: false,
    sharing: false,
  };

  const evaluation = await evaluate(suite, {
    cache: false,
    maxConcurrency: 1,
    showProgressBar: false,
    silent: true,
  });

  return evaluation.toEvaluateSummary();
}

describe("Promptfoo shopping evaluations", () => {
  it("rejects wrong products even when the request completed and the cart stayed unchanged", async () => {
    const test = scenario("search-lamp");
    const result = await runShoppingScenario(test, { config, live: false });

    result.productIds = [];

    const report = await gradeResult(test, result);

    expect(report.stats).toMatchObject({
      successes: 0,
      failures: 1,
      errors: 0,
    });

    expect(report.results[0].namedScores).toMatchObject({
      outcome: 1,
      cart: 1,
      products: 0,
    });

    expect(report.results[0].error).toContain("Expected products");
  });

  it("rejects a wrong cart quantity", async () => {
    const test = scenario("add-two-mugs");
    const result = await runShoppingScenario(test, { config, live: false });

    result.cart.items[0].quantity = 1;

    const report = await gradeResult(test, result);

    expect(report.stats.failures).toBe(1);
    expect(report.results[0].namedScores.cart).toBe(0);
  });

  it("rejects a success claim made before persistence", async () => {
    const test = scenario("add-two-mugs");
    const result = await runShoppingScenario(test, { config, live: false });

    result.prematureClaim = true;

    const report = await gradeResult(test, result);

    expect(report.stats.failures).toBe(1);
    expect(report.results[0].namedScores.persistence).toBe(0);
  });

  it("requires an actual clarification question", async () => {
    const test = scenario("ambiguous-headphones");
    const result = await runShoppingScenario(test, { config, live: false });

    result.clarification = null;

    const report = await gradeResult(test, result);

    expect(report.stats.failures).toBe(1);
    expect(report.results[0].namedScores.clarification).toBe(0);
  });

  it("does not mutate scenario fixtures or leak cart state between runs", async () => {
    const test = scenario("repeat-add");
    const before = structuredClone(test);
    const first = await runShoppingScenario(test, { config, live: false });
    const second = await runShoppingScenario(test, { config, live: false });

    expect(test).toEqual(before);
    expect(first.cart).toEqual({ items: test.expected.items });
    expect(second.cart).toEqual(first.cart);
  });

  it("records insufficient live budget as an error before any model request", async () => {
    const { suite } = createShoppingSuite({
      config,
      live: true,
      scenarios: [scenario("add-two-mugs")],
      limits: { maxCases: 1, maxUSD: 0.001, inputPrice: 1, outputPrice: 1 },
      persist: false,
      log: silent,
    });

    const evaluation = await evaluate(suite, {
      cache: false,
      maxConcurrency: 1,
      showProgressBar: false,
      silent: true,
    });

    const report = await evaluation.toEvaluateSummary();

    expect(report.stats).toMatchObject({
      successes: 0,
      failures: 0,
      errors: 1,
    });

    expect(report.results[0].error).toContain(
      "Cost reservation exceeds EVAL_MAX_USD",
    );

    expect(report.results[0].response?.metadata?.skipped).toBe(true);
    expect(report.stats.tokenUsage.total).toBe(0);
  });
});

describe("live evaluation budget", () => {
  it("accounts for reported tokens and blocks the next reservation", () => {
    const budget = new EvaluationBudget(
      { maxCases: 2, maxUSD: 1.1, inputPrice: 0.1, outputPrice: 0.5 },
      readConfig({ MAX_LLM_CALLS: "10", MAX_OUTPUT_TOKENS: "1500" }),
    );

    expect(budget.canStart).toBe(true);

    expect(
      budget.record({ inputTokens: 500000, outputTokens: 0, calls: 1 }),
    ).toBeCloseTo(0.05);

    expect(budget.canStart).toBe(false);
  });

  it("requires explicit prices and budget, and rejects invalid case counts", () => {
    expect(() => readLiveLimits({})).toThrow();

    expect(() =>
      readLiveLimits({
        EVAL_MAX_CASES: "0",
        EVAL_MAX_USD: "1",
        EVAL_INPUT_USD_PER_MILLION: "0.1",
        EVAL_OUTPUT_USD_PER_MILLION: "0.5",
      }),
    ).toThrow();
  });
});
