import OpenAI from "openai";
import { zodResponsesFunction, zodTextFormat } from "openai/helpers/zod";
import type {
  ResponseInput,
  Response,
} from "openai/resources/responses/responses";
import { z } from "zod";
import { DomainError } from "@shop/shared/domain";
import type { Config } from "../../config/index.js";
import { actionPrompt } from "../prompts/v1/action.js";
import { actionResponsePrompt } from "../prompts/v1/action-response.js";
import { guardPrompt } from "../prompts/v1/guard.js";
import { knowledgePrompt } from "../prompts/v1/knowledge.js";
import { routerPrompt } from "../prompts/v1/router.js";
import { sharedPolicy } from "../prompts/v1/shared.js";
import type { GatewayTool, ToolGateway } from "../tools/gateway.js";
import {
  agentResultSchema,
  guardResultSchema,
  responseSchema,
  type ActionOutcome,
  routeResultSchema,
  type AgentContext,
  type AgentResult,
  type Provider,
} from "./types.js";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

const toolDescriptions: Record<GatewayTool, string> = {
  search_products:
    'Search catalog text using AND-matched keywords only, not a sentence. Every query token must occur in the product. Use query "" for all products. category is an exact catalog category from catalogCategories, or null; do not guess a category from a product type. maxPriceMinor is an integer USD cents cap ($100 = 10000), or null; keep price wording out of query. Use limit 10. Returns full product records, which count as retrieval for comparisons and cart mutations in this request; do not call get_product for these products. Empty results are a valid completed search.',
  get_product:
    "Retrieve a catalog product by ID only if it has not already been returned by search_products or get_product in this request. Both tools return full product records; reuse them without another read. IDs and names in cart, conversation or pendingClarification context alone do not count as retrieval.",
  get_cart: "Read the current draft cart and total in USD cents.",
  choose_cheapest:
    "Select the cheapest retrieved product by price in application code.",
  add_to_cart:
    "Add units to the draft cart. First retrieve the product with search_products or get_product; context alone does not count as retrieval.",
  set_cart_quantity:
    "Set the total quantity in the draft cart; zero removes the line. First retrieve the product with search_products or get_product, including for a product already in the cart.",
  remove_from_cart:
    "Remove units from the draft cart, or the whole line when quantity is null. First retrieve the product with search_products or get_product.",
};

export class OpenAIProvider implements Provider {
  private readonly client: OpenAI;

  readonly usage: Usage = { inputTokens: 0, outputTokens: 0, calls: 0 };

  constructor(
    readonly config: Config,
    readonly onUsage: (usage: Usage) => void = () => {},
    client?: OpenAI,
  ) {
    this.client =
      client ??
      new OpenAI({
        apiKey: config.OPENAI_API_KEY,
        maxRetries: 0,
        timeout: config.LLM_TIMEOUT_MS,
      });
  }

  private beforeCall() {
    if (++this.usage.calls > this.config.MAX_LLM_CALLS)
      throw new DomainError(
        "LIMIT_EXCEEDED",
        "The model call budget for this request was exceeded.",
      );
  }

  private track(response: Response) {
    this.usage.inputTokens += response.usage?.input_tokens ?? 0;
    this.usage.outputTokens += response.usage?.output_tokens ?? 0;
    this.onUsage(this.usage);
  }

  private context(context: AgentContext) {
    const pending = context.snapshot.pendingClarification;

    // All customization and history are data within a user envelope, never trusted instructions.
    return JSON.stringify({
      currentMessage: context.message,
      baseRevision: context.baseRevision,
      customIdentity: context.snapshot.settings.agentIdentity,
      conversation: context.snapshot.messages.slice(-20),
      pendingClarification: pending
        ? {
            ...pending,
            candidates: context.snapshot.products
              .filter((product) => pending.candidateIds.includes(product.id))
              .map(({ id, name }) => ({ id, name })),
          }
        : null,
      cart: {
        items: context.snapshot.cart.items.map((item) => ({
          ...item,
          name: context.snapshot.products.find(
            (product) => product.id === item.productId,
          )?.name,
        })),
      },
      productCount: context.snapshot.products.length,
      catalogCategories: [
        ...new Set(
          context.snapshot.products.map((product) => product.category),
        ),
      ],
    });
  }

