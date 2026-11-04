import type { AIMessage } from "@langchain/core/messages";
import { agentResultSchema, type AgentResult } from "./types.js";

export function parseAgentResult(value: unknown): AgentResult {
  // Null-valued properties can be omitted by some function-call backends.
  const result =
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !Object.hasOwn(value, "clarification")
      ? { ...value, clarification: null }
      : value;

  return agentResultSchema.parse(result);
}

export function parseAgentMessage(message: AIMessage): AgentResult {
  if (message.tool_calls?.length)
    throw new Error("Expected a final response without tool calls.");

  const content =
    typeof message.content === "string"
      ? message.content
      : message.content
          .map((block) => {
            if (block.type !== "text" || typeof block.text !== "string")
              throw new Error("Expected text content.");

            return block.text;
          })
          .join("");

  const text = content.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);

  return parseAgentResult(JSON.parse(fence ? fence[1] : text));
}
