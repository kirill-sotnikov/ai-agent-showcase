import { z } from "zod";

export const LIMITS = {
  products: 200,
  quantity: 99,
  messages: 100,
  runs: 30,
  frameBytes: 1_048_576,
  stateBytes: 2_000_000,
} as const;
export const idSchema = z.uuid();
export const revisionSchema = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
export const moneySchema = z.number().int().min(0).max(1_000_000_000);
export const productSchema = z.strictObject({
  id: idSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000),
  priceMinor: moneySchema,
  currency: z.literal("USD"),
  category: z.string().max(80),
  attributes: z
    .record(z.string().min(1).max(40), z.string().max(200))
    .refine((value) => Object.keys(value).length <= 20),
});
export const cartSchema = z
  .strictObject({
    items: z
      .array(
        z.strictObject({
          productId: idSchema,
          quantity: z.number().int().min(1).max(LIMITS.quantity),
        }),
      )
      .max(LIMITS.products),
  })
  .refine(
    (cart) =>
      new Set(cart.items.map((item) => item.productId)).size ===
      cart.items.length,
    "Duplicate cart item",
  );
export const settingsSchema = z.strictObject({
  agentIdentity: z.string().max(2000),
  currency: z.literal("USD"),
});
export const messageSchema = z.strictObject({
  id: idSchema,
  requestId: idSchema,
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
  timestamp: z.iso.datetime(),
  incomplete: z.boolean(),
});
export const clarificationSchema = z.strictObject({
  requestId: idSchema,
  question: z.string().min(1).max(1000),
  originalMessage: z.string().min(1).max(4000),
  candidateIds: z.array(idSchema).max(10),
  baseRevision: revisionSchema,
  expiresAt: z.iso.datetime(),
});
export const runStageSchema = z.enum([
  "accepted",
  "checking",
  "routing",
  "executing",
  "validating",
  "awaiting_commit",
  "responding",
  "completed",
  "clarification",
  "failed",
  "cancelled",
  "interrupted",
]);
export const terminalStages = new Set([
  "completed",
  "clarification",
  "failed",
  "cancelled",
  "interrupted",
]);
export const activeRunSchema = z.strictObject({
  requestId: idSchema,
  baseRevision: revisionSchema,
  stage: runStageSchema,
  startedAt: z.iso.datetime(),
  cartStatus: z.enum(["unchanged", "committed"]),
});
export const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const receiptSchema = z
  .strictObject({
    requestId: idSchema,
    proposalId: idSchema,
    baseRevision: revisionSchema,
    committedRevision: revisionSchema,
    fingerprint: fingerprintSchema,
    summary: z.string().min(1).max(1000),
  })
  .refine((receipt) => receipt.committedRevision === receipt.baseRevision + 1);
export const snapshotSchema = z
  .strictObject({
    workspaceId: idSchema,
    settings: settingsSchema,
    products: z.array(productSchema).max(LIMITS.products),
    cart: cartSchema,
    messages: z.array(messageSchema).max(LIMITS.messages),
    pendingClarification: clarificationSchema.nullable(),
  })
  .superRefine((snapshot, context) => {
    const ids = new Set(snapshot.products.map((product) => product.id));

    if (
      ids.size !== snapshot.products.length ||
      snapshot.cart.items.some((item) => !ids.has(item.productId))
    )
      context.addIssue({
        code: "custom",
        message: "Invalid catalog/cart relationships",
      });
    if (snapshot.pendingClarification?.candidateIds.some((id) => !ids.has(id)))
      context.addIssue({
        code: "custom",
        message: "Unknown clarification candidate",
      });
  });
