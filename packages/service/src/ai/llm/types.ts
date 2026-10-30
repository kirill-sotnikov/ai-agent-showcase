import { z } from "zod";
import {
  idSchema,
  type Cart,
  type CommitReceipt,
  type Product,
  type Snapshot,
} from "@shop/shared/contracts";
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
export const responseSchema = z.strictObject({
  text: z.string().trim().min(1).max(4000),
  showCart: z.boolean(),
});
export const agentResultSchema = responseSchema.extend({
  productIds: z.array(idSchema).max(10),
  clarification: z.string().min(1).max(1000).nullable(),
  missingInformation: z.boolean(),
});
export type ComposerInput = z.infer<typeof responseSchema>;
export interface ActionOutcome {
  receipt: CommitReceipt | null;
  cart: Cart;
  products: Product[];
  toolResults: ToolGateway["results"];
}
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
  completeAction(
    context: AgentContext,
    result: AgentResult,
    outcome: ActionOutcome,
    signal: AbortSignal,
  ): Promise<ComposerInput>;
}
