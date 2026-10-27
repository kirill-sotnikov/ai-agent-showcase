import {
  LIMITS,
  persistedStateSchema,
  proposalSchema,
  snapshotSchema,
  terminalStages,
  type Cart,
  type CommitReceipt,
  type PersistedState,
  type Product,
  type Proposal,
  type ServerEvent,
  type Snapshot,
} from "@shop/contracts";
import {
  cartFingerprint,
  commitSummary,
  DEFAULT_IDENTITY,
  DomainError,
  seedProducts,
  setQuantity,
  verifyProposal,
} from "@shop/domain";

export const STORAGE_KEY = "ai-shopping-assistant:v1";
export interface LockProvider {
  run<T>(
    name: string,
    ifAvailable: boolean,
    task: () => Promise<T> | T,
  ): Promise<T>;
}

export function browserLocks(): LockProvider {
  return {
    run: (name, ifAvailable, task) => {
      if (!navigator.locks)
        return Promise.reject(
          new Error(
            "Editing requires Web Locks. Open this app in a supported browser on localhost or HTTPS.",
          ),
        );

      return navigator.locks.request(
        name,
        { mode: "exclusive", ifAvailable },
        (lock) => {
          if (!lock)
            throw new DomainError(
              "STATE_CONFLICT",
              "Another tab is editing this workspace.",
            );

          return task();
        },
      );
    },
  };
}

export function initialState(): PersistedState {
  return {
    schemaVersion: 1,
    workspaceId: crypto.randomUUID(),
    stateRevision: 0,
    settings: { agentIdentity: DEFAULT_IDENTITY, currency: "USD" },
    products: structuredClone(seedProducts),
    cart: { items: [] },
    messages: [],
    executionHistory: [],
    pendingClarification: null,
    activeRun: null,
    commitReceipts: [],
  };
}

export function isRunning(state: PersistedState) {
  return !!state.activeRun && !terminalStages.has(state.activeRun.stage);
}

export function snapshotOf(state: PersistedState): Snapshot {
  return snapshotSchema.parse({
    workspaceId: state.workspaceId,
    settings: state.settings,
    products: state.products,
    cart: state.cart,
    messages: state.messages
      .filter((message) => !message.incomplete)
      .slice(-40),
    pendingClarification:
      state.pendingClarification &&
      state.pendingClarification.baseRevision === state.stateRevision &&
      Date.parse(state.pendingClarification.expiresAt) > Date.now()
        ? state.pendingClarification
        : null,
  });
}

export class WorkspaceStore {
  constructor(
    readonly storage: Pick<Storage, "getItem" | "setItem">,
    readonly locks: LockProvider,
    readonly changed: (state: PersistedState) => void = () => {},
  ) {}

  read(): PersistedState | null {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);

      if (raw === null) return null;

