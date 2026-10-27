import { createStore } from "zustand/vanilla";
import {
  LIMITS,
  serverEventSchema,
  terminalStages,
  type ClientCommand,
  type PersistedState,
  type Proposal,
  type ServerEvent,
} from "@shop/shared/contracts";
import { DomainError } from "@shop/shared/domain";
import {
  browserLocks,
  isRunning,
  STORAGE_KEY,
  WorkspaceStore,
} from "../storage/store";

export interface ViewState {
  workspace: PersistedState | null;
  connection: "Connecting" | "Connected" | "Disconnected";
  ready: boolean;
  provider: string;
  error: string | null;
  loadError: boolean;
  pending: Proposal | null;
  partial: string;
}
export class WorkspaceClient {
  readonly state = createStore<ViewState>(() => ({
    workspace: null,
    connection: "Connecting",
    ready: false,
    provider: "",
    error: null,
    loadError: false,
    pending: null,
    partial: "",
  }));

  private lifecycle = 0;

  readonly store = new WorkspaceStore(
    {
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
    },
    browserLocks(),
    (workspace) => this.update({ workspace }),
  );

  private socket: WebSocket | null = null;

  private generation = 0;

  private stopped = false;

  private attempt = 0;

  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  private chain: Promise<void> = Promise.resolve();

  private current: {
    requestId: string;
    release: () => void;
    eventIds: Set<string>;
    sequence: number;
    chunk: number;
  } | null = null;

  private get view() {
    return this.state.getState();
  }

  private update(patch: Partial<ViewState>) {
    this.state.setState(patch);
  }

  report(error: unknown) {
    this.update({
      error:
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
    });
  }

  clearError = () => this.update({ error: null });

