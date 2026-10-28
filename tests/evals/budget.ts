import { z } from "zod";
import type { Config } from "../../packages/service/src/config/index.js";
import type { ShoppingResult } from "./types.js";

const liveLimitsSchema = z.object({
  maxCases: z.coerce.number().int().min(1).max(50).default(5),
  maxUSD: z.coerce.number().positive(),
  inputPrice: z.coerce.number().nonnegative(),
  outputPrice: z.coerce.number().nonnegative(),
});

export type LiveLimits = z.infer<typeof liveLimitsSchema>;

export function readLiveLimits(
  env: Record<string, string | undefined> = process.env,
): LiveLimits {
  return liveLimitsSchema.parse({
    maxCases: env.EVAL_MAX_CASES,
    maxUSD: env.EVAL_MAX_USD,
    inputPrice: env.EVAL_INPUT_USD_PER_MILLION,
    outputPrice: env.EVAL_OUTPUT_USD_PER_MILLION,
  });
}

export class EvaluationBudget {
  spentUSD = 0;

  readonly reserveUSD: number;

  constructor(
    readonly limits: LiveLimits,
    config: Config,
  ) {
    // Preserve the existing conservative reservation for a whole workflow.
    this.reserveUSD =
      (config.MAX_LLM_CALLS *
        (1_048_576 * limits.inputPrice +
          config.MAX_OUTPUT_TOKENS * limits.outputPrice)) /
      1_000_000;
  }

  get remainingUSD() {
    return this.limits.maxUSD - this.spentUSD;
  }

  get canStart() {
    return this.reserveUSD <= this.remainingUSD;
  }

  record(usage: ShoppingResult["usage"]) {
    const cost = usage
      ? (usage.inputTokens * this.limits.inputPrice +
          usage.outputTokens * this.limits.outputPrice) /
        1_000_000
      : 0;

    this.spentUSD += cost;

    return cost;
  }
}
