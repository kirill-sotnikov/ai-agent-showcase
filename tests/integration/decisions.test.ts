import { afterEach, expect, it } from "vitest";
import Fastify from "fastify";
import type { AddressInfo } from "node:net";
import { seedProducts } from "@shop/shared/defaults";
import { commitSummary } from "@shop/shared/domain";
import type { Cart, Proposal, ServerEvent } from "@shop/shared/contracts";
import { OpenRouterProvider } from "../../packages/service/src/ai/llm/openrouter.js";
import { runWorkflow } from "../../packages/service/src/ai/orchestrator/workflow.js";
import { readConfig } from "../../packages/service/src/config/index.js";
import {
  initialState,
  snapshotOf,
} from "../../packages/web/src/storage/store.js";

const servers: ReturnType<typeof Fastify>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

interface ChatRequest {
  model: string;
  messages: { role: string; content: string }[];
  response_format?: { json_schema: { name: string } };
  tools?: { function: { name: string } }[];
}

function choice(values: string[], value: string, confidence = 0.99) {
  return {
    type: "choice",
    choice: value,
    confidence,
    probabilities: Object.fromEntries(
      values.map((key) => [
        key,
        key === value ? confidence : (1 - confidence) / (values.length - 1),
      ]),
    ),
  };
}

function decision({
  guard = "VALID",
  intent = "QUESTION",
  complexity = "SIMPLE",
  confidence = 0.99,
  guardConfidence = confidence,
  intentConfidence = confidence,
  complexityConfidence = confidence,
}: {
  guard?: string;
  intent?: string;
  complexity?: string;
  confidence?: number;
  guardConfidence?: number;
  intentConfidence?: number;
  complexityConfidence?: number;
} = {}) {
  return {
    answers: {
      guard: choice(["VALID", "SPAM", "UNCERTAIN"], guard, guardConfidence),
      intent: choice(
        ["QUESTION", "COMMAND", "MIXED", "CLARIFICATION", "OUT_OF_SCOPE"],
        intent,
        intentConfidence,
      ),
      complexity: choice(
        ["SIMPLE", "COMPLEX"],
        complexity,
        complexityConfidence,
      ),
    },
    usage: { input_tokens: 100, output_tokens: 10 },
  };
}

function chatResponse(
  body: ChatRequest,
  data: unknown,
  tool?: { name: string; args: unknown },
) {
  return {
    id: crypto.randomUUID(),
    object: "chat.completion",
    created: 1,
    model: body.model,
    choices: [
      {
        index: 0,
        finish_reason: tool ? "tool_calls" : "stop",
        message: {
          role: "assistant",
          content: tool ? null : JSON.stringify(data),
          ...(tool
            ? {
                tool_calls: [
                  {
                    id: crypto.randomUUID(),
                    type: "function",
                    function: {
                      name: tool.name,
                      arguments: JSON.stringify(tool.args),
                    },
                  },
                ],
              }
            : {}),
        },
      },
    ],
    usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
  };
}

const answer = {
  text: "I can help with products and your cart.",
  showCart: false,
  productIds: [],
  clarification: null,
  missingInformation: false,
};

async function mock(
  result: unknown,
  chat: (body: ChatRequest) => unknown = (body) => chatResponse(body, answer),
  env: Record<string, string | undefined> = {},
  status = 200,
  onDecision = () => {},
  delayMs = 0,
) {
  const server = Fastify();

  servers.push(server);

  const decisions: Record<string, unknown>[] = [];
  const chats: ChatRequest[] = [];
  const usedModels: string[] = [];

  server.post("/alpha/decisions", async (request, reply) => {
    expect(request.headers.authorization).toBe("Bearer test-key");
    decisions.push(request.body as Record<string, unknown>);
    onDecision();
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));

    return reply.code(status).send(result);
  });

  server.post("/chat/completions", (request) => {
    const body = request.body as ChatRequest;

    chats.push(body);

    return chat(body);
  });

  await server.listen({ host: "127.0.0.1", port: 0 });

  const address = server.server.address() as AddressInfo;

  const provider = new OpenRouterProvider(
    readConfig({
      NODE_ENV: "test",
      OPENROUTER_API_KEY: "test-key",
      MODEL: "main-chat",
      MODEL_FAST: "test-decisions",
      MODEL_SIMPLE: "simple-chat",
      ...env,
    }),
    (_usage, model) => usedModels.push(model),
    `http://127.0.0.1:${address.port}`,
  );

  return { server, provider, decisions, chats, usedModels };
}