  private onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      try {
        this.update({ workspace: this.store.read(), error: null });
      } catch (error) {
        this.report(error);
        this.update({ loadError: true });
      }
    }
  };

  async initialize() {
    const lifecycle = ++this.lifecycle;

    this.stopped = false;
    window.addEventListener("storage", this.onStorage);

    try {
      await this.store.initialize();
      if (lifecycle === this.lifecycle && !this.stopped) this.connect();
    } catch (error) {
      this.report(error);
      this.update({ loadError: true, connection: "Disconnected" });
    }
  }

  async reset() {
    try {
      await this.store.reset();
      this.update({ loadError: false, error: null });
      this.connect();
    } catch (error) {
      this.report(error);
    }
  }

  dispose() {
    ++this.lifecycle;
    this.stopped = true;
    ++this.generation;
    clearTimeout(this.reconnectTimer);
    this.socket?.close();
    window.removeEventListener("storage", this.onStorage);

    const current = this.current;

    if (current)
      void this.store
        .interrupt(current.requestId)
        .catch(() => {})
        .finally(() => this.finish());
  }

  private connect() {
    if (this.stopped) return;

    const generation = ++this.generation;

    clearTimeout(this.reconnectTimer);
    this.socket?.close();

    this.update({ connection: "Connecting", ready: false });

    const socket = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
    );

    this.socket = socket;

    socket.onopen = () => {
      if (generation === this.generation) {
        this.attempt = 0;
        this.update({ connection: "Connected" });
      }
    };

    socket.onmessage = (raw) => {
      if (generation !== this.generation) return;

      let event: ServerEvent;

      try {
        if (
          typeof raw.data !== "string" ||
          new TextEncoder().encode(raw.data).length > LIMITS.frameBytes
        )
          throw new Error("Invalid server event.");
        event = serverEventSchema.parse(JSON.parse(raw.data));
      } catch {
        this.report(
          new Error("Invalid server event. The request was interrupted."),
        );

        socket.close(1008);

        return;
      }

      if (event.type === "heartbeat.ping") {
        this.send({
          protocolVersion: 1,
          requestId: event.requestId,
          type: "heartbeat.pong",
          payload: {},
        });

        return;
      }

      if (event.type === "connection.ready") {
        this.update({
          ready: event.payload.ready,
          provider: event.payload.provider,
        });

        if (!event.payload.ready)
          void fetch("/ready")
            .then((response) => response.json())
            .then((result) => this.report(new Error(result.reason)))
            .catch(() => {});

        return;
      }

      this.chain = this.chain
        .then(async () => {
          if (
            generation !== this.generation ||
            socket.readyState !== WebSocket.OPEN
          )
            return;

          const run = this.current;

          if (
            !run ||
            run.requestId !== event.requestId ||
            run.eventIds.has(event.eventId)
          )
            return;
          if (event.sequence !== run.sequence + 1)
            throw new Error(
              "Execution events arrived out of sequence. The request was interrupted.",
            );
          run.eventIds.add(event.eventId);
          run.sequence = event.sequence;

          if (event.type === "cart.proposed") {
            this.update({ pending: event.payload });

            try {
              const receipt = await this.store.commit(
                event.requestId,
                event.payload,
                () =>
                  generation === this.generation &&
                  socket.readyState === WebSocket.OPEN &&
                  this.current === run,
              );

              this.send({
                protocolVersion: 1,
                requestId: event.requestId,
                type: "cart.commit_ack",
                payload: {
                  proposalId: receipt.proposalId,
                  committedRevision: receipt.committedRevision,
                  fingerprint: receipt.fingerprint,
                },
              });
            } catch (error) {
              this.report(error);

              const code =
                error instanceof DomainError &&
                [
                  "STATE_CONFLICT",
                  "STORAGE_WRITE_FAILED",
                  "CANCELLED",
                ].includes(error.code)
                  ? (error.code as
                      "STATE_CONFLICT" | "STORAGE_WRITE_FAILED" | "CANCELLED")
                  : "INVALID_REQUEST";

              this.send({
                protocolVersion: 1,
                requestId: event.requestId,
                type: "cart.commit_rejected",
                payload: { proposalId: event.payload.proposalId, code },
              });
            } finally {
              this.update({ pending: null });
            }
          }

          if (event.type === "assistant.delta") {
            if (event.payload.chunk !== run.chunk++)
              throw new Error("Response chunks arrived out of sequence.");

            this.update({
              partial: (this.view.partial + event.payload.content).slice(
                0,
                4000,
              ),
            });

            return;
          }

          await this.store.record(event);
          if (event.type === "assistant.message") this.update({ partial: "" });
          if (event.type === "request.failed")
            this.report(
              new Error(event.payload.error?.message ?? "The request failed."),
            );
          if (
            event.type === "request.completed" ||
            event.type === "request.failed" ||
            event.type === "request.cancelled"
          )
            this.finish();
        })
        .catch(async (error) => {
          this.report(error);

          const current = this.current;

          if (current) {
            try {
              await this.store.interrupt(current.requestId);
            } catch {
              /* Original storage error remains visible. */
            }
          }

          this.finish();
          socket.close(1008);
        });
    };

    socket.onclose = () => {
      if (generation !== this.generation || this.stopped) return;
      this.update({ connection: "Disconnected", ready: false, pending: null });

      this.chain = this.chain.then(async () => {
        const current = this.current;

        if (current) {
          try {
            await this.store.interrupt(current.requestId);
          } catch (error) {
            this.report(error);
          }

          this.finish();
        }
      });

      const delay =
        Math.min(30000, 500 * 2 ** Math.min(this.attempt++, 6)) *
        (0.75 + Math.random() * 0.5);

      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };

    socket.onerror = () => {};
  }

  private send(command: ClientCommand) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN)
      throw new Error("Connection lost. Your request will not be replayed.");

    const raw = JSON.stringify(command);

    if (
      new TextEncoder().encode(raw).length > LIMITS.frameBytes ||
      this.socket.bufferedAmount > 262144
    )
      throw new Error("The request exceeds the connection limit.");
    this.socket.send(raw);
  }

  async start(message: string) {
    if (
      !message.trim() ||
      message.length > 4000 ||
      this.current ||
      !this.view.ready ||
      this.view.connection !== "Connected"
    )
      return false;

    let accepted = false;

    const startup = new Promise<boolean>((resolve) => {
      void this.store.locks
        .run(`${STORAGE_KEY}:run`, true, async () => {
          if (
            this.stopped ||
            this.current ||
            this.view.connection !== "Connected"
          )
            throw new Error("The connection is not ready.");

          const requestId = crypto.randomUUID();
          const payload = await this.store.begin(requestId, message.trim());

          const finished = new Promise<void>((release) => {
            this.current = {
              requestId,
              release,
              sequence: 0,
              eventIds: new Set(),
              chunk: 0,
            };
          });

          this.update({ error: null, partial: "" });

          try {
            this.send({
              protocolVersion: 1,
              requestId,
              type: "request.start",
              payload,
            });

            accepted = true;
            resolve(true);
            await finished;
          } catch (error) {
            await this.store.interrupt(requestId);
            this.finish();

            throw error;
          }
        })
        .catch((error) => {
          this.report(error);
          if (!accepted) resolve(false);
        });
    });

    return startup;
  }

  stop() {
    this.chain = this.chain
      .then(async () => {
        const run = this.current;

        if (!run) return;
        await this.store.interrupt(run.requestId, true);

        try {
          this.send({
            protocolVersion: 1,
            requestId: run.requestId,
            type: "request.cancel",
            payload: {},
          });
        } finally {
          this.finish();
        }
      })
      .catch((error) => {
        this.report(error);
        this.socket?.close();
        this.finish();
      });
  }

  private finish() {
    const current = this.current;

    this.current = null;
    this.update({ pending: null });
    current?.release();
  }

  get busy() {
    return (
      this.current !== null ||
      (this.view.workspace
        ? isRunning(this.view.workspace) &&
          !terminalStages.has(this.view.workspace.activeRun!.stage)
        : false)
    );
  }
}
