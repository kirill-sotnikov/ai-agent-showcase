import type { ApiProvider, EvaluateTestSuite } from "promptfoo";
import type { Config } from "../../packages/service/src/config/index.js";
import { PROMPT_VERSION } from "../../packages/service/src/ai/prompts/v1/shared.js";
import { scenarioAssertions } from "./assertions.js";
import { EvaluationBudget, type LiveLimits } from "./budget.js";
import { shoppingScenarios } from "./datasets/shopping-v1.js";
import { runShoppingScenario } from "./harness.js";
import type { ShoppingScenario } from "./types.js";

interface SuiteOptions {
  config: Config;
  live: boolean;
  limits?: LiveLimits;
  scenarios?: ShoppingScenario[];
  outputPath?: string;
  persist?: boolean;
  log?: (message: string) => void;
}

export function createShoppingSuite({
  config,
  live,
  limits,
  scenarios = shoppingScenarios,
  outputPath,
  persist = true,
  log = console.error,
}: SuiteOptions) {
  if (live && !limits)
    throw new Error("Live evaluations require explicit limits.");

  const cases = limits ? scenarios.slice(0, limits.maxCases) : scenarios;
  const budget = limits ? new EvaluationBudget(limits, config) : null;
  const providerId = `shopping:${live ? config.OPENAI_MODEL : "fake"}`;

  const provider: ApiProvider = {
    id: () => providerId,
    label: providerId,
    callApi: async (_prompt, context, options) => {
      const index = cases.findIndex(
        (scenario) => scenario.id === context?.vars.scenarioId,
      );

      const scenario = cases[index];

      if (!scenario) return { error: "Unknown shopping scenario." };

      const prefix = `[${index + 1}/${cases.length}] ${scenario.id}`;

      if (budget && !budget.canStart) {
        const reason =
          `Cost reservation exceeds EVAL_MAX_USD: reserve ` +
          `$${budget.reserveUSD.toFixed(6)}, remaining $${budget.remainingUSD.toFixed(6)}.`;

        log(`${prefix}: skipped — ${reason}`);

        // Promptfoo records this as an error, so budget skips cannot pass the run.
        return { error: reason, metadata: { skipped: true }, cost: 0 };
      }

      log(`${prefix}: running`);

      const result = await runShoppingScenario(scenario, {
        config,
        live,
        signal: options?.abortSignal,
        log: (message) => log(`${prefix}: ${message}`),
      });

      const cost = budget?.record(result.usage) ?? 0;

      log(
        `${prefix}: workflow finished (${(result.durationMs / 1000).toFixed(1)}s)` +
          (live ? `; estimated cost $${cost.toFixed(6)}` : ""),
      );

      return {
        output: JSON.stringify(result),
        cost,
        tokenUsage: {
          prompt: result.usage?.inputTokens ?? 0,
          completion: result.usage?.outputTokens ?? 0,
          total:
            (result.usage?.inputTokens ?? 0) +
            (result.usage?.outputTokens ?? 0),
          numRequests: result.usage?.calls ?? 0,
        },
        metadata: { scenarioId: scenario.id, promptVersion: PROMPT_VERSION },
      };
    },
  };

  const suite: EvaluateTestSuite = {
    description: `Shopping workflow (${live ? "live" : "fake"}; ${PROMPT_VERSION})`,
    prompts: ["{{message}}"],
    providers: [provider],
    tests: cases.map((scenario) => ({
      description: scenario.id,
      vars: { message: scenario.message, scenarioId: scenario.id },
      metadata: {
        group: scenario.fault ? "resilience" : "behavior",
        model: live ? config.OPENAI_MODEL : "deterministic-v1",
        promptVersion: PROMPT_VERSION,
      },
      assert: scenarioAssertions(scenario),
    })),
    writeLatestResults: persist,
    sharing: false,
    ...(outputPath ? { outputPath } : {}),
  };

  return { suite, budget, caseCount: cases.length };
}
