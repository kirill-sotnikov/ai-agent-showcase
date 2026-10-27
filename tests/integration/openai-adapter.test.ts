import { afterEach, expect, it } from "vitest";
import Fastify from "fastify";
import OpenAI from "openai";
import type { AddressInfo } from "node:net";
import { seedProducts } from "@shop/domain";
import { OpenAIProvider } from "../../apps/server/src/ai/llm/openai.js";
import { runWorkflow } from "../../apps/server/src/ai/orchestrator/workflow.js";
import { readConfig } from "../../apps/server/src/config/index.js";
import {
  initialState,
  snapshotOf,
  WorkspaceStore,
} from "../../apps/web/src/storage/store.js";
import { MemoryStorage, TestLocks } from "../helpers.js";

const servers: ReturnType<typeof Fastify>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

function response(
  data: unknown,
  model: string,
  call?: { name: string; arguments: unknown },
) {
  return {
    id: `resp_${crypto.randomUUID()}`,
    object: "response",
    created_at: 1,
    status: "completed",
    model,
    error: null,
    incomplete_details: null,
    output: call
      ? [
          {
            type: "function_call",
            id: `fc_${crypto.randomUUID()}`,
            call_id: `call_${crypto.randomUUID()}`,
            name: call.name,
            arguments: JSON.stringify(call.arguments),
            status: "completed",
          },
        ]
      : [
          {
            id: `msg_${crypto.randomUUID()}`,
            type: "message",
            role: "assistant",
            status: "completed",
            content: [
              {
                type: "output_text",
                text: JSON.stringify(data),
                annotations: [],
              },
            ],
          },
        ],
    usage: {
      input_tokens: 50,
      output_tokens: 20,
      total_tokens: 70,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  };
}

it("uses the configured model for guard, router, dependent tools, and streamed composition through the real SDK", async () => {
  const server = Fastify();

  servers.push(server);

  const bodies: Record<string, unknown>[] = [];

  let toolRound = 0;

  server.post("/responses", async (request, reply) => {
    const body = request.body as {
      model: string;
      stream?: boolean;
      text: { format: { name: string } };
      input: unknown;
      tools?: {
        name: string;
        strict: boolean;
        parameters: { additionalProperties: boolean };
      }[];
    };

    bodies.push(body);

    let output;

    switch (body.text.format.name) {
      case "guard":
        output = response({ verdict: "VALID" }, body.model);

        break;

      case "route":
        output = response(
          { intent: "MIXED", confidence: 1, clarification: null },
          body.model,
        );

        break;

      case "agent_result": {
        expect(
          body.tools?.every(
            (tool) =>
              tool.strict && tool.parameters.additionalProperties === false,
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
            intro: "Here is your saved cart.",
            productIds: [seedProducts[0].id],
            missingInformation: false,
          },
          body.model,
        );
    }

    if (body.stream) {
      const text = JSON.stringify({
        intro: "Here is your saved cart.",
        productIds: [seedProducts[0].id],
        missingInformation: false,
      });

      return reply
        .type("text/event-stream")
        .send(
          `event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: text })}\n\nevent: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: output })}\n\n`,
        );
    }

    return output;
  });

  await server.listen({ host: "127.0.0.1", port: 0 });

  const address = server.server.address() as AddressInfo;

  const provider = new OpenAIProvider(
    readConfig({
      OPENAI_API_KEY: "test-secret",
      OPENAI_MODEL: "configured-test-model",
    }),
    () => {},
    new OpenAI({
      apiKey: "test-secret",
      baseURL: `http://127.0.0.1:${address.port}`,
      maxRetries: 0,
    }),
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

  expect(
    bodies.every(
      (body) => body.model === "configured-test-model" && body.store === false,
    ),
  ).toBe(true);

  for (const body of bodies) {
    expect(body.reasoning).toEqual({ effort: "none" });
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

it("normalizes upstream errors without leaking provider payloads", async () => {
  const server = Fastify();

  servers.push(server);

  server.post("/responses", (_request, reply) =>
    reply.code(401).send({
      error: {
        message: "secret payload sk-private",
        type: "authentication_error",
      },
    }),
  );

  await server.listen({ host: "127.0.0.1", port: 0 });

  const address = server.server.address() as AddressInfo;

  const provider = new OpenAIProvider(
    readConfig({
      OPENAI_API_KEY: "test-secret",
      OPENAI_MODEL: "configured-test-model",
    }),
    () => {},
    new OpenAI({
      apiKey: "test-secret",
      baseURL: `http://127.0.0.1:${address.port}`,
      maxRetries: 0,
    }),
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
