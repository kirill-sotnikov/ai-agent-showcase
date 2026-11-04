import { z } from "zod";
import { DomainError } from "@shop/shared/domain";
import type { Config } from "../../config/index.js";
import { decisionQuestions } from "../prompts/v1/decisions.js";
import { modelContext } from "./context.js";
import {
  complexitySchema,
  guardResultSchema,
  routeResultSchema,
  type AgentContext,
  type Assessment,
} from "./types.js";

const probability = z.number().finite().min(0).max(1);

const envelopeSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
    })
    .optional(),
});

function choiceSchema<T extends z.ZodEnum>(values: T) {
  return z.object({
    type: z.literal("choice"),
    choice: values,
    confidence: probability,
    probabilities: z.record(values, probability),
  });
}

export interface DecisionAssessment extends Assessment {
  guardConfidence: number;
  complexityConfidence: number;
}

export class DecisionsClient {
  private readonly endpoint: string;

  constructor(
    private readonly config: Config,
    private readonly onStart: (model: string) => void,
    private readonly onUsage: (
      model: string,
      input: number,
      output: number,
    ) => void,
    baseURL = "https://openrouter.ai/api/v1",
  ) {
    this.endpoint = new URL(
      "../alpha/decisions",
      `${baseURL.replace(/\/$/, "")}/`,
    ).href;
  }

  async assess(
    context: AgentContext,
    signal: AbortSignal,
  ): Promise<DecisionAssessment> {
    signal.throwIfAborted();
    this.onStart(this.config.MODEL_FAST!);

    const timeout = AbortSignal.any([
      signal,
      AbortSignal.timeout(this.config.LLM_TIMEOUT_MS),
    ]);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.MODEL_FAST,
          state: modelContext(context),
          questions: decisionQuestions,
        }),
        signal: timeout,
      });

      // Upstream errors can contain private request data. Never expose the body.
      if (!response.ok)
        throw new DomainError(
          "MODEL_UNAVAILABLE",
          "The decision model is unavailable. Check the server configuration and try again.",
        );

      const result = envelopeSchema.parse(await response.json());

      this.onUsage(
        this.config.MODEL_FAST!,
        result.usage?.input_tokens ?? 0,
        result.usage?.output_tokens ?? 0,
      );

      const guard = choiceSchema(guardResultSchema.shape.verdict).parse(
        result.answers.guard,
      );

      const guardConfidence = Math.min(
        guard.confidence,
        guard.probabilities[guard.choice],
      );

      // A trusted spam verdict takes precedence over unused routing answers.
      if (
        guard.choice === "SPAM" &&
        guardConfidence >= this.config.DECISION_CONFIDENCE_THRESHOLD
      )
        return {
          guard: { verdict: "SPAM" },
          route: { intent: "OUT_OF_SCOPE", confidence: 1, clarification: null },
          complexity: "SIMPLE",
          guardConfidence,
          complexityConfidence: 1,
        };

      const intent = choiceSchema(routeResultSchema.shape.intent).parse(
        result.answers.intent,
      );

      const complexity = choiceSchema(complexitySchema).parse(
        result.answers.complexity,
      );

      return {
        guard: { verdict: guard.choice },
        route: {
          intent: intent.choice,
          confidence: Math.min(
            intent.confidence,
            intent.probabilities[intent.choice],
          ),
          clarification: null,
        },
        complexity: complexity.choice,
        guardConfidence,
        complexityConfidence: Math.min(
          complexity.confidence,
          complexity.probabilities[complexity.choice],
        ),
      };
    } catch (error) {
      if (signal.aborted)
        throw new DomainError("CANCELLED", "Request cancelled.");
      if (timeout.aborted)
        throw new DomainError(
          "MODEL_TIMEOUT",
          "The decision model took too long to respond.",
        );
      if (error instanceof DomainError) throw error;
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        throw new DomainError(
          "MODEL_INVALID_OUTPUT",
          "The decision model returned an invalid result.",
        );

      throw new DomainError(
        "MODEL_UNAVAILABLE",
        "The decision model is unavailable. Check the server configuration and try again.",
      );
    }
  }
}