      // v1 is the first public schema. Unknown versions are preserved for explicit recovery.
      return persistedStateSchema.parse(JSON.parse(raw));
    } catch {
      throw new Error(
        "Unable to load saved data. Your saved data has been preserved. Reset it explicitly to start again.",
      );
    }
  }

  private save(state: PersistedState) {
    const runIds = [
      ...new Set(state.executionHistory.map((event) => event.requestId)),
    ].slice(-LIMITS.runs);

    state.executionHistory = state.executionHistory
      .filter((event) => runIds.includes(event.requestId))
      .slice(-1200);

    state.messages = state.messages.slice(-LIMITS.messages);

    const activeReceipt = state.commitReceipts.find(
      (receipt) => receipt.requestId === state.activeRun?.requestId,
    );

    state.commitReceipts = state.commitReceipts
      .filter((receipt) => receipt !== activeReceipt)
      .slice(-99);

    if (activeReceipt) state.commitReceipts.push(activeReceipt);

    const checked = persistedStateSchema.parse(state);
    const raw = JSON.stringify(checked);

    if (new TextEncoder().encode(raw).length > LIMITS.stateBytes)
      throw new DomainError(
        "STORAGE_WRITE_FAILED",
        "Unable to save changes. Saved data is too large.",
      );

    try {
      this.storage.setItem(STORAGE_KEY, raw);
    } catch {
      throw new DomainError(
        "STORAGE_WRITE_FAILED",
        "Unable to save changes. Check your browser storage space and permissions.",
      );
    }

    this.changed(checked);

    return checked;
  }

  transaction<T>(
    update: (state: PersistedState) => Promise<T> | T,
  ): Promise<T> {
    return this.locks.run(`${STORAGE_KEY}:writer`, false, async () => {
      const state = this.read();

      if (!state)
        throw new DomainError(
          "STATE_CONFLICT",
          "Workspace no longer exists. Reload this page.",
        );

      const before = JSON.stringify(state);
      const result = await update(state);

      if (before !== JSON.stringify(state)) this.save(state);
      else this.changed(state);

      return result;
    });
  }

  async initialize() {
    await this.locks.run(`${STORAGE_KEY}:writer`, false, () => {
      const state = this.read();

      if (state) this.changed(state);
      else this.save(initialState());
    });

    // A live run in another tab owns this lock. Never interrupt it during reload.
    try {
      await this.locks.run(`${STORAGE_KEY}:run`, true, () =>
        this.transaction((state) => {
          if (!isRunning(state)) return;
          this.interruptState(state);
        }),
      );
    } catch (error) {
      if (!(error instanceof DomainError && error.code === "STATE_CONFLICT"))
        throw error;
    }

    return this.read()!;
  }

  async reset() {
    return this.locks.run(`${STORAGE_KEY}:run`, true, () =>
      this.locks.run(`${STORAGE_KEY}:writer`, false, () =>
        this.save(initialState()),
      ),
    );
  }

  edit(update: (state: PersistedState) => void) {
    return this.locks.run(`${STORAGE_KEY}:run`, true, () =>
      this.transaction((state) => {
        if (isRunning(state))
          throw new DomainError(
            "STATE_CONFLICT",
            "Wait for the current request to finish.",
          );
        update(state);
        state.stateRevision++;
        state.pendingClarification = null;
      }),
    );
  }

  setQuantity(productId: string, value: number) {
    return this.edit((state) => {
      state.cart = setQuantity(state.cart, state.products, productId, value);
    });
  }

  saveProduct(product: Product) {
    return this.edit((state) => {
      const index = state.products.findIndex(
        (current) => current.id === product.id,
      );

      if (index < 0) state.products.push(product);
      else state.products[index] = product;
    });
  }

  deleteProduct(productId: string) {
    return this.edit((state) => {
      state.products = state.products.filter(
        (product) => product.id !== productId,
      );

      state.cart.items = state.cart.items.filter(
        (item) => item.productId !== productId,
      );
    });
  }

  begin(requestId: string, message: string) {
    return this.transaction((state) => {
      if (isRunning(state))
        throw new DomainError(
          "STATE_CONFLICT",
          "A request is already running.",
        );

      const snapshot = snapshotOf(state);

      state.activeRun = {
        requestId,
        baseRevision: state.stateRevision,
        startedAt: new Date().toISOString(),
        stage: "accepted",
        cartStatus: "unchanged",
      };

      state.messages.push({
        id: crypto.randomUUID(),
        requestId,
        role: "user",
        content: message,
        timestamp: new Date().toISOString(),
        incomplete: false,
      });

      return { message, baseRevision: state.stateRevision, snapshot };
    });
  }

  async commit(
    requestId: string,
    untrusted: Proposal,
    isCurrent: () => boolean = () => true,
  ): Promise<CommitReceipt> {
    const proposal = proposalSchema.parse(untrusted);

    return this.transaction(async (state) => {
      const existing = state.commitReceipts.find(
        (receipt) => receipt.requestId === requestId,
      );

      if (existing) {
        if (
          existing.proposalId !== proposal.proposalId ||
          existing.fingerprint !== proposal.fingerprint ||
          existing.baseRevision !== proposal.baseRevision
        )
          throw new DomainError(
            "STATE_CONFLICT",
            "This request already committed a different proposal.",
          );

        return existing;
      }

      if (
        state.activeRun?.requestId !== requestId ||
        !isRunning(state) ||
        state.activeRun.stage === "cancelled" ||
        state.stateRevision !== proposal.baseRevision ||
        state.activeRun.baseRevision !== proposal.baseRevision
      )
        throw new DomainError(
          "STATE_CONFLICT",
          "The workspace changed before the cart could be saved.",
        );
      verifyProposal(proposal, snapshotOf(state));
      if ((await cartFingerprint(proposal.nextCart)) !== proposal.fingerprint)
        throw new DomainError(
          "INVALID_REQUEST",
          "The proposed cart fingerprint is invalid.",
        );
      if (!isCurrent())
        throw new DomainError("CANCELLED", "The request is no longer active.");

      const receipt: CommitReceipt = {
        requestId,
        proposalId: proposal.proposalId,
        baseRevision: state.stateRevision,
        committedRevision: state.stateRevision + 1,
        fingerprint: proposal.fingerprint,
        summary: commitSummary(proposal.nextCart, state.products),
      };

      state.cart = proposal.nextCart;
      state.stateRevision++;
      state.pendingClarification = null;
      state.activeRun.cartStatus = "committed";
      state.commitReceipts.push(receipt);

      return receipt;
    });
  }

  record(event: ServerEvent) {
    return this.transaction((state) => {
      if (state.activeRun?.requestId !== event.requestId || !isRunning(state))
        return;
      if (
        state.executionHistory.some(
          (current) => current.eventId === event.eventId,
        )
      )
        return;
      state.executionHistory.push(event);
      if (event.type === "step.started")
        state.activeRun.stage = event.payload.stage;
      if (event.type === "clarification.required")
        state.pendingClarification = event.payload;

      if (event.type === "assistant.message") {
        state.messages = state.messages.filter(
          (message) => message.id !== event.payload.messageId,
        );

        state.messages.push({
          id: event.payload.messageId,
          requestId: event.requestId,
          role: "assistant",
          content: event.payload.content,
          timestamp: event.timestamp,
          incomplete: false,
        });
      }

      if (
        event.type === "request.completed" ||
        event.type === "request.failed" ||
        event.type === "request.cancelled"
      ) {
        state.activeRun.stage = event.payload.outcome;

        state.activeRun.cartStatus = state.commitReceipts.some(
          (receipt) => receipt.requestId === event.requestId,
        )
          ? "committed"
          : "unchanged";

        if (
          event.type !== "request.completed" ||
          event.payload.outcome !== "clarification"
        )
          state.pendingClarification = null;
        this.ensureReceiptMessage(state, event.requestId);
      }
    });
  }

  private ensureReceiptMessage(state: PersistedState, requestId: string) {
    const receipt = state.commitReceipts.find(
      (receipt) => receipt.requestId === requestId,
    );

    if (
      receipt &&
      !state.messages.some(
        (message) =>
          message.requestId === requestId &&
          message.role === "assistant" &&
          !message.incomplete,
      )
    )
      state.messages.push({
        id: crypto.randomUUID(),
        requestId,
        role: "assistant",
        content: `${receipt.summary} Response interrupted.`,
        timestamp: new Date().toISOString(),
        incomplete: false,
      });
  }

  private interruptState(state: PersistedState) {
    if (!state.activeRun) return;
    state.activeRun.stage = "interrupted";
    state.pendingClarification = null;

    state.activeRun.cartStatus = state.commitReceipts.some(
      (receipt) => receipt.requestId === state.activeRun!.requestId,
    )
      ? "committed"
      : "unchanged";

    this.ensureReceiptMessage(state, state.activeRun.requestId);
  }

  interrupt(requestId: string, cancelled = false) {
    return this.transaction((state) => {
      if (state.activeRun?.requestId !== requestId || !isRunning(state)) return;
      this.interruptState(state);
      if (cancelled) state.activeRun.stage = "cancelled";
    });
  }
}

export function cartWithProductRemoved(cart: Cart, productId: string): Cart {
  return { items: cart.items.filter((item) => item.productId !== productId) };
}