async function run(
  provider: OpenRouterProvider,
  message = "What can you do?",
  onCommit = () => {},
  cart: Cart["items"] = [],
  previousAnswer?: string,
) {
  const snapshot = snapshotOf(initialState());

  snapshot.cart.items = structuredClone(cart);
  if (previousAnswer)
    snapshot.messages.push({
      id: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      role: "assistant",
      content: previousAnswer,
      timestamp: new Date().toISOString(),
      incomplete: false,
    });

  const events: ServerEvent[] = [];
  const proposals: Proposal[] = [];

  await runWorkflow({ message, baseRevision: 0, snapshot }, provider, {
    requestId: crypto.randomUUID(),
    signal: new AbortController().signal,
    maxToolCalls: 12,
    emit: (type, payload) => events.push({ type, payload } as ServerEvent),
    commit: async (proposal) => {
      proposals.push(proposal);
      onCommit();

      return {
        requestId: crypto.randomUUID(),
        proposalId: proposal.proposalId,
        baseRevision: 0,
        committedRevision: 1,
        fingerprint: proposal.fingerprint,
        summary: commitSummary(proposal.nextCart, snapshot.products),
      };
    },
  });

  return { events, proposals };
}

it.each(["SIMPLE", "COMPLEX"])(
  "batches three decisions and selects the configured %s execution model",
  async (complexity) => {
    const mockServer = await mock(decision({ complexity }));
    const { events } = await run(mockServer.provider);

    expect(events.at(-1)?.type).toBe("request.completed");
    expect(mockServer.decisions).toHaveLength(1);

    expect(mockServer.decisions[0]).toMatchObject({
      model: "test-decisions",
      state: { currentMessage: "What can you do?" },
    });

    expect(Object.keys(mockServer.decisions[0].questions as object)).toEqual([
      "guard",
      "intent",
      "complexity",
    ]);

    expect(JSON.stringify(mockServer.decisions)).not.toContain("test-key");

    expect(mockServer.chats.map((body) => body.model)).toEqual([
      complexity === "SIMPLE" ? "simple-chat" : "main-chat",
    ]);

    expect(mockServer.usedModels[0]).toBe("test-decisions");

    expect(events).toContainEqual({
      type: "step.completed",
      payload: expect.objectContaining({
        stage: "routing",
        details: expect.objectContaining({
          route: "QUESTION",
          decisionMs: expect.any(Number),
          verificationMs: 0,
          verificationUsed: false,
          guardConfidence: 0.99,
          routeConfidence: 0.99,
          complexityConfidence: 0.99,
          decisionRoute: "QUESTION",
          decisionThreshold: 0.7,
          verificationReasons: [],
        }),
      }),
    });

    expect(mockServer.provider.usage).toMatchObject({
      calls: 2,
      inputTokens: 150,
      outputTokens: 30,
      byModel: {
        "test-decisions": { calls: 1, inputTokens: 100, outputTokens: 10 },
      },
    });
  },
);

it.each(["SIMPLE", "COMPLEX"])(
  "uses MODEL directly when only the %s complexity decision is uncertain",
  async (complexity) => {
    const mockServer = await mock(
      decision({ complexity, complexityConfidence: 0.55 }),
      (body) => {
        expect(body.response_format?.json_schema.name).not.toBe("assessment");

        return chatResponse(body, answer);
      },
      { MAX_LLM_CALLS: "2" },
    );

    const { events } = await run(mockServer.provider);

    expect(events.at(-1)?.type).toBe("request.completed");
    expect(mockServer.decisions).toHaveLength(1);
    expect(mockServer.chats.map((body) => body.model)).toEqual(["main-chat"]);
    expect(mockServer.provider.usage.calls).toBe(2);

    expect(events).toContainEqual({
      type: "step.completed",
      payload: expect.objectContaining({
        stage: "routing",
        details: expect.objectContaining({
          verificationUsed: false,
          verificationMs: 0,
          complexityConfidence: 0.55,
          verificationReasons: [],
        }),
      }),
    });
  },
);

