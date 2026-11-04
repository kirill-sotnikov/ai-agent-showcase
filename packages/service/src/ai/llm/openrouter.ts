import {
  ChatOpenRouter,
  type ChatOpenRouterCallOptions,
} from "@langchain/openrouter";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
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
  routeResultSchema,
  type ActionOutcome,
  type AgentContext,
  type AgentResult,
  type Provider,
} from "./types.js";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

const ExecutionState = Annotation.Root({
  messages: Annotation<BaseMessage[]>,
  result: Annotation<AgentResult | null>,
});

const finishTool = "finish_response";

function responseFormat(
  name: string,
  schema: z.ZodType,
): ChatOpenRouterCallOptions["response_format"] {
  return {
    type: "json_schema",
    json_schema: { name, strict: true, schema: z.toJSONSchema(schema) },
  };
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

export class OpenRouterProvider implements Provider {
  private readonly model: ChatOpenRouter;

  readonly usage: Usage = { inputTokens: 0, outputTokens: 0, calls: 0 };

  constructor(
    readonly config: Config,
    readonly onUsage: (usage: Usage) => void = () => {},
    baseURL?: string,
  ) {
    this.model = new ChatOpenRouter({
      baseURL,
      apiKey: config.OPENROUTER_API_KEY,
      model: config.MODEL,
      maxRetries: 0,
      maxTokens: config.MAX_OUTPUT_TOKENS,
      provider: { require_parameters: true },
      siteName: "AI Agent Showcase",
    });
  }

  private async invoke(
    messages: BaseMessage[],
    options: ChatOpenRouterCallOptions,
    signal: AbortSignal,
  ): Promise<AIMessage> {
    signal.throwIfAborted();
    if (this.usage.calls >= this.config.MAX_LLM_CALLS)
      throw new DomainError(
        "LIMIT_EXCEEDED",
        "The model call budget for this request was exceeded.",
      );
    this.usage.calls++;

    const timeout = AbortSignal.any([
      signal,
      AbortSignal.timeout(this.config.LLM_TIMEOUT_MS),
    ]);

    try {
      const response = await this.model.invoke(messages, {
        ...options,
        signal: timeout,
      });

      this.usage.inputTokens += response.usage_metadata?.input_tokens ?? 0;
      this.usage.outputTokens += response.usage_metadata?.output_tokens ?? 0;
      this.onUsage(this.usage);
      if (
        response.invalid_tool_calls?.length ||
        !["stop", "tool_calls"].includes(
          String(response.response_metadata.finish_reason),
        )
      )
        throw new DomainError(
          "MODEL_INVALID_OUTPUT",
          "The model did not return a complete, valid result.",
        );

      return response;
    } catch (error) {
      if (signal.aborted)
        throw new DomainError("CANCELLED", "Request cancelled.");
      if (timeout.aborted)
        throw new DomainError(
          "MODEL_TIMEOUT",
          "The model took too long to respond.",
        );
      if (error instanceof DomainError) throw error;
      if (error instanceof SyntaxError || error instanceof z.ZodError)
        throw new DomainError(
          "MODEL_INVALID_OUTPUT",
          "The model returned an invalid result.",
        );

      throw new DomainError(
        "MODEL_UNAVAILABLE",
        "The model is unavailable. Check the server configuration and try again.",
      );
    }
  }

  private parse<S extends z.ZodType>(
    response: AIMessage,
    schema: S,
  ): z.infer<S> {
    try {
      if (response.tool_calls?.length || typeof response.content !== "string")
        throw new Error("Expected JSON text");

      return schema.parse(JSON.parse(response.content));
    } catch {
      throw new DomainError(
        "MODEL_INVALID_OUTPUT",
        "The model returned an invalid result.",
      );
    }
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
    const response = await this.invoke(
      [
        new SystemMessage(`${sharedPolicy}\n${prompt}`),
        new HumanMessage(input),
      ],
      { response_format: responseFormat(name, schema) },
      signal,
    );

    return this.parse(response, schema);
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
    const tools = gateway.availableTools().map(([name, schema]) => ({
      type: "function" as const,
      function: {
        name,
        description: toolDescriptions[name as GatewayTool],
        strict: true,
        parameters: z.toJSONSchema(schema),
      },
    }));

    // Keep tool calling separate from native response_format: some OpenRouter
    // backends cannot reliably combine both. This tool supplies the final schema.
    tools.push({
      type: "function",
      function: {
        name: finishTool,
        description:
          "Finish this request with the answer and retrieved product IDs. Call this alone once all necessary shopping tools are complete. Empty search results are a completed answer. Cart changes are still drafts awaiting application validation.",
        strict: true,
        parameters: z.toJSONSchema(agentResultSchema),
      },
    });

    const graph = new StateGraph(ExecutionState)
      .addNode("agent", async (state) => {
        const response = await this.invoke(
          state.messages,
          {
            tools,
            strict: true,
          },
          signal,
        );

        const finalCall = response.tool_calls?.find(
          (call) => call.name === finishTool,
        );

        if (finalCall) {
          const result = agentResultSchema.safeParse(finalCall.args);

          if (response.tool_calls?.length !== 1 || !result.success)
            throw new DomainError(
              "MODEL_INVALID_OUTPUT",
              "The model returned an invalid final result.",
            );

          return {
            messages: [...state.messages, response],
            result: result.data,
          };
        }

        return {
          messages: [...state.messages, response],
          result: response.tool_calls?.length
            ? null
            : this.parse(response, agentResultSchema),
        };
      })
      .addNode("tools", async (state) => {
        const response = state.messages.at(-1) as AIMessage;
        const outputs: ToolMessage[] = [];

        // Tools run in order: retrieval must finish before any cart mutation.
        for (const call of response.tool_calls ?? []) {
          signal.throwIfAborted();
          if (!call.id)
            throw new DomainError(
              "MODEL_INVALID_OUTPUT",
              "The model returned an invalid tool call.",
            );

          const result = await gateway.call(call.name, call.args);
          const content = JSON.stringify(result);

          if (content.length > 40000)
            throw new DomainError(
              "LIMIT_EXCEEDED",
              "The tool output exceeded its limit.",
            );

          outputs.push(
            new ToolMessage({
              content,
              tool_call_id: call.id,
              name: call.name,
            }),
          );
        }

        return { messages: [...state.messages, ...outputs] };
      })
      .addEdge(START, "agent")
      .addConditionalEdges("agent", (state) => (state.result ? END : "tools"), [
        END,
        "tools",
      ])
      .addEdge("tools", "agent")
      .compile();

    const state = await graph.invoke(
      {
        messages: [
          new SystemMessage(
            `${sharedPolicy}\n${role === "action" ? actionPrompt : knowledgePrompt}`,
          ),
          new HumanMessage(this.context(context)),
        ],
        result: null,
      },
      { signal, recursionLimit: this.config.MAX_LLM_CALLS * 2 + 2 },
    );

    return agentResultSchema.parse(state.result);
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
