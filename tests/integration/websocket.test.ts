import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { AddressInfo } from "node:net";
import {
  serverEventSchema,
  type ClientCommand,
  type ServerEvent,
} from "@shop/contracts";
import { createServer } from "../../apps/server/src/server.js";
import { readConfig } from "../../apps/server/src/config/index.js";
import {
  initialState,
  snapshotOf,
  WorkspaceStore,
} from "../../apps/web/src/storage/store.js";
import { FakeProvider } from "../../apps/server/src/ai/llm/fake.js";
import type { Provider } from "../../apps/server/src/ai/llm/types.js";
import { MemoryStorage, TestLocks } from "../helpers.js";

const servers: ReturnType<typeof createServer>[] = [];
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function harness(provider?: () => Provider, ackTimeout = 1000) {
  const config = readConfig({
    NODE_ENV: "test",
    LLM_PROVIDER: "fake",
    PORT: "0",
    ALLOWED_ORIGINS: "http://test.local",
    ACK_TIMEOUT_MS: String(ackTimeout),
  });

  const server = createServer(config, provider);

  servers.push(server);
  await server.listen({ host: "127.0.0.1", port: 0 });

  const address = server.server.address() as AddressInfo;
  const url = `ws://127.0.0.1:${address.port}/ws`;

  async function connect(origin = "http://test.local") {
    const socket = new WebSocket(url, { origin });

    sockets.push(socket);

    const events: ServerEvent[] = [];
    const listeners = new Set<() => void>();

    socket.on("message", (raw) => {
      events.push(serverEventSchema.parse(JSON.parse(raw.toString())));
      for (const listener of listeners) listener();
    });

    const wait = <T extends ServerEvent["type"]>(
      type: T,
      requestId?: string,
    ): Promise<Extract<ServerEvent, { type: T }>> =>
      new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          listeners.delete(check);

          reject(
            new Error(
              `Missing ${type}: ${JSON.stringify(events.map((event) => event.type))}`,
            ),
          );
        }, 3000);

        function check() {
          const event = events.find(
            (event) =>
              event.type === type &&
              (!requestId || event.requestId === requestId),
          );

          if (event) {
            clearTimeout(timeout);
            listeners.delete(check);
            resolve(event as Extract<ServerEvent, { type: T }>);
          }
        }

        listeners.add(check);
        check();
      });

    await wait("connection.ready");

    return {
      socket,
      events,
      wait,
      send: (command: ClientCommand) => socket.send(JSON.stringify(command)),
    };
  }

  return { connect, server, url };
}

function start(
  message = "Find a lamp under $50 and add the cheapest one.",
  snapshot = snapshotOf(initialState()),
): Extract<ClientCommand, { type: "request.start" }> {
  return {
    protocolVersion: 1,
    requestId: crypto.randomUUID(),
    type: "request.start",
    payload: { message, baseRevision: 0, snapshot },
  };
}