it("finds and adds the cheapest lamp without rechecking uncertain complexity", async () => {
  let committed = false;
  let round = 0;

  const mockServer = await mock(
    decision({
      intent: "MIXED",
      complexity: "SIMPLE",
      complexityConfidence: 0.55,
    }),
    (body) => {
      if (body.response_format?.json_schema.name === "action_response") {
        expect(committed).toBe(true);
        expect(body.model).toBe("simple-chat");

        expect(
          JSON.parse(body.messages[1].content).receipt.committedRevision,
        ).toBe(1);

        return chatResponse(body, {
          text: "Added one Arc Desk Lamp.",
          showCart: true,
        });
      }

      expect(body.model).toBe("main-chat");

      const calls = [
        {
          name: "search_products",
          args: {
            query: "lamp",
            category: null,
            maxPriceMinor: null,
            limit: 10,
          },
        },
        {
          name: "choose_cheapest",
          args: { productIds: [seedProducts[0].id, seedProducts[1].id] },
        },
        {
          name: "add_to_cart",
          args: { productId: seedProducts[0].id, quantity: 1 },
        },
        {
          name: "finish_response",
          args: { ...answer, productIds: [seedProducts[0].id], showCart: true },
        },
      ];

      return chatResponse(body, null, calls[round++]);
    },
  );

  const result = await run(
    mockServer.provider,
    "find cheapest lamp and add to cart",
    () => {
      committed = true;
    },
  );

  expect(result.events.at(-1)).toMatchObject({
    type: "request.completed",
    payload: { cartStatus: "committed" },
  });

  expect(result.proposals).toHaveLength(1);

  expect(result.proposals[0].nextCart.items).toEqual([
    { productId: seedProducts[0].id, quantity: 1 },
  ]);

  expect(mockServer.provider.usage.calls).toBe(6);
});

it.each([
  { override: { guardConfidence: 0.69 }, reason: "guard_confidence" },
  { override: { intentConfidence: 0.69 }, reason: "route_confidence" },
  { override: { guard: "UNCERTAIN" }, reason: "guard_uncertain" },
])(
  "retains verification for $reason independently of complexity",
  async ({ override, reason }) => {
    const mockServer = await mock(
      decision({ intent: "MIXED", complexityConfidence: 0.55, ...override }),
      (body) => {
        if (body.response_format?.json_schema.name === "assessment") {
          expect(body.tools).toBeUndefined();

          expect(JSON.stringify(body.response_format)).not.toContain(
            "verificationReasons",
          );

          return chatResponse(body, {
            guard: { verdict: "VALID" },
            route: { intent: "QUESTION", confidence: 1, clarification: null },
            complexity: "SIMPLE",
          });
        }

        return chatResponse(body, answer);
      },
    );

    const { events } = await run(mockServer.provider);

    expect(events.at(-1)?.type).toBe("request.completed");

    expect(mockServer.chats.map((body) => body.model)).toEqual([
      "main-chat",
      "main-chat",
    ]);

    expect(events).toContainEqual({
      type: "step.completed",
      payload: expect.objectContaining({
        stage: "routing",
        details: expect.objectContaining({
          route: "QUESTION",
          decisionRoute: "MIXED",
          decisionThreshold: 0.7,
          verificationUsed: true,
          verificationReasons: [reason],
        }),
      }),
    });
  },
);

it.each(["low-confidence", "uncertain-guard"])(
  "rechecks %s with the main model before tools and keeps execution on it",
  async (mode) => {
    const mockServer = await mock(
      decision({
        confidence: mode === "low-confidence" ? 0.55 : 0.99,
        guard: mode === "uncertain-guard" ? "UNCERTAIN" : "VALID",
      }),
      (body) => {
        if (body.response_format?.json_schema.name === "assessment") {
          expect(body.tools).toBeUndefined();

          return chatResponse(body, {
            guard: { verdict: "VALID" },
            route: { intent: "QUESTION", confidence: 1, clarification: null },
            complexity: "SIMPLE",
          });
        }

        return chatResponse(body, answer);
      },
    );

    const { events } = await run(mockServer.provider);

    expect(events.at(-1)?.type).toBe("request.completed");

    expect(mockServer.chats.map((body) => body.model)).toEqual([
      "main-chat",
      "main-chat",
    ]);

    expect(mockServer.provider.usage.calls).toBe(3);
  },
);

