import { z } from "zod";
import { idSchema, type Snapshot } from "@shop/contracts";
import type { ToolGateway } from "../tools/gateway.js";

export const guardResultSchema = z.strictObject({
  verdict: z.enum(["VALID", "SPAM", "UNCERTAIN"]),
});
export const routeResultSchema = z.strictObject({
  intent: z.enum([
    "QUESTION",
    "COMMAND",
    "MIXED",
    "CLARIFICATION",
    "OUT_OF_SCOPE",
  ]),
  confidence: z.number().min(0).max(1),
  clarification: z.string().max(1000).nullable(),
});
export const agentResultSchema = z.strictObject({
  productIds: z.array(idSchema).max(10),
  clarification: z.string().min(1).max(1000).nullable(),
  missingInformation: z.boolean(),
});
export const presentationSchema = z.strictObject({
  intro: z.enum([
    "Here are the matching products.",
    "Here is what the catalog says.",
    "Here is your saved cart.",
  ]),
  productIds: z.array(idSchema).max(10),
  missingInformation: z.boolean(),
});
export type Route = z.infer<typeof routeResultSchema>;
export type AgentResult = z.infer<typeof agentResultSchema>;
export interface AgentContext {
  message: string;
  snapshot: Snapshot;
  baseRevision: number;
}
export interface Provider {
  guard(
    context: AgentContext,
    signal: AbortSignal,
  ): Promise<z.infer<typeof guardResultSchema>>;
  route(context: AgentContext, signal: AbortSignal): Promise<Route>;
  execute(
    role: "knowledge" | "action",
    context: AgentContext,
    gateway: ToolGateway,
    signal: AbortSignal,
  ): Promise<AgentResult>;
  present(
    context: AgentContext,
    result: AgentResult,
    committed: boolean,
    signal: AbortSignal,
  ): Promise<z.infer<typeof presentationSchema>>;
}