export const errorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "STATE_CONFLICT",
  "PRODUCT_NOT_FOUND",
  "CART_ITEM_NOT_FOUND",
  "INVALID_QUANTITY",
  "LIMIT_EXCEEDED",
  "TOOL_NOT_ALLOWED",
  "TOOL_LIMIT_EXCEEDED",
  "MODEL_INVALID_OUTPUT",
  "MODEL_UNAVAILABLE",
  "MODEL_TIMEOUT",
  "STORAGE_WRITE_FAILED",
  "COMMIT_TIMEOUT",
  "COMMIT_REJECTED",
  "CANCELLED",
  "RATE_LIMITED",
  "CONNECTION_LOST",
]);
export const publicErrorSchema = z.strictObject({
  code: errorCodeSchema,
  message: z.string().min(1).max(500),
  retryable: z.boolean(),
});
export const toolNameSchema = z.enum([
  "search_products",
  "get_product",
  "get_cart",
  "add_to_cart",
  "set_cart_quantity",
  "remove_from_cart",
]);
export const toolArguments = {
  search_products: z.strictObject({
    query: z.string().max(200),
    category: z.string().max(80).nullable(),
    maxPriceMinor: moneySchema.nullable(),
    limit: z.number().int().min(1).max(10),
  }),
  get_product: z.strictObject({ productId: idSchema }),
  get_cart: z.strictObject({}),
  add_to_cart: z.strictObject({
    productId: idSchema,
    quantity: z.number().int().min(1).max(99),
  }),
  set_cart_quantity: z.strictObject({
    productId: idSchema,
    quantity: z.number().int().min(0).max(99),
  }),
  remove_from_cart: z.strictObject({
    productId: idSchema,
    quantity: z.number().int().min(1).max(99).nullable(),
  }),
};
export const operationSchema = z.strictObject({
  operationId: idSchema,
  tool: z.enum(["add_to_cart", "set_cart_quantity", "remove_from_cart"]),
  productId: idSchema,
  previousQuantity: z.number().int().min(0).max(99),
  nextQuantity: z.number().int().min(0).max(99),
});
export const proposalSchema = z.strictObject({
  proposalId: idSchema,
  baseRevision: revisionSchema,
  nextCart: cartSchema,
  operations: z.array(operationSchema).min(1).max(12),
  totalMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  fingerprint: fingerprintSchema,
});

const command = <T extends string, S extends z.ZodType>(type: T, payload: S) =>
  z.strictObject({
    protocolVersion: z.literal(1),
    requestId: idSchema,
    type: z.literal(type),
    payload,
  });

export const startPayloadSchema = z.strictObject({
  message: z.string().trim().min(1).max(4000),
  baseRevision: revisionSchema,
  snapshot: snapshotSchema,
});
export const clientCommandSchema = z.discriminatedUnion("type", [
  command("request.start", startPayloadSchema),
  command("request.cancel", z.strictObject({})),
  command(
    "cart.commit_ack",
    z.strictObject({
      proposalId: idSchema,
      committedRevision: revisionSchema,
      fingerprint: fingerprintSchema,
    }),
  ),
  command(
    "cart.commit_rejected",
    z.strictObject({
      proposalId: idSchema,
      code: z.enum([
        "STATE_CONFLICT",
        "STORAGE_WRITE_FAILED",
        "CANCELLED",
        "INVALID_REQUEST",
      ]),
    }),
  ),
  command("heartbeat.pong", z.strictObject({})),
]);

const detailsSchema = z.strictObject({
  guardVerdict: z.enum(["VALID", "SPAM", "UNCERTAIN"]).optional(),
  tool: toolNameSchema.optional(),
  productIds: z.array(idSchema).max(200).optional(),
  query: z.string().max(200).optional(),
  productId: idSchema.optional(),
  quantity: z.number().int().min(0).max(99).nullable().optional(),
  resultCount: z.number().int().min(0).max(200).optional(),
  totalMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  route: z
    .enum(["QUESTION", "COMMAND", "MIXED", "CLARIFICATION", "OUT_OF_SCOPE"])
    .optional(),
});

export const workflowAgentSchema = z.enum([
  "orchestrator",
  "guard",
  "router",
  "knowledge",
  "action",
  "composer",
]);

const stepSchema = z.strictObject({
  stage: runStageSchema,
  agent: workflowAgentSchema.optional(),
  label: z.string().max(120),
  durationMs: z.number().min(0).optional(),
  details: detailsSchema.optional(),
});

const terminalSchema = z.strictObject({
  agent: workflowAgentSchema.optional(),
  outcome: z.enum(["completed", "clarification", "failed", "cancelled"]),
  cartStatus: z.enum(["unchanged", "committed"]),
  error: publicErrorSchema.optional(),
});

const event = <T extends string, S extends z.ZodType>(type: T, payload: S) =>
  z.strictObject({
    protocolVersion: z.literal(1),
    requestId: idSchema,
    eventId: idSchema,
    sequence: z.number().int().min(1),
    timestamp: z.iso.datetime(),
    type: z.literal(type),
    payload,
  });

