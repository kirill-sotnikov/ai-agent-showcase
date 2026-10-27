import {
  agentResultSchema,
  guardResultSchema,
  presentationSchema,
  routeResultSchema,
  type AgentContext,
  type Provider,
} from "../llm/types.js";
import {
  type CommitReceipt,
  type EventPayload,
  type EventType,
  type Proposal,
  type RunStage,
  type SafeDetails,
  type Snapshot,
  type StartPayload,
  type WorkflowAgent,
} from "@shop/shared/contracts";
import {
  canonicalCart,
  cartFingerprint,
  cartTotal,
  commitSummary,
  DomainError,
  verifyProposal,
} from "@shop/shared/domain";
import { formatMoney } from "@shop/shared/money";
import { ToolGateway } from "../tools/gateway.js";

export type Emit = <T extends EventType>(
  type: T,
  payload: EventPayload<T>,
) => void;
export interface WorkflowOptions {
  requestId: string;
  emit: Emit;
  signal: AbortSignal;
  maxToolCalls: number;
  commit: (proposal: Proposal) => Promise<CommitReceipt>;
}

const transitions: Partial<Record<RunStage, RunStage[]>> = {
  accepted: ["checking"],
  checking: ["routing", "responding"],
  routing: ["executing", "responding"],
  executing: ["validating"],
  validating: ["awaiting_commit", "responding"],
  awaiting_commit: ["responding"],
  responding: ["completed"],
};

