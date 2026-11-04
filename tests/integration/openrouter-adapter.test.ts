import { afterEach, expect, it } from "vitest";
import Fastify from "fastify";
import type { AddressInfo } from "node:net";
import { seedProducts } from "@shop/shared/defaults";
import { serverEventSchema, type ServerEvent } from "@shop/shared/contracts";
import { OpenRouterProvider } from "../../packages/service/src/ai/llm/openrouter.js";
import { FakeProvider } from "../../packages/service/src/ai/llm/fake.js";
import type { Provider } from "../../packages/service/src/ai/llm/types.js";
import { runWorkflow } from "../../packages/service/src/ai/orchestrator/workflow.js";
import { ToolGateway } from "../../packages/service/src/ai/tools/gateway.js";
import { readConfig } from "../../packages/service/src/config/index.js";
import {
  initialState,
  snapshotOf,
  WorkspaceStore,
} from "../../packages/web/src/storage/store.js";
import { MemoryStorage, TestLocks } from "../helpers.js";

const servers: ReturnType<typeof Fastify>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

interface CompletionRequest {
  model: string;
  max_tokens: number;
  provider: { require_parameters: boolean };
  response_format?: {
    type: string;
    json_schema: { name: string; strict: boolean };
  };
  messages: {
    role: string;
    content: string;
    tool_call_id?: string;
    tool_calls?: { id: string }[];
  }[];
  tools?: {
    type: string;
    function: {
      name: string;
      strict: boolean;
      parameters: { additionalProperties: boolean };
    };
  }[];
}

function requestName(body: CompletionRequest) {
  return body.response_format?.json_schema.name ?? "agent_result";
}