it("separates decision latency from main-model verification in both check logs", async () => {
  const mockServer = await mock(
    decision({ confidence: 0.55 }),
    async (body) => {
      if (body.response_format?.json_schema.name === "assessment") {
        // Measurements must come from the provider, not the model's schema.
        expect(JSON.stringify(body.response_format)).not.toContain("timings");
        await new Promise((resolve) => setTimeout(resolve, 40));

        return chatResponse(body, {
          guard: { verdict: "VALID" },
          route: { intent: "QUESTION", confidence: 1, clarification: null },
          complexity: "SIMPLE",
        });
      }

      return chatResponse(body, answer);
    },
    {},
    200,
    undefined,
    25,
  );

  const { events } = await run(mockServer.provider);

  expect(events.at(-1)?.type).toBe("request.completed");

  const checks = events.filter(
    (event): event is Extract<ServerEvent, { type: "step.completed" }> =>
      event.type === "step.completed" &&
      ["checking", "routing"].includes(event.payload.stage),
  );

  expect(checks).toHaveLength(2);

  for (const event of checks) {
    if (event.type !== "step.completed") throw new Error("Expected check log");

    expect(event.payload.details).toMatchObject({
      decisionMs: expect.any(Number),
      verificationMs: expect.any(Number),
      verificationUsed: true,
    });

    const { decisionMs, verificationMs } = event.payload.details!;

    expect(decisionMs).toBeGreaterThanOrEqual(20);
    expect(verificationMs).toBeGreaterThanOrEqual(30);

    expect(event.payload.durationMs).toBeGreaterThanOrEqual(
      decisionMs! + verificationMs! - 2,
    );
  }

  // Both steps share one assessment; their durations must not be summed.
  const { decisionMs, verificationMs } = checks[0].payload.details!;

  expect(checks[1].payload.details).toMatchObject({
    decisionMs,
    verificationMs,
    verificationUsed: true,
  });
});

it("stops trusted spam without chat calls even if unused routing fields are malformed", async () => {
  const response = decision({ guard: "SPAM" });

  const mockServer = await mock({
    ...response,
    answers: { guard: response.answers.guard, intent: "invalid" },
  });

  const { events, proposals } = await run(mockServer.provider, "spam");

  expect(events.at(-1)).toMatchObject({
    type: "request.completed",
    payload: { agent: "guard", outcome: "clarification" },
  });

  expect(mockServer.chats).toEqual([]);
  expect(proposals).toEqual([]);
});

it("lets Knowledge retrieve candidates and write a clarification without mutation tools", async () => {
  let round = 0;

  const mockServer = await mock(
    decision({ intent: "CLARIFICATION" }),
    (body) => {
      expect(body.model).toBe("main-chat");

      expect(body.messages[0].content).toContain(
        "router requires clarification",
      );

      expect(body.tools?.map((tool) => tool.function.name)).not.toContain(
        "add_to_cart",
      );

      return chatResponse(
        body,
        null,
        round++ === 0
          ? {
              name: "search_products",
              args: {
                query: "headphones",
                category: null,
                maxPriceMinor: null,
                limit: 10,
              },
            }
          : {
              name: "finish_response",
              args: {
                ...answer,
                productIds: [seedProducts[3].id, seedProducts[4].id],
                clarification: "Which headphones would you like?",
              },
            },
      );
    },
  );

  const { events, proposals } = await run(
    mockServer.provider,
    "Add the headphones",
  );

  expect(events).toContainEqual({
    type: "clarification.required",
    payload: expect.objectContaining({
      question: "Which headphones would you like?",
      candidateIds: [seedProducts[3].id, seedProducts[4].id],
      originalMessage: "Add the headphones",
    }),
  });

  expect(events.at(-1)).toMatchObject({
    type: "request.completed",
    payload: { outcome: "clarification", cartStatus: "unchanged" },
  });

  expect(proposals).toEqual([]);
});