export async function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();

  let abort: () => void = () => {};

  const interrupted = new Promise<never>((_resolve, reject) => {
    abort = () =>
      reject(
        signal.reason ?? new DomainError("CANCELLED", "Request cancelled."),
      );

    signal.addEventListener("abort", abort, { once: true });
  });

  try {
    return await Promise.race([promise, interrupted]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

export function validateClarification(
  snapshot: Snapshot,
  baseRevision: number,
): Snapshot {
  const pending = snapshot.pendingClarification;

  return {
    ...snapshot,
    pendingClarification:
      pending &&
      pending.baseRevision === baseRevision &&
      Date.parse(pending.expiresAt) > Date.now()
        ? pending
        : null,
  };
}

export async function runWorkflow(
  payload: StartPayload,
  provider: Provider,
  options: WorkflowOptions,
) {
  const { emit, signal, requestId } = options;

  const context: AgentContext = {
    message: payload.message,
    snapshot: validateClarification(payload.snapshot, payload.baseRevision),
    baseRevision: payload.baseRevision,
  };

  let stage: RunStage = "accepted";
  let agent: WorkflowAgent = "orchestrator";
  let receipt: CommitReceipt | null = null;
  let stepStarted = performance.now();
  let stepDetails: SafeDetails | undefined;

  const move = (
    next: RunStage,
    label: string,
    nextAgent: WorkflowAgent = "orchestrator",
  ) => {
    signal.throwIfAborted();
    if (!transitions[stage]?.includes(next))
      throw new DomainError("INVALID_REQUEST", "Invalid request transition.");

    emit("step.completed", {
      stage,
      agent,
      label: labels[stage] ?? "Request received",
      durationMs: performance.now() - stepStarted,
      ...(stepDetails ? { details: stepDetails } : {}),
    });

    stage = next;
    agent = nextAgent;
    stepStarted = performance.now();
    stepDetails = undefined;
    emit("step.started", { stage, agent, label });
  };

  const message = (content: string) =>
    emit("assistant.message", {
      messageId: crypto.randomUUID(),
      content: content.slice(0, 4000),
    });

  const clarify = (question: string, productIds: string[]) => {
    const originalMessage =
      context.snapshot.pendingClarification?.originalMessage ?? context.message;

    emit("clarification.required", {
      requestId,
      question,
      originalMessage,
      candidateIds: productIds,
      baseRevision: payload.baseRevision,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    message(question);

    emit("request.completed", {
      agent,
      outcome: "clarification",
      cartStatus: "unchanged",
    });
  };

  try {
    emit("request.accepted", {});
    move("checking", "Checking request", "guard");

    const guard = guardResultSchema.parse(
      await abortable(provider.guard(context, signal), signal),
    );

    stepDetails = { guardVerdict: guard.verdict };

    // Uncertainty about a short follow-up belongs to routing, where references
    // can be resolved and a focused clarification can be requested if needed.
    if (guard.verdict === "SPAM") {
      move("responding", "Preparing response", "guard");

      clarify(
        "What would you like to know about the products or change in your cart?",
        [],
      );

      return;
    }

    move("routing", "Understanding intent", "router");

    const route = routeResultSchema.parse(
      await abortable(provider.route(context, signal), signal),
    );

    emit("step.completed", {
      stage,
      agent,
      label: "Intent identified",
      details: { route: route.intent },
    });

    if (
      route.clarification ||
      route.intent === "CLARIFICATION" ||
      route.confidence < 0.6
    ) {
      clarify(
        route.clarification ?? "Which product or cart change do you mean?",
        [],
      );

      return;
    }

    if (route.intent === "OUT_OF_SCOPE") {
      move("responding", "Preparing response");

      message(
        "I can help you explore this catalog, compare products, and build your cart.",
      );

      emit("request.completed", {
        agent,
        outcome: "completed",
        cartStatus: "unchanged",
      });

      return;
    }

    const role = route.intent === "QUESTION" ? "knowledge" : "action";

    move("executing", "Running shopping tools", role);

    const gateway = new ToolGateway(
      role,
      context.snapshot,
      options.maxToolCalls,
      signal,
      (phase, details, durationMs) =>
        emit(phase === "started" ? "tool.started" : "tool.completed", {
          stage: "executing",
          agent: role,
          label: details.tool
            ? toolLabels[details.tool]
            : "Selecting the lowest price",
          details,
          ...(durationMs === undefined ? {} : { durationMs }),
        }),
    );

    const result = agentResultSchema.parse(
      await abortable(provider.execute(role, context, gateway, signal), signal),
    );

    move("validating", "Validating result");
    if (
      new Set(result.productIds).size !== result.productIds.length ||
      result.productIds.some((id) => !gateway.retrievedIds.has(id))
    )
      throw new DomainError(
        "MODEL_INVALID_OUTPUT",
        "The model referenced a product without retrieving it.",
      );

    if (result.clarification) {
      clarify(result.clarification, result.productIds);

      return;
    }

    const draft = gateway.draft;

    if (canonicalCart(draft.cart) !== canonicalCart(context.snapshot.cart)) {
      if (role !== "action" || !draft.operations.length)
        throw new DomainError(
          "TOOL_NOT_ALLOWED",
          "This request cannot change the cart.",
        );

      const proposal: Proposal = {
        proposalId: crypto.randomUUID(),
        baseRevision: payload.baseRevision,
        nextCart: draft.cart,
        operations: draft.operations,
        totalMinor: cartTotal(draft.cart, context.snapshot.products),
        fingerprint: await cartFingerprint(draft.cart),
      };

      verifyProposal(proposal, context.snapshot);
      move("awaiting_commit", "Saving cart");
      receipt = await abortable(options.commit(proposal), signal);
      emit("cart.committed", receipt);
    }

    move("responding", "Preparing verified response", "composer");

    let content: string;

    try {
      const presentation = presentationSchema.parse(
        await abortable(
          provider.present(context, result, !!receipt, signal),
          signal,
        ),
      );

      if (
        presentation.productIds.length !== result.productIds.length ||
        new Set(presentation.productIds).size !== result.productIds.length ||
        presentation.productIds.some((id) => !result.productIds.includes(id))
      )
        throw new DomainError(
          "MODEL_INVALID_OUTPUT",
          "The final response referenced an unverified product.",
        );

      const facts = presentation.productIds
        .map((id) => {
          const product = gateway.catalog.get(id);

          const attributes = Object.entries(product.attributes)
            .map(([key, value]) => `${key}: ${value}`)
            .join("; ");

          return `${product.name} — ${formatMoney(product.priceMinor)}. ${product.description}${attributes ? ` ${attributes}.` : ""}`;
        })
        .join("\n\n");

      // Product claims are rendered from retrieved fields. Free model prose cannot assert persistence or invent facts.
      content = receipt
        ? `${receipt.summary}\n\n${facts}`
        : facts
          ? `${presentation.intro === "Here is your saved cart." ? "Here is what the catalog says." : presentation.intro}\n\n${facts}`
          : "No matching products were found in your catalog.";

      // The execution agent checks the requested information against retrieved
      // catalog data. Composition must not introduce a new missing-data claim.
      if (result.missingInformation)
        content +=
          "\n\nThe catalog does not include further specifications for that question.";
    } catch (error) {
      if (!receipt || signal.aborted) throw error;
      content = `${receipt.summary} The final response could not be generated.`;
      message(content);

      emit("request.failed", {
        agent,
        outcome: "failed",
        cartStatus: "committed",
        error: {
          code: "MODEL_UNAVAILABLE",
          message: "Cart saved. The final response could not be generated.",
          retryable: false,
        },
      });

      return;
    }

    message(content);
    move("completed", "Request completed");

    emit("request.completed", {
      agent,
      outcome: "completed",
      cartStatus: receipt ? "committed" : "unchanged",
    });
  } catch (error) {
    const failure =
      signal.aborted && signal.reason instanceof DomainError
        ? signal.reason
        : error instanceof DomainError
          ? error
          : new DomainError(
              "MODEL_INVALID_OUTPUT",
              "The request could not be completed safely.",
            );

    if (receipt) message(`${receipt.summary} Response interrupted.`);

    const cancelled = failure.code === "CANCELLED";

    emit(cancelled ? "request.cancelled" : "request.failed", {
      agent,
      outcome: cancelled ? "cancelled" : "failed",
      cartStatus: receipt ? "committed" : "unchanged",
      error: {
        code: failure.code,
        message: failure.message,
        retryable:
          !receipt &&
          ["MODEL_UNAVAILABLE", "MODEL_TIMEOUT"].includes(failure.code),
      },
    });
  }
}

const labels: Partial<Record<RunStage, string>> = {
  accepted: "Request received",
  checking: "Checking request",
  routing: "Understanding intent",
  executing: "Running shopping tools",
  validating: "Validating result",
  awaiting_commit: "Saving cart",
  responding: "Preparing verified response",
};

const toolLabels = {
  search_products: "Searching products",
  get_product: "Reading product details",
  get_cart: "Reading cart",
  add_to_cart: "Staging an addition",
  set_cart_quantity: "Staging a quantity change",
  remove_from_cart: "Staging a removal",
};

export { commitSummary };
