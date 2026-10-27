import Fastify from "fastify";
import websocket from "@fastify/websocket";
import {
  clientCommandSchema,
  eventPayloads,
  LIMITS,
  type CommitReceipt,
  type EventPayload,
  type EventType,
  type Proposal,
} from "@shop/shared/contracts";
import { commitSummary, DomainError } from "@shop/shared/domain";
import { readConfig, readiness, type Config } from "./config/index.js";
import { FakeProvider } from "./ai/llm/fake.js";
import { OpenAIProvider } from "./ai/llm/openai.js";
import type { Provider } from "./ai/llm/types.js";
import { runWorkflow, type Emit } from "./ai/orchestrator/workflow.js";
import { logExecution } from "./observability/logger.js";

export function createServer(
  config: Config = readConfig(),
  providerFactory?: () => Provider,
) {
  const server = Fastify({
    logger:
      config.NODE_ENV !== "test"
        ? {
            redact: ["req.headers.authorization", "req.headers.cookie"],
            level: "info",
          }
        : false,
    bodyLimit: LIMITS.frameBytes,
  });

  const workspaces = new Map<string, string>();
  const ipStarts = new Map<string, { count: number; expires: number }>();

  const origins = new Set(
    config.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()),
  );

  const ready = () => readiness(config);

  server.get("/health", () => ({ status: "ok" }));

  server.get("/ready", (_request, reply) => {
    const status = ready();

    return reply.code(status.ready ? 200 : 503).send(status);
  });

  server.register(async (scope) => {
    await scope.register(websocket, {
      options: { maxPayload: LIMITS.frameBytes, perMessageDeflate: false },
      preClose: function (done) {
        for (const socket of this.websocketServer.clients) socket.terminate();
        this.websocketServer.close(done);
      },
    });

    scope.get(
      "/ws",
      {
        websocket: true,
        preValidation: (request, reply, done) => {
          if (scope.websocketServer.clients.size >= 100) {
            void reply.code(503).send({ error: "The server is busy." });

            return;
          }

          if (!request.headers.origin || !origins.has(request.headers.origin)) {
            void reply.code(403).send({ error: "Origin is not allowed." });

            return;
          }

          done();
        },
      },
      (socket, request) => {
        const connectionId = crypto.randomUUID();

        server.log.info(
          { connectionId, stage: "connected" },
          "WebSocket connected",
        );

        let connectionSequence = 0;
        let alive = true;
        let frameCount = 0;
        let frameWindow = Date.now();

        const seen = new Set<string>();

        let active: {
          requestId: string;
          workspaceId: string;
          controller: AbortController;
          ack: null | {
            proposal: Proposal;
            summary: string;
            resolve: (receipt: CommitReceipt) => void;
            reject: (error: Error) => void;
            timer: ReturnType<typeof setTimeout>;
          };
        } | null = null;

        const send = <T extends EventType>(
          requestId: string,
          sequence: number,
          type: T,
          payload: EventPayload<T>,
        ) => {
          if (socket.readyState !== socket.OPEN)
            throw new DomainError("CONNECTION_LOST", "Connection lost.");

          if (socket.bufferedAmount > 262144) {
            socket.close(1013, "Receiver too slow. Request interrupted.");

            throw new DomainError(
              "CONNECTION_LOST",
              "Receiver is too slow. Request interrupted.",
            );
          }

          const value = {
            protocolVersion: 1,
            requestId,
            eventId: crypto.randomUUID(),
            sequence,
            timestamp: new Date().toISOString(),
            type,
            payload: eventPayloads[type].parse(payload),
          };

          socket.send(JSON.stringify(value));
        };

        const control = <T extends EventType>(
          type: T,
          payload: EventPayload<T>,
        ) => send(connectionId, ++connectionSequence, type, payload);

        const heartbeat = setInterval(() => {
          if (!alive) {
            socket.terminate();

            return;
          }

          alive = false;

          try {
            control("heartbeat.ping", {});
          } catch {
            socket.terminate();
          }
        }, 20000);

        socket.on("error", () => {
          active?.controller.abort(
            new DomainError("CONNECTION_LOST", "Connection lost."),
          );
        });

        socket.on("close", () => {
          clearInterval(heartbeat);

          server.log.info(
            {
              connectionId,
              requestId: active?.requestId,
              stage: "disconnected",
            },
            "WebSocket disconnected",
          );

          if (active) {
            active.controller.abort(
              new DomainError("CONNECTION_LOST", "Connection lost."),
            );

            if (active.ack) {
              clearTimeout(active.ack.timer);

              active.ack.reject(
                new DomainError("CONNECTION_LOST", "Connection lost."),
              );
            }

            if (workspaces.get(active.workspaceId) === active.requestId)
              workspaces.delete(active.workspaceId);
          }
        });

        // Handlers are attached synchronously; run execution is detached so ACK/cancel can be processed.
        socket.on("message", (raw, binary) => {
          if (++frameCount > 120 && Date.now() - frameWindow < 60000) {
            socket.close(1008, "Command rate limit exceeded.");

            return;
          }

          if (Date.now() - frameWindow >= 60000) {
            frameWindow = Date.now();
            frameCount = 1;
          }

          if (binary) {
            socket.close(1003, "Text commands are required.");

            return;
          }

          let command;

          try {
            command = clientCommandSchema.parse(JSON.parse(raw.toString()));
          } catch {
            socket.close(1008, "Invalid command.");

            return;
          }

          if (command.type === "heartbeat.pong") {
            alive = true;

            return;
          }

          if (command.type === "request.start") {
            if (seen.has(command.requestId)) return;

            if (seen.size >= 100) {
              socket.close(1008, "Connection request limit reached.");

              return;
            }

            const requestId = command.requestId;

            let sequence = 0;

            const startedAt = performance.now();

            const emit: Emit = (type, payload) => {
              logExecution(
                server.log,
                requestId,
                type,
                payload,
                performance.now() - startedAt,
              );

              send(requestId, ++sequence, type, payload);
            };

            const reject = (
              code: "STATE_CONFLICT" | "MODEL_UNAVAILABLE" | "RATE_LIMITED",
              message: string,
            ) =>
              emit("request.failed", {
                outcome: "failed",
                cartStatus: "unchanged",
                error: { code, message, retryable: code !== "STATE_CONFLICT" },
              });

            if (
              active ||
              workspaces.has(command.payload.snapshot.workspaceId)
            ) {
              reject(
                "STATE_CONFLICT",
                "A request is already running in this workspace.",
              );

              return;
            }

            if (!ready().ready) {
              reject("MODEL_UNAVAILABLE", ready().reason);

              return;
            }

            for (const [ip, state] of ipStarts)
              if (state.expires <= Date.now()) ipStarts.delete(ip);

            const rate = ipStarts.get(request.ip);

            if (
              (!rate && ipStarts.size >= 10000) ||
              workspaces.size >= config.MAX_CONCURRENT_RUNS
            ) {
              reject(
                "RATE_LIMITED",
                "The server is busy. Please try again shortly.",
              );

              return;
            }

            if (rate && rate.count >= 20) {
              reject(
                "RATE_LIMITED",
                "Too many requests. Please wait a minute.",
              );

              return;
            }

            if (rate) rate.count++;
            else
              ipStarts.set(request.ip, {
                count: 1,
                expires: Date.now() + 60000,
              });
            seen.add(requestId);

            const run = {
              requestId,
              workspaceId: command.payload.snapshot.workspaceId,
              controller: new AbortController(),
              ack: null as {
                proposal: Proposal;
                summary: string;
                resolve: (receipt: CommitReceipt) => void;
                reject: (error: Error) => void;
                timer: ReturnType<typeof setTimeout>;
              } | null,
            };

            active = run;
            workspaces.set(run.workspaceId, run.requestId);

            const deadline = setTimeout(
              () =>
                run.controller.abort(
                  new DomainError(
                    "MODEL_TIMEOUT",
                    "The request deadline was exceeded.",
                  ),
                ),
              config.REQUEST_DEADLINE_MS,
            );

            const commit = (proposal: Proposal) =>
              new Promise<CommitReceipt>((resolve, reject) => {
                const timer = setTimeout(() => {
                  reject(
                    new DomainError(
                      "COMMIT_TIMEOUT",
                      "Cart save confirmation was not received. Check your saved cart before trying again.",
                    ),
                  );
                }, config.ACK_TIMEOUT_MS);

                run.ack = {
                  proposal,
                  summary: commitSummary(
                    proposal.nextCart,
                    command.payload.snapshot.products,
                  ),
                  resolve,
                  reject,
                  timer,
                };

                try {
                  emit("cart.proposed", proposal);
                } catch (error) {
                  clearTimeout(timer);
                  run.ack = null;
                  reject(error);
                }
              });

            const provider =
              providerFactory?.() ??
              (config.LLM_PROVIDER === "fake"
                ? new FakeProvider()
                : new OpenAIProvider(config, (usage) =>
                    server.log.info(
                      {
                        requestId,
                        stage: "model",
                        model: config.OPENAI_MODEL,
                        promptVersion: "shopping-v1",
                        ...usage,
                      },
                      "Model usage",
                    ),
                  ));

            void runWorkflow(command.payload, provider, {
              requestId,
              emit,
              signal: run.controller.signal,
              maxToolCalls: config.MAX_TOOL_CALLS,
              commit,
            })
              .catch(() => {
                server.log.warn(
                  { requestId, code: "CONNECTION_LOST" },
                  "Unable to deliver workflow outcome",
                );
              })
              .finally(() => {
                clearTimeout(deadline);
                if (run.ack) clearTimeout(run.ack.timer);
                if (workspaces.get(run.workspaceId) === run.requestId)
                  workspaces.delete(run.workspaceId);
                if (active === run) active = null;
              });

            return;
          }

          if (!active || active.requestId !== command.requestId) return;

          if (command.type === "request.cancel") {
            active.controller.abort(
              new DomainError("CANCELLED", "Request cancelled."),
            );

            if (active.ack) {
              clearTimeout(active.ack.timer);

              active.ack.reject(
                new DomainError("CANCELLED", "Request cancelled."),
              );
            }

            return;
          }

          const ack = active.ack;

          if (!ack) return;
          if (command.payload.proposalId !== ack.proposal.proposalId) return;
          clearTimeout(ack.timer);
          active.ack = null;

          if (command.type === "cart.commit_rejected") {
            ack.reject(
              new DomainError(
                "COMMIT_REJECTED",
                command.payload.code === "STORAGE_WRITE_FAILED"
                  ? "Unable to save changes. Your cart was not changed."
                  : "The cart proposal was rejected.",
              ),
            );
          } else if (
            command.payload.fingerprint !== ack.proposal.fingerprint ||
            command.payload.committedRevision !== ack.proposal.baseRevision + 1
          ) {
            ack.reject(
              new DomainError(
                "STATE_CONFLICT",
                "Cart save confirmation did not match the proposal.",
              ),
            );
          } else {
            ack.resolve({
              requestId: active.requestId,
              proposalId: ack.proposal.proposalId,
              baseRevision: ack.proposal.baseRevision,
              committedRevision: command.payload.committedRevision,
              fingerprint: command.payload.fingerprint,
              summary: ack.summary,
            });
          }
        });

        control("connection.ready", {
          provider: config.LLM_PROVIDER,
          ready: ready().ready,
        });
      },
    );
  });

  server.addHook("onSend", (_request, reply, _payload, done) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "same-origin");

    done();
  });

  return server;
}
