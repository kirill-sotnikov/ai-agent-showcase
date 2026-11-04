import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import {
  agentResultSchema,
  assessmentResultSchema,
  guardResultSchema,
  responseSchema,
  routeResultSchema,
  type AgentResult,
  type AgentContext,
  type Assessment,
  type Provider,
  type Route,
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
import { composeResponse } from "./composer.js";
import { ToolGateway } from "../tools/gateway.js";

// Request-local graph state. Cart persistence still goes through the browser ACK;
// the graph never checkpoints snapshots or retries a committed mutation.
const WorkflowState = Annotation.Root({
  result: Annotation<AgentResult | null>,
  gateway: Annotation<ToolGateway | null>,
  proposal: Annotation<Proposal | null>,
  stop: Annotation<boolean>,
});

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

  const outcome: {
    receipt: CommitReceipt | null;
    source: "knowledge" | "action";
  } = {
    receipt: null,
    source: "knowledge",
  };

  let savedCart = context.snapshot.cart;

  const checks = new AbortController();
  const checkSignal = AbortSignal.any([signal, checks.signal]);

  let routing: Promise<{ route: Route } | { error: unknown }> | undefined;

  const steps = new Map<
    RunStage,
    {
      agent: WorkflowAgent;
      label: string;
      startedAt: number;
      completed: boolean;
    }
  >([
    [
      "accepted",
      {
        agent,
        label: "Request received",
        startedAt: performance.now(),
        completed: false,
      },
    ],
  ]);

  const startStep = (
    next: RunStage,
    label: string,
    nextAgent: WorkflowAgent,
  ) => {
    if (steps.has(next)) return;

    steps.set(next, {
      agent: nextAgent,
      label,
      startedAt: performance.now(),
      completed: false,
    });

    emit("step.started", { stage: next, agent: nextAgent, label });
  };

  const finishStep = (
    current: RunStage,
    label?: string,
    details?: SafeDetails,
  ) => {
    const step = steps.get(current);

    if (!step || step.completed) return;
    step.completed = true;

    emit("step.completed", {
      stage: current,
      agent: step.agent,
      label: label ?? step.label,
      durationMs: performance.now() - step.startedAt,
      ...(details ? { details } : {}),
    });
  };

  const move = (
    next: RunStage,
    label: string,
    nextAgent: WorkflowAgent = "orchestrator",
  ) => {
    signal.throwIfAborted();
    if (!transitions[stage]?.includes(next))
      throw new DomainError("INVALID_REQUEST", "Invalid request transition.");

    finishStep(stage);

    stage = next;
    agent = nextAgent;
    startStep(stage, label, agent);
  };

  const message = (content: string, showCart = false) =>
    emit(
      "assistant.message",
      composeResponse(
        { text: content, showCart },
        outcome.source,
        savedCart,
        context.snapshot.products,
      ),
    );

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

  const execute = async (role: "knowledge" | "action") => {
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

    return { result, gateway };
  };

  const graph = new StateGraph(WorkflowState)
    .addNode("checks", async () => {
      emit("request.accepted", {});
      move("checking", "Checking request", "guard");
      startStep("routing", "Understanding intent", "router");

      let guard: { verdict: "VALID" | "SPAM" | "UNCERTAIN" };
      let assessmentTimings: Assessment["timings"];
      let decisionDetails: Assessment["decision"];

      if (provider.assess) {
        const assessment = assessmentResultSchema.parse(
          await abortable(provider.assess(context, checkSignal), checkSignal),
        );

        guard = assessment.guard;
        assessmentTimings = assessment.timings;
        decisionDetails = assessment.decision;
        context.complexity = assessment.complexity;
        routing = Promise.resolve({ route: assessment.route });

        finishStep("routing", "Intent identified", {
          route: assessment.route.intent,
          ...assessmentTimings,
          ...decisionDetails,
        });
      } else {
        // Routing is speculative and has no tools. Observe rejection immediately,
        // but use its result only after Guard has allowed the request to continue.
        routing = abortable(
          Promise.resolve()
            .then(() => {
              checkSignal.throwIfAborted();

              return provider.route(context, checkSignal);
            })
            .then((result) => routeResultSchema.parse(result)),
          checkSignal,
        ).then(
          (route) => {
            finishStep("routing", "Intent identified", { route: route.intent });

            return { route };
          },
          (error: unknown) => {
            finishStep("routing", "Intent check stopped");

            return { error };
          },
        );

        guard = guardResultSchema.parse(
          await abortable(provider.guard(context, checkSignal), checkSignal),
        );
      }

      finishStep("checking", undefined, {
        guardVerdict: guard.verdict,
        ...assessmentTimings,
        ...decisionDetails,
      });

      // Uncertainty about a short follow-up belongs to routing, where references
      // can be resolved and a focused clarification can be requested if needed.
      if (guard.verdict === "SPAM") {
        checks.abort();
        await routing;
        move("responding", "Preparing response", "guard");

        clarify(
          "What would you like to know about the products or change in your cart?",
          [],
        );

        return { stop: true };
      }

      return { stop: false };
    })
    .addNode("route", async () => {
      move("routing", "Understanding intent", "router");

      const routed = await routing!;

      if ("error" in routed) throw routed.error;

      const { route } = routed;

      outcome.source =
        route.intent === "COMMAND" || route.intent === "MIXED"
          ? "action"
          : "knowledge";

      if (route.clarification) {
        clarify(route.clarification, []);

        return { stop: true };
      }

      const uncertainMutation =
        route.confidence < 0.6 &&
        (route.intent === "COMMAND" || route.intent === "MIXED");

      if (route.intent === "CLARIFICATION" || uncertainMutation) {
        if (provider.assess) {
          // Decision models choose labels. Knowledge retrieves candidates and
          // writes the actual question without receiving cart mutation tools.
          context.needsClarification = true;
          context.complexity = "COMPLEX";
          outcome.source = "knowledge";
        } else {
          clarify("Which product or cart change do you mean?", []);

          return { stop: true };
        }
      }

      if (route.intent === "OUT_OF_SCOPE" && !context.needsClarification) {
        move("responding", "Preparing response");

        message(
          "I can help you explore this catalog, compare products, and build your cart.",
        );

        emit("request.completed", {
          agent,
          outcome: "completed",
          cartStatus: "unchanged",
        });

        return { stop: true };
      }

      return { stop: false };
    })
    .addNode("knowledge", () => execute("knowledge"))
    .addNode("action", () => execute("action"))
    .addNode("validate", async (state) => {
      const result = state.result!;
      const gateway = state.gateway!;
      const role = outcome.source;

      move("validating", "Validating result");
      if (
        new Set(result.productIds).size !== result.productIds.length ||
        result.productIds.some((id) => !gateway.retrievedIds.has(id))
      )
        throw new DomainError(
          "MODEL_INVALID_OUTPUT",
          "The model referenced a product without retrieving it.",
        );

      if (context.needsClarification && !result.clarification)
        throw new DomainError(
          "MODEL_INVALID_OUTPUT",
          "The model did not provide the required clarification.",
        );

      if (result.clarification) {
        clarify(result.clarification, result.productIds);

        return { stop: true };
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

        return { proposal };
      }

      return { proposal: null };
    })
    .addNode("commit", async (state) => {
      const proposal = state.proposal!;

      move("awaiting_commit", "Saving cart");
      outcome.receipt = await abortable(options.commit(proposal), signal);
      savedCart = proposal.nextCart;
      emit("cart.committed", outcome.receipt);

      return {};
    })
    .addNode("respond", async (state) => {
      const result = state.result!;
      const gateway = state.gateway!;
      const role = outcome.source;

      move(
        "responding",
        "Preparing response",
        role === "action" ? "action" : "composer",
      );

      try {
        const response =
          role === "action"
            ? responseSchema.parse(
                await abortable(
                  provider.completeAction(
                    context,
                    result,
                    {
                      receipt: outcome.receipt,
                      cart: savedCart,
                      products: [...gateway.retrievedIds].map((id) =>
                        gateway.catalog.get(id),
                      ),
                      toolResults: gateway.results,
                    },
                    signal,
                  ),
                  signal,
                ),
              )
            : result;

        message(response.text, response.showCart);
      } catch (error) {
        if (!outcome.receipt || signal.aborted) throw error;

        message(
          `${outcome.receipt.summary} The final response could not be generated.`,
        );

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

        return { stop: true };
      }

      return { stop: false };
    })
    .addNode("complete", () => {
      move("completed", "Request completed");

      emit("request.completed", {
        agent,
        outcome: "completed",
        cartStatus: outcome.receipt ? "committed" : "unchanged",
      });

      return {};
    })
    .addEdge(START, "checks")
    .addConditionalEdges("checks", (state) => (state.stop ? END : "route"), [
      END,
      "route",
    ])
    .addConditionalEdges(
      "route",
      (state) => (state.stop ? END : outcome.source),
      [END, "knowledge", "action"],
    )
    .addEdge("knowledge", "validate")
    .addEdge("action", "validate")
    .addConditionalEdges(
      "validate",
      (state) => (state.stop ? END : state.proposal ? "commit" : "respond"),
      [END, "commit", "respond"],
    )
    .addEdge("commit", "respond")
    .addConditionalEdges(
      "respond",
      (state) => (state.stop ? END : "complete"),
      [END, "complete"],
    )
    .addEdge("complete", END)
    .compile();

  try {
    await graph.invoke(
      { result: null, gateway: null, proposal: null, stop: false },
      { signal, recursionLimit: 16 },
    );
  } catch (error) {
    checks.abort();
    await routing;
    finishStep("checking", "Request check stopped");

    const failure =
      signal.aborted && signal.reason instanceof DomainError
        ? signal.reason
        : error instanceof DomainError
          ? error
          : new DomainError(
              "MODEL_INVALID_OUTPUT",
              "The request could not be completed safely.",
            );

    if (outcome.receipt)
      message(`${outcome.receipt.summary} Response interrupted.`);
    else if (outcome.source === "action")
      message(`I could not complete the request. ${failure.message}`);

    const cancelled = failure.code === "CANCELLED";

    emit(cancelled ? "request.cancelled" : "request.failed", {
      agent,
      outcome: cancelled ? "cancelled" : "failed",
      cartStatus: outcome.receipt ? "committed" : "unchanged",
      error: {
        code: failure.code,
        message: failure.message,
        retryable:
          !outcome.receipt &&
          ["MODEL_UNAVAILABLE", "MODEL_TIMEOUT"].includes(failure.code),
      },
    });
  } finally {
    checks.abort();
  }
}

const toolLabels = {
  search_products: "Searching products",
  get_product: "Reading product details",
  get_cart: "Reading cart",
  add_to_cart: "Staging an addition",
  set_cart_quantity: "Staging a quantity change",
  remove_from_cart: "Staging a removal",
};

export { commitSummary };