it.each([401, 429, 503])(
  "normalizes Decisions HTTP %s errors without exposing upstream payloads",
  async (status) => {
    const mockServer = await mock(
      { error: { message: "private provider payload test-key" } },
      undefined,
      {},
      status,
    );

    await expect(
      mockServer.provider.assess!(
        {
          message: "Hello",
          snapshot: snapshotOf(initialState()),
          baseRevision: 0,
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      code: "MODEL_UNAVAILABLE",
      message:
        "The decision model is unavailable. Check the server configuration and try again.",
    });

    expect(mockServer.decisions).toHaveLength(1);
    expect(mockServer.chats).toEqual([]);
  },
);

it("rejects malformed decisions before any execution or persistence", async () => {
  const mockServer = await mock({
    answers: { guard: { type: "choice", choice: "INVENTED", confidence: 1 } },
  });

  const { events, proposals } = await run(mockServer.provider);

  expect(events.at(-1)).toMatchObject({
    type: "request.failed",
    payload: { error: { code: "MODEL_INVALID_OUTPUT" } },
  });

  expect(mockServer.chats).toEqual([]);
  expect(proposals).toEqual([]);
});

it("shares the model call budget across Decisions, verification and execution", async () => {
  const mockServer = await mock(
    decision({ confidence: 0.55 }),
    (body) =>
      chatResponse(body, {
        guard: { verdict: "VALID" },
        route: { intent: "QUESTION", confidence: 1, clarification: null },
        complexity: "SIMPLE",
      }),
    { MAX_LLM_CALLS: "2" },
  );

  const { events, proposals } = await run(mockServer.provider);

  expect(events.at(-1)).toMatchObject({
    type: "request.failed",
    payload: { error: { code: "LIMIT_EXCEEDED" } },
  });

  expect(mockServer.decisions).toHaveLength(1);
  expect(mockServer.chats).toHaveLength(1);
  expect(proposals).toEqual([]);
});

it.each(["timeout", "cancel"])(
  "aborts in-flight Decisions requests on %s",
  async (mode) => {
    let started!: () => void;

    const requestStarted = new Promise<void>((resolve) => {
      started = resolve;
    });

    const mockServer = await mock(
      decision(),
      undefined,
      { LLM_TIMEOUT_MS: mode === "timeout" ? "50" : "2000" },
      200,
      () => started(),
      100,
    );

    const controller = new AbortController();

    const result = mockServer.provider.assess!(
      {
        message: "Hello",
        snapshot: snapshotOf(initialState()),
        baseRevision: 0,
      },
      controller.signal,
    );

    const assertion = expect(result).rejects.toMatchObject({
      code: mode === "timeout" ? "MODEL_TIMEOUT" : "CANCELLED",
    });

    await requestStarted;
    if (mode === "cancel") controller.abort();
    await assertion;
  },
);

it("falls back to MODEL for simple execution when MODEL_SIMPLE is omitted", async () => {
  const mockServer = await mock(decision(), undefined, {
    MODEL_SIMPLE: undefined,
  });

  const { events } = await run(mockServer.provider);

  expect(events.at(-1)?.type).toBe("request.completed");
  expect(mockServer.chats.map((body) => body.model)).toEqual(["main-chat"]);
});

it("honors the configured confidence threshold", async () => {
  const mockServer = await mock(
    decision({ confidence: 0.8 }),
    (body) => {
      expect(body.response_format?.json_schema.name).toBe("assessment");

      return chatResponse(body, {
        guard: { verdict: "SPAM" },
        route: { intent: "OUT_OF_SCOPE", confidence: 1, clarification: null },
        complexity: "SIMPLE",
      });
    },
    { DECISION_CONFIDENCE_THRESHOLD: "0.9" },
  );

  const { events, proposals } = await run(mockServer.provider);

  expect(events.at(-1)).toMatchObject({
    type: "request.completed",
    payload: { agent: "guard" },
  });

  expect(mockServer.chats).toHaveLength(1);
  expect(proposals).toEqual([]);
});

it("clears multiple cart lines when Gemini omits nullable tool arguments and confirms only after ACK", async () => {
  let committed = false;
  let round = 0;

  const mockServer = await mock(
    decision({ intent: "COMMAND", complexity: "COMPLEX" }),
    (body) => {
      if (body.response_format?.json_schema.name === "action_response") {
        expect(committed).toBe(true);
        expect(JSON.parse(body.messages[1].content).cart.items).toEqual([]);

        return chatResponse(body, {
          text: "Removed all items from your cart.",
          showCart: true,
        });
      }

      const calls = [
        { name: "get_product", args: { productId: seedProducts[0].id } },
        { name: "get_product", args: { productId: seedProducts[4].id } },
        { name: "remove_from_cart", args: { productId: seedProducts[0].id } },
        { name: "remove_from_cart", args: { productId: seedProducts[4].id } },
        {
          name: "finish_response",
          args: {
            ...answer,
            showCart: true,
            productIds: [seedProducts[0].id, seedProducts[4].id],
          },
        },
      ];

      return chatResponse(body, null, calls[round++]);
    },
  );

  const { events, proposals } = await run(
    mockServer.provider,
    "remove all items from cart",
    () => {
      committed = true;
    },
    [
      { productId: seedProducts[0].id, quantity: 3 },
      { productId: seedProducts[4].id, quantity: 1 },
    ],
  );

  expect(events.at(-1)).toMatchObject({
    type: "request.completed",
    payload: { cartStatus: "committed" },
  });

  expect(proposals).toHaveLength(1);
  expect(proposals[0].nextCart.items).toEqual([]);

  expect(
    proposals[0].operations.map((operation) => operation.nextQuantity),
  ).toEqual([0, 0]);

  expect(mockServer.decisions).toHaveLength(1);
});

it.each(["plain-text", "fenced-json", "missing-null"])(
  "handles a %s greeting after Jev without changing an existing cart",
  async (format) => {
    const result = { ...answer, text: "Hi! How can I help you shop?" };

    const mockServer = await mock(decision(), (body) => {
      if (body.response_format?.json_schema.name === "agent_result") {
        expect(body.tools).toBeUndefined();

        return chatResponse(body, result);
      }

      if (format === "missing-null")
        return chatResponse(body, null, {
          name: "finish_response",
          args: {
            text: result.text,
            showCart: false,
            productIds: [],
            missingInformation: false,
          },
        });

      const output = chatResponse(body, result);

      output.choices[0].message.content =
        format === "plain-text"
          ? result.text
          : `\`\`\`json\n${JSON.stringify(result)}\n\`\`\``;

      return output;
    });

    const { events, proposals } = await run(
      mockServer.provider,
      "hi",
      () => {},
      [
        { productId: seedProducts[0].id, quantity: 1 },
        { productId: seedProducts[4].id, quantity: 1 },
      ],
    );

    expect(events.at(-1)).toMatchObject({
      type: "request.completed",
      payload: { cartStatus: "unchanged" },
    });

    expect(events).toContainEqual({
      type: "assistant.message",
      payload: expect.objectContaining({
        content: result.text,
        showCart: false,
        cart: null,
      }),
    });

    expect(events.some((event) => event.type === "tool.started")).toBe(false);
    expect(proposals).toEqual([]);
    expect(mockServer.decisions).toHaveLength(1);
    expect(mockServer.chats).toHaveLength(format === "plain-text" ? 2 : 1);
  },
);

it("repairs a final Action response format without repeating an already staged mutation", async () => {
  let round = 0;

  const mockServer = await mock(decision({ intent: "COMMAND" }), (body) => {
    if (body.response_format?.json_schema.name === "action_response")
      return chatResponse(body, {
        text: "Added one Arc Desk Lamp.",
        showCart: true,
      });

    if (body.response_format?.json_schema.name === "agent_result") {
      expect(body.tools).toBeUndefined();

      return chatResponse(body, {
        ...answer,
        text: "One Arc Desk Lamp staged.",
        showCart: true,
        productIds: [seedProducts[0].id],
      });
    }

    const calls = [
      { name: "get_product", args: { productId: seedProducts[0].id } },
      {
        name: "add_to_cart",
        args: { productId: seedProducts[0].id, quantity: 1 },
      },
    ];

    const call = calls[round++];

    if (call) return chatResponse(body, null, call);

    const output = chatResponse(body, null);

    output.choices[0].message.content = "One Arc Desk Lamp staged.";

    return output;
  });

  const { events, proposals } = await run(
    mockServer.provider,
    "Add one Arc Desk Lamp",
  );

  expect(events.at(-1)).toMatchObject({
    type: "request.completed",
    payload: { cartStatus: "committed" },
  });

  expect(proposals).toHaveLength(1);

  expect(proposals[0].nextCart.items).toEqual([
    { productId: seedProducts[0].id, quantity: 1 },
  ]);

  expect(proposals[0].operations).toHaveLength(1);
});

it("answers hi when verification keeps Guard UNCERTAIN but Router chooses QUESTION", async () => {
  const mockServer = await mock(decision({ guard: "UNCERTAIN" }), (body) => {
    if (body.response_format?.json_schema.name === "assessment")
      return chatResponse(body, {
        guard: { verdict: "UNCERTAIN" },
        route: { intent: "QUESTION", confidence: 1, clarification: null },
        complexity: "SIMPLE",
      });

    return chatResponse(body, {
      ...answer,
      text: "Hi! How can I help you shop?",
    });
  });

  const { events, proposals } = await run(mockServer.provider, "hi", () => {}, [
    { productId: seedProducts[0].id, quantity: 1 },
    { productId: seedProducts[4].id, quantity: 1 },
  ]);

  expect(events.at(-1)).toMatchObject({
    type: "request.completed",
    payload: { cartStatus: "unchanged" },
  });

  expect(events).toContainEqual({
    type: "step.completed",
    payload: expect.objectContaining({
      agent: "guard",
      details: expect.objectContaining({ guardVerdict: "UNCERTAIN" }),
    }),
  });

  expect(events).toContainEqual({
    type: "step.completed",
    payload: expect.objectContaining({
      agent: "router",
      details: expect.objectContaining({ route: "QUESTION" }),
    }),
  });

  expect(
    events.some(
      (event) =>
        event.type === "clarification.required" ||
        event.type === "tool.started",
    ),
  ).toBe(false);

  expect(proposals).toEqual([]);
});

it("lets a low-confidence read-only QUESTION receive an answer rather than forcing a clarification", async () => {
  const mockServer = await mock(decision({ confidence: 0.55 }), (body) => {
    if (body.response_format?.json_schema.name === "assessment")
      return chatResponse(body, {
        guard: { verdict: "VALID" },
        route: { intent: "QUESTION", confidence: 0.4, clarification: null },
        complexity: "SIMPLE",
      });

    expect(body.messages[0].content).not.toContain(
      "router requires clarification",
    );

    return chatResponse(body, { ...answer, text: "Hello! How can I help?" });
  });

  const { events, proposals } = await run(mockServer.provider, "hi");

  expect(events.at(-1)).toMatchObject({
    type: "request.completed",
    payload: { outcome: "completed" },
  });

  expect(events.some((event) => event.type === "clarification.required")).toBe(
    false,
  );

  expect(proposals).toEqual([]);
});

it("keeps a low-confidence cart command read-only until the user clarifies", async () => {
  const mockServer = await mock(decision({ confidence: 0.55 }), (body) => {
    if (body.response_format?.json_schema.name === "assessment")
      return chatResponse(body, {
        guard: { verdict: "UNCERTAIN" },
        route: { intent: "COMMAND", confidence: 0.4, clarification: null },
        complexity: "COMPLEX",
      });

    expect(body.tools?.map((tool) => tool.function.name)).not.toContain(
      "add_to_cart",
    );

    return chatResponse(body, {
      ...answer,
      clarification: "Which product would you like to add?",
    });
  });

  const { events, proposals } = await run(mockServer.provider, "add that one");

  expect(events.at(-1)).toMatchObject({
    type: "request.completed",
    payload: { outcome: "clarification", cartStatus: "unchanged" },
  });

  expect(proposals).toEqual([]);
});

it("puts the current hi in the final user message for verification and Knowledge despite product history", async () => {
  const previous =
    "Cloud Wireless Headphones are $89.00; Studio Wireless Headphones are $129.00.";

  const mockServer = await mock(decision({ guard: "UNCERTAIN" }), (body) => {
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "hi" });

    expect(
      JSON.parse(body.messages[1].content).conversation.at(-1).content,
    ).toBe(previous);

    if (body.response_format?.json_schema.name === "assessment") {
      expect(body.messages[0].content).toContain(
        "Make the Guard and Router judgments independently",
      );

      return chatResponse(body, {
        guard: { verdict: "UNCERTAIN" },
        route: { intent: "QUESTION", confidence: 1, clarification: null },
        complexity: "SIMPLE",
      });
    }

    return chatResponse(body, { ...answer, text: "Hi! How can I help?" });
  });

  const { events, proposals } = await run(
    mockServer.provider,
    "hi",
    () => {},
    [
      { productId: seedProducts[0].id, quantity: 1 },
      { productId: seedProducts[4].id, quantity: 1 },
    ],
    previous,
  );

  expect(events.at(-1)?.type).toBe("request.completed");
  expect(events.some((event) => event.type === "tool.started")).toBe(false);
  expect(proposals).toEqual([]);
});
