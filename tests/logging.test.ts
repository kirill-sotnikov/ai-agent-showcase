import { expect, it, vi } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import { logExecution } from "../packages/service/src/observability/logger.js";

it("keeps technical logs to allowed metadata without message or tool contents", () => {
  const logger = { info: vi.fn(), warn: vi.fn() };
  const requestId = crypto.randomUUID();

  logExecution(
    logger as unknown as FastifyBaseLogger,
    requestId,
    "tool.started",
    {
      stage: "executing",
      label: "Searching products",
      details: { tool: "search_products", query: "private product query" },
    },
    12,
  );

  logExecution(
    logger as unknown as FastifyBaseLogger,
    requestId,
    "assistant.message",
    { messageId: crypto.randomUUID(), content: "private assistant response" },
    15,
  );

  expect(logger.info).toHaveBeenCalledTimes(1);

  expect(logger.info.mock.calls[0][0]).toMatchObject({
    requestId,
    stage: "executing",
    tool: "search_products",
  });

  expect(JSON.stringify(logger.info.mock.calls)).not.toContain("private");
});

it("writes terminal failures to Pino with a stable code and elapsed duration", () => {
  const logger = { info: vi.fn(), warn: vi.fn() };

  logExecution(
    logger as unknown as FastifyBaseLogger,
    crypto.randomUUID(),
    "request.failed",
    {
      outcome: "failed",
      cartStatus: "unchanged",
      error: {
        code: "MODEL_UNAVAILABLE",
        message: "private upstream details",
        retryable: true,
      },
    },
    123.4,
  );

  expect(logger.warn.mock.calls[0][0]).toMatchObject({
    code: "MODEL_UNAVAILABLE",
    durationMs: 123,
    outcome: "failed",
  });

  expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
    "private upstream",
  );
});