describe("real WebSocket protocol", () => {
  it("requires persistence ACK before sending a successful response", async () => {
    const { connect } = await harness();
    const peer = await connect();
    const command = start();

    peer.send(command);

    const proposed = await peer.wait("cart.proposed");

    expect(
      peer.events.some((event) => event.type === "assistant.message"),
    ).toBe(false);

    peer.send({
      protocolVersion: 1,
      requestId: command.requestId,
      type: "cart.commit_ack",
      payload: {
        proposalId: proposed.payload.proposalId,
        committedRevision: 1,
        fingerprint: proposed.payload.fingerprint,
      },
    });

    expect((await peer.wait("request.completed")).payload.cartStatus).toBe(
      "committed",
    );

    expect((await peer.wait("assistant.message")).payload.content).toContain(
      "Cart saved. 1 item, total $39.00.",
    );

    const runEvents = peer.events.filter(
      (event) => event.requestId === command.requestId,
    );

    expect(runEvents.map((event) => event.sequence)).toEqual(
      runEvents.map((_, index) => index + 1),
    );
  });

  it("rejects a failed localStorage save without any success claim", async () => {
    const { connect } = await harness();
    const peer = await connect();
    const command = start();

    peer.send(command);

    const proposed = await peer.wait("cart.proposed");

    peer.send({
      protocolVersion: 1,
      requestId: command.requestId,
      type: "cart.commit_rejected",
      payload: {
        proposalId: proposed.payload.proposalId,
        code: "STORAGE_WRITE_FAILED",
      },
    });

    expect((await peer.wait("request.failed")).payload.cartStatus).toBe(
      "unchanged",
    );

    expect(
      peer.events.some((event) => event.type === "assistant.message"),
    ).toBe(false);
  });

  it("retains the browser receipt when ACK is lost", async () => {
    const storage = new MemoryStorage();
    const store = new WorkspaceStore(storage, new TestLocks());

    await store.initialize();

    const { connect } = await harness(undefined, 50);
    const peer = await connect();
    const requestId = crypto.randomUUID();
    const payload = await store.begin(requestId, "Add the Arc Desk Lamp");

    peer.send({
      protocolVersion: 1,
      requestId,
      type: "request.start",
      payload,
    });

    const proposed = await peer.wait("cart.proposed");

    await store.commit(requestId, proposed.payload);

    expect((await peer.wait("request.failed")).payload.error?.code).toBe(
      "COMMIT_TIMEOUT",
    );

    await store.initialize();
    expect(store.read()!.activeRun?.cartStatus).toBe("committed");
    expect(store.read()!.cart.items[0].quantity).toBe(1);
  });

  it("deduplicates starts and never repeats a completed request", async () => {
    const { connect } = await harness();
    const peer = await connect();
    const command = start("Find lamps");

    peer.send(command);
    peer.send(command);
    await peer.wait("request.completed");
    peer.send(command);

    expect(
      peer.events.filter((event) => event.type === "request.accepted"),
    ).toHaveLength(1);
  });

  it("isolates snapshots and events between two clients", async () => {
    const { connect } = await harness();
    const first = await connect();
    const second = await connect();
    const firstCommand = start("Find lamps");

    const secondCommand = start("Find headphones", {
      ...snapshotOf(initialState()),
      products: [],
    });

    first.send(firstCommand);
    second.send(secondCommand);

    await Promise.all([
      first.wait("request.completed"),
      second.wait("request.completed"),
    ]);

    expect(
      first.events.some((event) => event.requestId === secondCommand.requestId),
    ).toBe(false);

    expect(
      second.events.some((event) => event.requestId === firstCommand.requestId),
    ).toBe(false);

    expect((await second.wait("assistant.message")).payload.content).toContain(
      "No matching products",
    );
  });

  it("cancels a stalled workflow without waiting for the provider", async () => {
    class HangingProvider extends FakeProvider {
      override async execute(): Promise<never> {
        return new Promise(() => {});
      }
    }

    const { connect } = await harness(() => new HangingProvider());
    const peer = await connect();
    const command = start();

    peer.send(command);
    await peer.wait("request.accepted");

    peer.send({
      protocolVersion: 1,
      requestId: command.requestId,
      type: "request.cancel",
      payload: {},
    });

    expect((await peer.wait("request.cancelled")).payload.cartStatus).toBe(
      "unchanged",
    );
  });

  it("rejects an ACK with the wrong fingerprint", async () => {
    const { connect } = await harness();
    const peer = await connect();
    const command = start();

    peer.send(command);

    const proposed = await peer.wait("cart.proposed");

    peer.send({
      protocolVersion: 1,
      requestId: command.requestId,
      type: "cart.commit_ack",
      payload: {
        proposalId: proposed.payload.proposalId,
        committedRevision: 1,
        fingerprint: "0".repeat(64),
      },
    });

    expect((await peer.wait("request.failed")).payload.error?.code).toBe(
      "STATE_CONFLICT",
    );
  });

  it("rejects invalid frames and disallowed origins", async () => {
    const { connect, url } = await harness();
    const peer = await connect();

    const closed = new Promise<number>((resolve) =>
      peer.socket.on("close", resolve),
    );

    peer.socket.send('{"type":"unknown"}');
    expect(await closed).toBe(1008);

    const denied = new WebSocket(url, { origin: "http://evil.local" });

    sockets.push(denied);

    expect(
      await new Promise<number>((resolve) => {
        denied.on("unexpected-response", (_request, response) => {
          resolve(response.statusCode!);
          response.resume();
          denied.terminate();
        });

        denied.on("error", () => {});
      }),
    ).toBe(403);
  });

  it("serves health and readiness without paid calls", async () => {
    const { server } = await harness();

    expect((await server.inject("/health")).statusCode).toBe(200);

    expect((await server.inject("/ready")).json()).toMatchObject({
      ready: true,
    });

    expect((await server.inject("/metrics")).statusCode).toBe(404);
  });
});