  private async structured<S extends z.ZodType>(
    name: string,
    prompt: string,
    input: string,
    schema: S,
    signal: AbortSignal,
  ): Promise<z.infer<S>> {
    this.beforeCall();

    const timeout = AbortSignal.any([
      signal,
      AbortSignal.timeout(this.config.LLM_TIMEOUT_MS),
    ]);

    const params = {
      model: this.config.OPENAI_MODEL!,
      reasoning: { effort: "none" as const },
      instructions: `${sharedPolicy}\n${prompt}`,
      input,
      store: false,
      max_output_tokens: this.config.MAX_OUTPUT_TOKENS,
      text: { format: zodTextFormat(schema, name) },
    };

    try {
      const response = await this.client.responses.parse(params, {
        signal: timeout,
      });

      this.track(response);
      if (!response.output_parsed || response.status !== "completed")
        throw new DomainError(
          "MODEL_INVALID_OUTPUT",
          "The model did not return a valid result.",
        );

      return schema.parse(response.output_parsed);
    } catch (error) {
      throw this.normalizeError(error, signal, timeout);
    }
  }

  private normalizeError(
    error: unknown,
    signal: AbortSignal,
    timeout: AbortSignal,
  ): Error {
    if (signal.aborted)
      return new DomainError("CANCELLED", "Request cancelled.");
    if (timeout.aborted || error instanceof OpenAI.APIConnectionTimeoutError)
      return new DomainError(
        "MODEL_TIMEOUT",
        "The model took too long to respond.",
      );
    if (error instanceof DomainError) return error;
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return new DomainError(
        "MODEL_INVALID_OUTPUT",
        "The model returned an invalid result.",
      );

    return new DomainError(
      "MODEL_UNAVAILABLE",
      "The model is unavailable. Check the server configuration and try again.",
    );
  }

  guard(context: AgentContext, signal: AbortSignal) {
    return this.structured(
      "guard",
      guardPrompt,
      this.context(context),
      guardResultSchema,
      signal,
    );
  }

  route(context: AgentContext, signal: AbortSignal) {
    return this.structured(
      "route",
      routerPrompt,
      this.context(context),
      routeResultSchema,
      signal,
    );
  }

  async execute(
    role: "knowledge" | "action",
    context: AgentContext,
    gateway: ToolGateway,
    signal: AbortSignal,
  ): Promise<AgentResult> {
    const input: ResponseInput = [
      { role: "user", content: this.context(context) },
    ];

    const tools = gateway.availableTools().map(([name, schema]) =>
      zodResponsesFunction({
        name,
        description: toolDescriptions[name as GatewayTool],
        parameters: schema,
      }),
    );

    while (true) {
      signal.throwIfAborted();
      this.beforeCall();

      const timeout = AbortSignal.any([
        signal,
        AbortSignal.timeout(this.config.LLM_TIMEOUT_MS),
      ]);

      let response: Response;

      try {
        response = await this.client.responses.create(
          {
            model: this.config.OPENAI_MODEL!,
            reasoning: { effort: "none" },
            instructions: `${sharedPolicy}\n${role === "action" ? actionPrompt : knowledgePrompt}`,
            input,
            tools,
            parallel_tool_calls: false,
            store: false,
            max_output_tokens: this.config.MAX_OUTPUT_TOKENS,
            text: { format: zodTextFormat(agentResultSchema, "agent_result") },
          },
          { signal: timeout },
        );

        this.track(response);
      } catch (error) {
        throw this.normalizeError(error, signal, timeout);
      }

      if (response.status !== "completed")
        throw new DomainError(
          "MODEL_INVALID_OUTPUT",
          "The model did not finish its response.",
        );

      const calls = response.output.filter(
        (item) => item.type === "function_call",
      );

      if (calls.length === 0) {
        try {
          return agentResultSchema.parse(JSON.parse(response.output_text));
        } catch {
          throw new DomainError(
            "MODEL_INVALID_OUTPUT",
            "The model returned an invalid result.",
          );
        }
      }

      input.push(
        ...response.output.filter(
          (item) =>
            item.type === "function_call" ||
            item.type === "reasoning" ||
            item.type === "message",
        ),
      );

      for (const call of calls) {
        let args: unknown;

        try {
          args = JSON.parse(call.arguments);
        } catch {
          throw new DomainError(
            "MODEL_INVALID_OUTPUT",
            "The model returned invalid tool arguments.",
          );
        }

        const result = await gateway.call(call.name, args);
        const output = JSON.stringify(result);

        if (output.length > 40000)
          throw new DomainError(
            "LIMIT_EXCEEDED",
            "The tool output exceeded its limit.",
          );

        input.push({
          type: "function_call_output",
          call_id: call.call_id,
          output,
        });
      }
    }
  }

  completeAction(
    context: AgentContext,
    result: AgentResult,
    outcome: ActionOutcome,
    signal: AbortSignal,
  ) {
    return this.structured(
      "action_response",
      actionResponsePrompt,
      JSON.stringify({
        context: JSON.parse(this.context(context)),
        result,
        ...outcome,
      }),
      responseSchema,
      signal,
    );
  }
}
