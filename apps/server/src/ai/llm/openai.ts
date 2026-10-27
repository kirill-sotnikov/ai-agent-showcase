import OpenAI from "openai";
import { zodResponsesFunction, zodTextFormat } from "openai/helpers/zod";
import type {
  ResponseInput,
  Response,
} from "openai/resources/responses/responses";
import { z } from "zod";
import { DomainError } from "@shop/domain";
import type { Config } from "../../config/index.js";
import { actionPrompt } from "../prompts/v1/action.js";
import { composerPrompt } from "../prompts/v1/composer.js";
import { guardPrompt } from "../prompts/v1/guard.js";
import { knowledgePrompt } from "../prompts/v1/knowledge.js";
import { routerPrompt } from "../prompts/v1/router.js";
import { sharedPolicy } from "../prompts/v1/shared.js";
import type { ToolGateway } from "../tools/gateway.js";
import {
  agentResultSchema,
  guardResultSchema,
  presentationSchema,
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
    // All customization and history are data within a user envelope, never trusted instructions.
    return JSON.stringify({
      currentMessage: context.message,
      baseRevision: context.baseRevision,
      customIdentity: context.snapshot.settings.agentIdentity,
      conversation: context.snapshot.messages.slice(-20),
      pendingClarification: context.snapshot.pendingClarification,
      productCount: context.snapshot.products.length,
    });
  }
  private async structured<S extends z.ZodType>(
    name: string,
    prompt: string,
    input: string,
    schema: S,
    signal: AbortSignal,
    stream = false,
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
      if (stream) {
        const events = await this.client.responses.create(
          { ...params, stream: true },
          { signal: timeout },
        );
        let text = "";
        let completed = false;
        for await (const event of events) {
          if (event.type === "response.output_text.delta") text += event.delta;
          if (event.type === "response.completed") {
            this.track(event.response);
            completed = true;
          }
          if (text.length > 20000)
            throw new DomainError(
              "MODEL_INVALID_OUTPUT",
              "The model response exceeded its limit.",
            );
        }
        if (!completed)
          throw new DomainError(
            "MODEL_INVALID_OUTPUT",
            "The model did not finish its response.",
          );
        return schema.parse(JSON.parse(text));
      }
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
        description:
          name === "choose_cheapest"
            ? "Select the cheapest retrieved product by price in application code."
            : name.replaceAll("_", " "),
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
  present(
    context: AgentContext,
    result: AgentResult,
    committed: boolean,
    signal: AbortSignal,
  ) {
    const facts = context.snapshot.products.filter((product) =>
      result.productIds.includes(product.id),
    );
    return this.structured(
      "presentation",
      composerPrompt,
      JSON.stringify({
        message: context.message,
        facts,
        missingInformation: result.missingInformation,
        persistence: committed ? "committed" : "unchanged",
      }),
      presentationSchema,
      signal,
      true,
    );
  }
}
