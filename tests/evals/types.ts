import { z } from "zod";
import {
  cartSchema,
  idSchema,
  publicErrorSchema,
  type Cart,
} from "@shop/shared/contracts";

export interface ShoppingScenario {
  id: string;
  message: string;
  cart?: Cart["items"];
  emptyCatalog?: boolean;
  identity?: string;
  injectDescription?: boolean;
  pending?: boolean;
  fault?:
    | "malformed-route"
    | "provider-failure"
    | "composer-failure"
    | "commit-rejection";
  expected: {
    outcome: "completed" | "clarification" | "failed" | "cancelled";
    items: Cart["items"] | null;
    productIds?: string[];
    missingInformation?: boolean;
    errorCode?: string;
  };
}

export const shoppingResultSchema = z.object({
  outcome: z.string(),
  cart: cartSchema,
  cartStatus: z.enum(["unchanged", "committed"]),
  productIds: z.array(idSchema),
  messages: z.array(z.string()),
  clarification: z
    .object({ question: z.string(), candidateIds: z.array(idSchema) })
    .nullable(),
  prematureClaim: z.boolean(),
  committed: z.boolean(),
  error: publicErrorSchema.nullable(),
  events: z.array(z.string()),
  tools: z.array(z.string()),
  durationMs: z.number().nonnegative(),
  usage: z
    .object({
      inputTokens: z.number().nonnegative(),
      outputTokens: z.number().nonnegative(),
      calls: z.number().nonnegative(),
    })
    .nullable(),
});

export type ShoppingResult = z.infer<typeof shoppingResultSchema>;
