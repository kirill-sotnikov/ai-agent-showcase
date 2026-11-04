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
import { modelContext } from "./context.js";
import { DecisionsClient } from "./decisions.js";
import { normalizeToolArguments } from "./tool-arguments.js";
import { parseAgentMessage, parseAgentResult } from "./agent-result.js";
import { assessmentPrompt } from "../prompts/v1/assessment.js";
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
  assessmentSchema,
  type Assessment,
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
  byModel: Record<
    string,
    { inputTokens: number; outputTokens: number; calls: number }
  >;
}

const ExecutionState = Annotation.Root({
  messages: Annotation<BaseMessage[]>,
  result: Annotation<AgentResult | null>,
  needsRepair: Annotation<boolean>,
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
    "Remove units from the draft cart. Send quantity as a positive integer for a partial removal, or explicitly null to remove the entire line. First retrieve the product with search_products or get_product.",
};

export class OpenRouterProvider implements Provider {
  private readonly model: ChatOpenRouter;

  private readonly simpleModel: ChatOpenRouter;

  readonly assess?: (
    context: AgentContext,
    signal: AbortSignal,
  ) => Promise<Assessment>;

  readonly usage: Usage = {
    inputTokens: 0,
    outputTokens: 0,
    calls: 0,
    byModel: {},
  };

  constructor(
    readonly config: Config,
    readonly onUsage: (usage: Usage, model: string) => void = () => {},
    baseURL?: string,
  ) {
    const createModel = (model: string | undefined) =>
      new ChatOpenRouter({
        baseURL,
        apiKey: config.OPENROUTER_API_KEY,
        model,
        maxRetries: 0,
        maxTokens: config.MAX_OUTPUT_TOKENS,
        provider: { require_parameters: true },
        siteName: "AI Agent Showcase",
      });

    this.model = createModel(config.MODEL);

    this.simpleModel =
      config.MODEL_SIMPLE && config.MODEL_SIMPLE !== config.MODEL
        ? createModel(config.MODEL_SIMPLE)
        : this.model;

    if (config.MODEL_FAST) {
      const decisions = new DecisionsClient(
        config,
        (model) => this.reserveCall(model),
        (model, input, output) => this.trackUsage(model, input, output),
        baseURL,
      );

      this.assess = async (context, signal) => {
        const decisionStarted = performance.now();
        const decision = await decisions.assess(context, signal);
        const decisionMs = Math.round(performance.now() - decisionStarted);
        const threshold = config.DECISION_CONFIDENCE_THRESHOLD;

        const verificationReasons: NonNullable<
          Assessment["decision"]
        >["verificationReasons"] = [];

        if (decision.guard.verdict === "UNCERTAIN")
          verificationReasons.push("guard_uncertain");
        if (decision.guardConfidence < threshold)
          verificationReasons.push("guard_confidence");
        if (decision.route.confidence < threshold)
          verificationReasons.push("route_confidence");

        const diagnostics = {
          guardConfidence: decision.guardConfidence,
          routeConfidence: decision.route.confidence,
          complexityConfidence: decision.complexityConfidence,
          decisionThreshold: threshold,
          decisionRoute: decision.route.intent,
          verificationReasons,
        };

        if (verificationReasons.length === 0)
          return {
            ...assessmentSchema.parse({
              guard: decision.guard,
              route: decision.route,
              // Complexity only chooses the execution model. If uncertain,
              // conservatively use MODEL without repeating Guard and Router.
              complexity:
                decision.complexityConfidence >= threshold
                  ? decision.complexity
                  : "COMPLEX",
            }),
            decision: diagnostics,
            timings: {
              decisionMs,
              verificationMs: 0,
              verificationUsed: false,
            },
          };

        const verificationStarted = performance.now();

        const verified = await this.structured(
          "assessment",
          assessmentPrompt,
          this.context(context),
          assessmentSchema,
          signal,
          this.model,
          context.message,
        );

        return {
          ...verified,
          decision: diagnostics,
          // Guard uncertainty does not change the independently chosen route.
          // Uncertain decisions use the main model for execution as well.
          complexity: "COMPLEX",
          timings: {
            decisionMs,
            verificationMs: Math.round(performance.now() - verificationStarted),
            verificationUsed: true,
          },
        };
      };
    }
  }

  private reserveCall(model: string) {
    if (this.usage.calls >= this.config.MAX_LLM_CALLS)
      throw new DomainError(
        "LIMIT_EXCEEDED",
        "The model call budget for this request was exceeded.",
      );
    this.usage.calls++;
    this.usage.byModel[model] ??= { inputTokens: 0, outputTokens: 0, calls: 0 };
    this.usage.byModel[model].calls++;
  }

  private trackUsage(model: string, input: number, output: number) {
    this.usage.inputTokens += input;
    this.usage.outputTokens += output;
    this.usage.byModel[model].inputTokens += input;
    this.usage.byModel[model].outputTokens += output;
    this.onUsage(this.usage, model);
  }

  private async invoke(
    messages: BaseMessage[],
    options: ChatOpenRouterCallOptions,
    signal: AbortSignal,
    model = this.model,
  ): Promise<AIMessage> {
    signal.throwIfAborted();
    this.reserveCall(model.model);

    const timeout = AbortSignal.any([
      signal,
      AbortSignal.timeout(this.config.LLM_TIMEOUT_MS),
    ]);

    try {
      const response = await model.invoke(messages, {
        ...options,
        signal: timeout,
      });

      this.trackUsage(
        model.model,
        response.usage_metadata?.input_tokens ?? 0,
        response.usage_metadata?.output_tokens ?? 0,
      );

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
    return JSON.stringify(modelContext(context));
  }

  private async structured<S extends z.ZodType>(
    name: string,
    prompt: string,
    input: string,
    schema: S,
    signal: AbortSignal,
    model = this.model,
    currentMessage?: string,
  ): Promise<z.infer<S>> {
    const response = await this.invoke(
      [
        new SystemMessage(`${sharedPolicy}\n${prompt}`),
        new HumanMessage(input),
        ...(currentMessage === undefined
          ? []
          : [new HumanMessage(currentMessage)]),
      ],
      { response_format: responseFormat(name, schema) },
      signal,
      model,
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
      this.model,
      context.message,
    );
  }

  route(context: AgentContext, signal: AbortSignal) {
    return this.structured(
      "route",
      routerPrompt,
      this.context(context),
      routeResultSchema,
      signal,
      this.model,
      context.message,
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
          "Return the final structured answer. Call this alone, including for greetings and capability questions that need no shopping tools. Include text, showCart, productIds, clarification, and missingInformation. Empty search results are a completed answer. Cart changes are still drafts awaiting application validation.",
        strict: true,
        parameters: z.toJSONSchema(agentResultSchema),
      },
    });

    const model =
      context.complexity === "SIMPLE" ? this.simpleModel : this.model;

    const graph = new StateGraph(ExecutionState)
      .addNode("agent", async (state) => {
        const response = await this.invoke(
          state.messages,
          {
            tools,
            strict: true,
          },
          signal,
          model,
        );

        const finalCall = response.tool_calls?.find(
          (call) => call.name === finishTool,
        );

        if (finalCall) {
          if (response.tool_calls?.length !== 1)
            throw new DomainError(
              "MODEL_INVALID_OUTPUT",
              "The model returned an invalid final result.",
            );

          try {
            return {
              messages: [...state.messages, response],
              result: parseAgentResult(finalCall.args),
              needsRepair: false,
            };
          } catch {
            return {
              messages: [...state.messages, response],
              result: null,
              needsRepair: true,
            };
          }
        }

        if (!response.tool_calls?.length) {
          try {
            return {
              messages: [...state.messages, response],
              result: parseAgentMessage(response),
              needsRepair: false,
            };
          } catch {
            return {
              messages: [...state.messages, response],
              result: null,
              needsRepair: true,
            };
          }
        }

        return {
          messages: [...state.messages, response],
          result: null,
          needsRepair: false,
        };
      })
      .addNode("repair", async (state) => {
        const last = state.messages.at(-1) as AIMessage;
        const messages = [...state.messages];

        messages[0] = new SystemMessage(
          `${(state.messages[0] as SystemMessage).content}\nFinal formatting correction: finish_response and shopping tools are unavailable in this phase. For this correction, return the required native JSON response instead of calling finish_response. Include text, showCart, productIds, clarification and missingInformation. Use only products already retrieved in this request. For a greeting or capability answer use productIds [], clarification null, missingInformation false and showCart false. Preserve any unresolved clarification. Do not perform or claim additional cart actions.`,
        );

        // Close an invalid finish_response call before asking for a correction.
        // This is a formatting retry only: no shopping tools are offered or run.
        for (const call of last.tool_calls ?? []) {
          if (!call.id)
            throw new DomainError(
              "MODEL_INVALID_OUTPUT",
              "The model returned an invalid final result.",
            );

          messages.push(
            new ToolMessage({
              tool_call_id: call.id,
              name: finishTool,
              content:
                "The final response did not match the required schema. No tool or cart action was performed by this call.",
            }),
          );
        }

        messages.push(
          new HumanMessage(
            "Correct the format of the preceding final response using the required schema.",
          ),
        );

        const response = await this.invoke(
          messages,
          {
            response_format: responseFormat("agent_result", agentResultSchema),
          },
          signal,
          model,
        );

        try {
          return {
            messages: [...messages, response],
            result: parseAgentMessage(response),
            needsRepair: false,
          };
        } catch {
          throw new DomainError(
            "MODEL_INVALID_OUTPUT",
            "The model returned an invalid result.",
          );
        }
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

          const result = await gateway.call(
            call.name,
            normalizeToolArguments(call.name, call.args),
          );

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
      .addConditionalEdges(
        "agent",
        (state) =>
          state.result ? END : state.needsRepair ? "repair" : "tools",
        [END, "repair", "tools"],
      )
      .addEdge("repair", END)
      .addEdge("tools", "agent")
      .compile();

    const state = await graph.invoke(
      {
        messages: [
          new SystemMessage(
            `${sharedPolicy}\n${role === "action" ? actionPrompt : knowledgePrompt}\nThe last user message is the current customer request. The preceding JSON envelope supplies background context only.${context.needsClarification ? "\nThe router requires clarification. Use read tools if needed to identify candidates, then finish with a focused, non-null clarification question. Do not make cart changes or present a completed answer." : ""}`,
          ),
          new HumanMessage(this.context(context)),
          new HumanMessage(context.message),
        ],
        result: null,
        needsRepair: false,
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
      this.simpleModel,
    );
  }
}