export const eventPayloads = {
  "connection.ready": z.strictObject({
    provider: z.enum(["fake", "openai"]),
    ready: z.boolean(),
  }),
  "heartbeat.ping": z.strictObject({}),
  "request.accepted": z.strictObject({}),
  "step.started": stepSchema,
  "step.completed": stepSchema,
  "tool.started": stepSchema,
  "tool.completed": stepSchema,
  "cart.proposed": proposalSchema,
  "cart.committed": receiptSchema,
  "assistant.delta": z.strictObject({
    messageId: idSchema,
    chunk: z.number().int().min(0),
    content: z.string().max(4000),
  }),
  "assistant.message": z.strictObject({
    messageId: idSchema,
    content: z.string().min(1).max(4000),
  }),
  "clarification.required": clarificationSchema,
  "request.completed": terminalSchema,
  "request.failed": terminalSchema,
  "request.cancelled": terminalSchema,
};
export const serverEventSchema = z.discriminatedUnion("type", [
  event("connection.ready", eventPayloads["connection.ready"]),
  event("heartbeat.ping", eventPayloads["heartbeat.ping"]),
  event("request.accepted", eventPayloads["request.accepted"]),
  event("step.started", stepSchema),
  event("step.completed", stepSchema),
  event("tool.started", stepSchema),
  event("tool.completed", stepSchema),
  event("cart.proposed", proposalSchema),
  event("cart.committed", receiptSchema),
  event("assistant.delta", eventPayloads["assistant.delta"]),
  event("assistant.message", eventPayloads["assistant.message"]),
  event("clarification.required", clarificationSchema),
  event("request.completed", terminalSchema),
  event("request.failed", terminalSchema),
  event("request.cancelled", terminalSchema),
]);
export const persistedStateSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    workspaceId: idSchema,
    stateRevision: revisionSchema,
    settings: settingsSchema,
    products: z.array(productSchema).max(LIMITS.products),
    cart: cartSchema,
    messages: z.array(messageSchema).max(100),
    executionHistory: z.array(serverEventSchema).max(1200),
    pendingClarification: clarificationSchema.nullable(),
    activeRun: activeRunSchema.nullable(),
    commitReceipts: z.array(receiptSchema).max(100),
  })
  .superRefine((state, context) => {
    const result = snapshotSchema.safeParse({
      workspaceId: state.workspaceId,
      settings: state.settings,
      products: state.products,
      cart: state.cart,
      messages: state.messages,
      pendingClarification: state.pendingClarification,
    });

    if (!result.success)
      context.addIssue({
        code: "custom",
        message: "Invalid persisted relationships",
      });
    if (
      new Set(state.commitReceipts.map((receipt) => receipt.requestId)).size !==
        state.commitReceipts.length ||
      state.commitReceipts.some(
        (receipt) => receipt.committedRevision > state.stateRevision,
      )
    )
      context.addIssue({ code: "custom", message: "Invalid receipts" });
  });
export type Product = z.infer<typeof productSchema>;
export type Cart = z.infer<typeof cartSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Message = z.infer<typeof messageSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type StartPayload = z.infer<typeof startPayloadSchema>;
export type ActiveRun = z.infer<typeof activeRunSchema>;
export type RunStage = z.infer<typeof runStageSchema>;
export type WorkflowAgent = z.infer<typeof workflowAgentSchema>;
export type PendingClarification = z.infer<typeof clarificationSchema>;
export type CommitReceipt = z.infer<typeof receiptSchema>;
export type Proposal = z.infer<typeof proposalSchema>;
export type Operation = z.infer<typeof operationSchema>;
export type PersistedState = z.infer<typeof persistedStateSchema>;
export type ServerEvent = z.infer<typeof serverEventSchema>;
export type ClientCommand = z.infer<typeof clientCommandSchema>;
export type EventType = keyof typeof eventPayloads;
export type EventPayload<T extends EventType> = z.infer<
  (typeof eventPayloads)[T]
>;
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type PublicError = z.infer<typeof publicErrorSchema>;
export type ToolName = z.infer<typeof toolNameSchema>;
export type SafeDetails = z.infer<typeof detailsSchema>;
