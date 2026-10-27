import type { FastifyBaseLogger } from "fastify";
import type { EventPayload, EventType } from "@shop/contracts";

// Technical logs use a fixed metadata allowlist. Never serialize event payloads,
// catalog data, messages, custom identity, provider errors or tool arguments.
export function logExecution<T extends EventType>(
  logger: FastifyBaseLogger,
  requestId: string,
  type: T,
  payload: EventPayload<T>,
  elapsedMs: number,
) {
  if (type === "assistant.message" || type === "assistant.delta") return;
  const fields = {
    requestId,
    event: type,
    stage: "stage" in payload ? payload.stage : type,
    tool: "details" in payload ? payload.details?.tool : undefined,
    durationMs: "durationMs" in payload ? payload.durationMs : undefined,
    code: "error" in payload ? payload.error?.code : undefined,
    outcome: "outcome" in payload ? payload.outcome : undefined,
    cartStatus: "cartStatus" in payload ? payload.cartStatus : undefined,
  };
  if (
    type === "request.completed" ||
    type === "request.failed" ||
    type === "request.cancelled"
  )
    fields.durationMs = Math.round(elapsedMs);
  const label = "label" in payload ? payload.label : type;
  if ("error" in payload && payload.error) logger.warn(fields, label);
  else logger.info(fields, label);
}