function response(
  data: unknown,
  model: string,
  call?: { name: string; arguments: unknown },
) {
  return {
    id: `gen_${crypto.randomUUID()}`,
    object: "chat.completion",
    created: 1,
    model,
    choices: [
      {
        index: 0,
        finish_reason: call ? "tool_calls" : "stop",
        message: {
          role: "assistant",
          content: call ? null : JSON.stringify(data),
          ...(call
            ? {
                tool_calls: [
                  {
                    id: `call_${crypto.randomUUID()}`,
                    type: "function",
                    function: {
                      name: call.name,
                      arguments: JSON.stringify(call.arguments),
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

it("uses the configured model for guard, router, dependent tools, and Action response after persistence through the real SDK", async () => {
  const server = Fastify();

  servers.push(server);

  const bodies: CompletionRequest[] = [];

  let allowGuard!: () => void;

  const routingStarted = new Promise<void>((resolve) => {
    allowGuard = resolve;
  });

  let toolRound = 0;

  server.post("/chat/completions", async (request) => {
    const body = request.body as CompletionRequest;

    bodies.push(body);

    let output;

    switch (requestName(body)) {
      case "guard":
        // The SDK must start routing while Guard is still awaiting a response.
        await routingStarted;
        output = response({ verdict: "VALID" }, body.model);

        break;

      case "route":
        allowGuard();

        output = response(
          { intent: "MIXED", confidence: 1, clarification: null },
          body.model,
        );

        break;

      case "agent_result": {
        expect(
          body.tools?.every(
            (tool) =>
              tool.function.strict &&
              tool.function.parameters.additionalProperties === false,
          ),
        ).toBe(true);

        const calls = [
          {
            name: "search_products",
            arguments: {
              query: "lamp",
              category: null,
              maxPriceMinor: 4999,
              limit: 10,
            },
          },
          {
            name: "choose_cheapest",
            arguments: { productIds: [seedProducts[0].id, seedProducts[1].id] },
          },
          {
            name: "add_to_cart",
            arguments: { productId: seedProducts[0].id, quantity: 1 },
          },
        ];

        output = response(
          {
            text: "Arc Desk Lamp is the cheapest lamp found.",
            showCart: true,
            productIds: [seedProducts[0].id],
            clarification: null,
            missingInformation: false,
          },
          body.model,
          calls[toolRound++],
        );

        break;
      }

      default:
        output = response(
          {
            text: "Added one item to your cart.",
            showCart: true,
          },
          body.model,
        );
    }

    return output;
  });

  await server.listen({ host: "127.0.0.1", port: 0 });

  const address = server.server.address() as AddressInfo;

  const provider = new OpenRouterProvider(
    readConfig({
      OPENROUTER_API_KEY: "test-secret",
      MODEL: "configured-test-model",
    }),
    () => {},
    `http://127.0.0.1:${address.port}`,
  );

  const store = new WorkspaceStore(new MemoryStorage(), new TestLocks());

  await store.initialize();

  const requestId = crypto.randomUUID();

  const payload = await store.begin(
    requestId,
    "Find a lamp under $50 and add the cheapest one.",
  );

  const events: string[] = [];

  await runWorkflow(payload, provider, {
    requestId,
    maxToolCalls: 12,
    signal: new AbortController().signal,
    commit: (proposal) => store.commit(requestId, proposal),
    emit: (type, event) => {
      events.push(type);
      if (type === "assistant.message" && "content" in event)
        expect(event.content).not.toContain("test-secret");
    },
  });

  expect(events.at(-1)).toBe("request.completed");
  expect(bodies).toHaveLength(7);

  const actionResponse = bodies.at(-1)!;

  expect(actionResponse.response_format).toMatchObject({
    type: "json_schema",
    json_schema: { name: "action_response", strict: true },
  });

  expect(actionResponse.tools).toBeUndefined();

  expect(
    JSON.parse(
      (actionResponse.messages as CompletionRequest["messages"])[1].content,
    ),
  ).toMatchObject({
    context: { currentMessage: payload.message },
    receipt: { committedRevision: 1 },
    cart: { items: [{ productId: seedProducts[0].id, quantity: 1 }] },
    toolResults: expect.arrayContaining([
      expect.objectContaining({
        name: "choose_cheapest",
        result: expect.objectContaining({ id: seedProducts[0].id }),
      }),
    ]),
  });

  expect(
    bodies.every(
      (body) =>
        body.model === "configured-test-model" && body.max_tokens === 1500,
    ),
  ).toBe(true);

  for (const body of bodies) {
    expect(body.provider).toEqual({ require_parameters: true });
    expect(body).not.toHaveProperty("parallel_tool_calls");
    expect(body).not.toHaveProperty("reasoning");
  }

  expect(store.read()!.cart.items).toEqual([
    { productId: seedProducts[0].id, quantity: 1 },
  ]);

  expect(provider.usage).toMatchObject({
    calls: 7,
    inputTokens: 350,
    outputTokens: 140,
  });
});

it("sends prior turns and the current cart to every agent and commits a follow-up despite an uncertain guard", async () => {
  const store = new WorkspaceStore(new MemoryStorage(), new TestLocks());

  await store.initialize();
  await store.setQuantity(seedProducts[0].id, 3);

  async function turn(message: string, provider: Provider) {
    const requestId = crypto.randomUUID();
    const payload = await store.begin(requestId, message);
    const writes: Promise<unknown>[] = [];
    const events: ServerEvent[] = [];

    let sequence = 0;

    await runWorkflow(payload, provider, {
      requestId,
      maxToolCalls: 12,
      signal: new AbortController().signal,
      commit: (proposal) => store.commit(requestId, proposal),
      emit: (type, event) => {
        const parsed = serverEventSchema.parse({
          protocolVersion: 1,
          requestId,
          eventId: crypto.randomUUID(),
          sequence: ++sequence,
          timestamp: new Date().toISOString(),
          type,
          payload: event,
        });

        events.push(parsed);
        writes.push(store.record(parsed));
      },
    });

    await Promise.all(writes);

    return events;
  }

  await turn("Add Blue Ceramic Mug to cart", new FakeProvider());

  const priorMessages = store.read()!.messages;

  expect(priorMessages.map((message) => message.role)).toEqual([
    "user",
    "assistant",
  ]);

  expect(priorMessages[1].content).toContain("Blue Ceramic Mug");

  const server = Fastify();

  servers.push(server);

  const contexts: unknown[] = [];

  const result = {
    text: "Blue Ceramic Mug costs $18.00.",
    showCart: true,
    productIds: [seedProducts[2].id],
    clarification: null,
    missingInformation: false,
  };

  const actionResponse = {
    text: "Added one item to your cart.",
    showCart: true,
  };

  const toolCalls = [
    { name: "get_product", arguments: { productId: seedProducts[2].id } },
    {
      name: "add_to_cart",
      arguments: { productId: seedProducts[2].id, quantity: 1 },
    },
  ];

  let toolRound = 0;

  server.post("/chat/completions", async (request) => {
    const body = request.body as CompletionRequest;

    const name = requestName(body);

    if (name !== "action_response")
      contexts.push(JSON.parse(body.messages[1].content));

    const output = response(
      name === "guard"
        ? { verdict: "UNCERTAIN" }
        : name === "route"
          ? { intent: "COMMAND", confidence: 1, clarification: null }
          : name === "action_response"
            ? actionResponse
            : result,
      body.model,
      name === "agent_result" ? toolCalls[toolRound++] : undefined,
    );

    return output;
  });

  await server.listen({ host: "127.0.0.1", port: 0 });

  const address = server.server.address() as AddressInfo;

  const events = await turn(
    "add one more",
    new OpenRouterProvider(
      readConfig({
        OPENROUTER_API_KEY: "test-secret",
        MODEL: "configured-test-model",
      }),
      () => {},
      `http://127.0.0.1:${address.port}`,
    ),
  );

  // Guard, Router and all three Action calls receive the same prior conversation.
  expect(contexts).toHaveLength(5);

  for (const context of contexts)
    expect(context).toMatchObject({
      currentMessage: "add one more",
      baseRevision: 2,
      conversation: priorMessages,
      cart: {
        items: [
          {
            productId: seedProducts[0].id,
            name: seedProducts[0].name,
            quantity: 3,
          },
          {
            productId: seedProducts[2].id,
            name: seedProducts[2].name,
            quantity: 1,
          },
        ],
      },
    });

  expect(store.read()!.cart.items).toEqual([
    { productId: seedProducts[0].id, quantity: 3 },
    { productId: seedProducts[2].id, quantity: 2 },
  ]);

  expect(events.at(-1)).toMatchObject({
    type: "request.completed",
    payload: { outcome: "completed", cartStatus: "committed" },
  });
});

it("normalizes upstream errors without leaking provider payloads", async () => {
  const server = Fastify();

  servers.push(server);

  server.post("/chat/completions", (_request, reply) =>
    reply.code(401).send({
      error: {
        message: "secret payload sk-private",
        type: "authentication_error",
      },
    }),
  );

  await server.listen({ host: "127.0.0.1", port: 0 });

  const address = server.server.address() as AddressInfo;

  const provider = new OpenRouterProvider(
    readConfig({
      OPENROUTER_API_KEY: "test-secret",
      MODEL: "configured-test-model",
    }),
    () => {},
    `http://127.0.0.1:${address.port}`,
  );

  await expect(
    provider.guard(
      {
        message: "Find lamps",
        baseRevision: 0,
        snapshot: snapshotOf(initialState()),
      },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({
    code: "MODEL_UNAVAILABLE",
    message:
      "The model is unavailable. Check the server configuration and try again.",
  });
});

it("gives guard and router named clarification candidates without treating them as tool retrieval", async () => {
  const server = Fastify();

  servers.push(server);

  const contexts: unknown[] = [];

  server.post("/chat/completions", async (request) => {
    const body = request.body as CompletionRequest;

    contexts.push(JSON.parse(body.messages[1].content));

    return response(
      requestName(body) === "guard"
        ? { verdict: "VALID" }
        : { intent: "COMMAND", confidence: 1, clarification: null },
      body.model,
    );
  });

  await server.listen({ host: "127.0.0.1", port: 0 });

  const address = server.server.address() as AddressInfo;

  const provider = new OpenRouterProvider(
    readConfig({ OPENROUTER_API_KEY: "test-secret", MODEL: "test-model" }),
    () => {},
    `http://127.0.0.1:${address.port}`,
  );

  const snapshot = snapshotOf(initialState());

  snapshot.pendingClarification = {
    requestId: crypto.randomUUID(),
    originalMessage: "Add the headphones.",
    question: "Which headphones?",
    candidateIds: [seedProducts[3].id, seedProducts[4].id],
    baseRevision: 0,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };

  const context = { message: "Cloud", baseRevision: 0, snapshot };
  const signal = new AbortController().signal;

  await provider.guard(context, signal);
  await provider.route(context, signal);

  expect(contexts).toHaveLength(2);

  for (const input of contexts)
    expect(input).toMatchObject({
      currentMessage: "Cloud",
      pendingClarification: {
        originalMessage: "Add the headphones.",
        candidates: [
          { id: seedProducts[3].id, name: seedProducts[3].name },
          { id: seedProducts[4].id, name: seedProducts[4].name },
        ],
      },
      catalogCategories: ["Lighting", "Kitchen", "Audio", "Accessories"],
    });

  const gateway = new ToolGateway("action", snapshot, 12, signal, () => {});

  await expect(
    gateway.call("add_to_cart", { productId: seedProducts[3].id, quantity: 1 }),
  ).rejects.toThrow("Retrieve a product");

  expect(snapshot.pendingClarification).not.toHaveProperty("candidates");
});

it.each([
  {
    question: "What can you help me with?",
    text: "I can compare products and help with your cart.",
    product: null,
  },
  {
    question: "What color is the Arc Desk Lamp?",
    text: "It is sage green.",
    product: seedProducts[0],
  },
])(
  "delivers Knowledge's natural answer to $question without calling Composer or Action",
  async ({ question, text, product }) => {
    const server = Fastify();

    servers.push(server);

    const requests: string[] = [];

    let retrieved = false;

    server.post("/chat/completions", async (request) => {
      const body = request.body as CompletionRequest;

      const name = requestName(body);

      requests.push(name);
      if (name === "guard") return response({ verdict: "VALID" }, body.model);
      if (name === "route")
        return response(
          { intent: "QUESTION", confidence: 1, clarification: null },
          body.model,
        );
      expect(name).toBe("agent_result");

      expect(body.tools?.map((tool) => tool.function.name)).not.toContain(
        "add_to_cart",
      );

      if (product && !retrieved) {
        retrieved = true;

        return response(null, body.model, {
          name: "get_product",
          arguments: { productId: product.id },
        });
      }

      return response(
        {
          text,
          showCart: false,
          productIds: product ? [product.id] : [],
          clarification: null,
          missingInformation: false,
        },
        body.model,
      );
    });

    await server.listen({ host: "127.0.0.1", port: 0 });

    const address = server.server.address() as AddressInfo;

    const provider = new OpenRouterProvider(
      readConfig({ OPENROUTER_API_KEY: "test", MODEL: "test-model" }),
      () => {},
      `http://127.0.0.1:${address.port}`,
    );

    const events: ServerEvent[] = [];

    await runWorkflow(
      {
        message: question,
        baseRevision: 0,
        snapshot: snapshotOf(initialState()),
      },
      provider,
      {
        requestId: crypto.randomUUID(),
        signal: new AbortController().signal,
        maxToolCalls: 12,
        commit: async () => {
          throw new Error("Questions must not commit");
        },
        emit: (type, payload) => events.push({ type, payload } as ServerEvent),
      },
    );

    expect(events).toContainEqual({
      type: "assistant.message",
      payload: expect.objectContaining({
        content: text,
        showCart: false,
        cart: null,
      }),
    });

    expect(events.at(-1)?.type).toBe("request.completed");
    expect(requests).toHaveLength(product ? 4 : 3);
    expect(requests).not.toContain("action_response");
    expect(requests).not.toContain("presentation");
  },
);

async function mockProvider(
  handler: (body: CompletionRequest) => unknown | Promise<unknown>,
  limits: Record<string, string> = {},
) {
  const server = Fastify();

  servers.push(server);

  server.post("/chat/completions", (request) => {
    expect(request.headers.authorization).toBe("Bearer configured-test-key");

    return handler(request.body as CompletionRequest);
  });

  await server.listen({ host: "127.0.0.1", port: 0 });

  const address = server.server.address() as AddressInfo;

  return new OpenRouterProvider(
    readConfig({
      OPENROUTER_API_KEY: "configured-test-key",
      MODEL: "configured-test-model",
      ...limits,
    }),
    () => {},
    `http://127.0.0.1:${address.port}`,
  );
}

it.each(["malformed-json", "wrong-schema", "truncated"])(
  "rejects %s output from OpenRouter",
  async (failure) => {
    const provider = await mockProvider((body) => {
      const output = response(
        { verdict: failure === "wrong-schema" ? "INVENTED" : "VALID" },
        body.model,
      );

      if (failure === "malformed-json")
        output.choices[0].message.content = "not json";
      if (failure === "truncated") output.choices[0].finish_reason = "length";

      return output;
    });

    await expect(
      provider.guard(
        {
          message: "Find lamps",
          baseRevision: 0,
          snapshot: snapshotOf(initialState()),
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "MODEL_INVALID_OUTPUT" });
  },
);

it("rejects malformed tool arguments before any tool can run", async () => {
  const provider = await mockProvider((body) => {
    const output = response(null, body.model, {
      name: "add_to_cart",
      arguments: {},
    });

    output.choices[0].message.tool_calls![0].function.arguments =
      "{broken-json";

    return output;
  });

  const snapshot = snapshotOf(initialState());
  const signal = new AbortController().signal;
  const gateway = new ToolGateway("action", snapshot, 12, signal, () => {});

  await expect(
    provider.execute(
      "action",
      { message: "Add a lamp", baseRevision: 0, snapshot },
      gateway,
      signal,
    ),
  ).rejects.toMatchObject({ code: "MODEL_INVALID_OUTPUT" });

  expect(gateway.calls).toBe(0);
  expect(gateway.draft.operations).toEqual([]);
});

it("stops the LangGraph tool loop at the shared model call budget", async () => {
  let requests = 0;

  const provider = await mockProvider(
    (body) => {
      requests++;

      const previousTools = body.messages.filter(
        (message) => message.role === "tool",
      );

      if (requests === 2) {
        expect(previousTools).toHaveLength(1);

        expect(previousTools[0].tool_call_id).toBe(
          body.messages[2].tool_calls![0].id,
        );

        expect(JSON.parse(previousTools[0].content)).toHaveProperty("cart");
      }

      return response(null, body.model, { name: "get_cart", arguments: {} });
    },
    { MAX_LLM_CALLS: "2" },
  );

  const snapshot = snapshotOf(initialState());
  const signal = new AbortController().signal;
  const gateway = new ToolGateway("knowledge", snapshot, 12, signal, () => {});

  await expect(
    provider.execute(
      "knowledge",
      { message: "Show my cart", baseRevision: 0, snapshot },
      gateway,
      signal,
    ),
  ).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });

  expect(requests).toBe(2);
  expect(gateway.calls).toBe(2);
  expect(provider.usage.calls).toBe(2);
});

it.each(["timeout", "cancel"])(
  "aborts an in-flight OpenRouter request on %s",
  async (mode) => {
    let started!: () => void;

    const requestStarted = new Promise<void>((resolve) => {
      started = resolve;
    });

    const provider = await mockProvider(
      async (body) => {
        started();
        await new Promise((resolve) => setTimeout(resolve, 100));

        return response({ verdict: "VALID" }, body.model);
      },
      { LLM_TIMEOUT_MS: mode === "timeout" ? "50" : "2000" },
    );

    const controller = new AbortController();

    const result = provider.guard(
      {
        message: "Find lamps",
        baseRevision: 0,
        snapshot: snapshotOf(initialState()),
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

it("finishes the tool graph through a validated result tool without executing it on the gateway", async () => {
  const result = {
    text: "Hello! I can help you shop.",
    showCart: false,
    productIds: [],
    clarification: null,
    missingInformation: false,
  };

  const provider = await mockProvider((body) => {
    expect(body.response_format).toBeUndefined();

    expect(body.tools?.map((tool) => tool.function.name)).toContain(
      "finish_response",
    );

    return response(null, body.model, {
      name: "finish_response",
      arguments: result,
    });
  });

  const snapshot = snapshotOf(initialState());
  const signal = new AbortController().signal;
  const gateway = new ToolGateway("knowledge", snapshot, 12, signal, () => {});

  await expect(
    provider.execute(
      "knowledge",
      { message: "Hello", baseRevision: 0, snapshot },
      gateway,
      signal,
    ),
  ).resolves.toEqual(result);

  expect(gateway.calls).toBe(0);
});
