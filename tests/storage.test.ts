import { beforeEach, describe, expect, it } from "vitest";
import type { Proposal } from "@shop/shared/contracts";
import { cartFingerprint } from "@shop/shared/domain";
import { DraftCartService } from "../packages/service/src/domain/draft-cart.js";
import { seedProducts } from "@shop/shared/defaults";
import {
  snapshotOf,
  STORAGE_KEY,
  WorkspaceStore,
} from "../packages/web/src/storage/store.js";
import { MemoryStorage, TestLocks } from "./helpers.js";

let storage: MemoryStorage;
let locks: TestLocks;
let store: WorkspaceStore;

beforeEach(async () => {
  storage = new MemoryStorage();
  locks = new TestLocks();
  store = new WorkspaceStore(storage, locks);
  await store.initialize();
});

async function prepare(): Promise<{ requestId: string; proposal: Proposal }> {
  const requestId = crypto.randomUUID();
  const start = await store.begin(requestId, "Add a lamp");
  const draft = new DraftCartService(start.snapshot);

  draft.change("add_to_cart", seedProducts[0].id, 1);

  return {
    requestId,
    proposal: {
      proposalId: crypto.randomUUID(),
      baseRevision: start.baseRevision,
      nextCart: draft.cart,
      operations: draft.operations,
      totalMinor: 3900,
      fingerprint: await cartFingerprint(draft.cart),
    },
  };
}

describe("atomic persistence and recovery", () => {
  it("persists cart, revision and receipt in a single write, then deduplicates", async () => {
    const { requestId, proposal } = await prepare();
    const writes = storage.writes;
    const receipt = await store.commit(requestId, proposal);

    expect(storage.writes).toBe(writes + 1);
    expect(store.read()!.cart.items[0].quantity).toBe(1);
    expect(store.read()!.stateRevision).toBe(1);
    storage.fail = true;
    expect(await store.commit(requestId, proposal)).toEqual(receipt);
    storage.fail = false;
    expect(storage.writes).toBe(writes + 1);
    expect(store.read()!.cart.items[0].quantity).toBe(1);

    await expect(
      store.commit(requestId, { ...proposal, proposalId: crypto.randomUUID() }),
    ).rejects.toThrow("different proposal");
  });

  it("leaves the entire state unchanged on quota failure", async () => {
    const { requestId, proposal } = await prepare();
    const before = storage.getItem(STORAGE_KEY);

    storage.fail = true;

    await expect(store.commit(requestId, proposal)).rejects.toThrow(
      "Unable to save changes",
    );

    expect(storage.getItem(STORAGE_KEY)).toBe(before);
  });

  it("rejects stale revisions, invalid fingerprints and late proposals", async () => {
    const { requestId, proposal } = await prepare();

    await expect(
      store.commit(requestId, { ...proposal, baseRevision: 2 }),
    ).rejects.toThrow("workspace changed");

    await expect(
      store.commit(requestId, { ...proposal, fingerprint: "0".repeat(64) }),
    ).rejects.toThrow("fingerprint");

    await store.interrupt(requestId, true);

    await expect(store.commit(requestId, proposal)).rejects.toThrow(
      "workspace changed",
    );

    expect(store.read()!.cart.items).toEqual([]);
  });

  it("preserves committed cart after reload without ACK and adds a receipt summary", async () => {
    const { requestId, proposal } = await prepare();

    await store.commit(requestId, proposal);

    const reloaded = new WorkspaceStore(storage, locks);

    await reloaded.initialize();
    expect(reloaded.read()!.activeRun?.stage).toBe("interrupted");
    expect(reloaded.read()!.activeRun?.cartStatus).toBe("committed");

    expect(reloaded.read()!.messages.at(-1)?.content).toContain(
      "Cart saved. 1 item, total $39.00. Response interrupted.",
    );

    expect(reloaded.read()!.cart).toEqual(proposal.nextCart);
  });

  it("interrupts an uncommitted reload without changing the cart", async () => {
    await prepare();
    await new WorkspaceStore(storage, locks).initialize();
    expect(store.read()!.activeRun?.stage).toBe("interrupted");
    expect(store.read()!.activeRun?.cartStatus).toBe("unchanged");
  });

  it("keeps an empty catalog empty and removes catalog/cart atomically", async () => {
    await store.setQuantity(seedProducts[0].id, 1);

    const writes = storage.writes;

    await store.deleteProduct(seedProducts[0].id);
    expect(storage.writes).toBe(writes + 1);
    expect(store.read()!.cart.items).toEqual([]);
    for (const product of seedProducts.slice(1))
      await store.deleteProduct(product.id);
    await new WorkspaceStore(storage, locks).initialize();
    expect(store.read()!.products).toEqual([]);
  });

  it("does not overwrite corrupt or future-version data", async () => {
    for (const value of ["{broken", '{"schemaVersion":99}']) {
      storage.setItem(STORAGE_KEY, value);

      await expect(store.initialize()).rejects.toThrow(
        "Unable to load saved data",
      );

      expect(storage.getItem(STORAGE_KEY)).toBe(value);
    }
  });

  it("serializes writes and blocks editing/recovery in a competing tab", async () => {
    let release!: () => void;
    let started!: () => void;

    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });

    const held = locks.run(`${STORAGE_KEY}:run`, true, async () => {
      await store.begin(crypto.randomUUID(), "Find a lamp");
      started();

      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });

    await entered;

    const other = new WorkspaceStore(storage, locks);

    await other.initialize();
    expect(other.read()!.activeRun?.stage).toBe("accepted");

    await expect(other.setQuantity(seedProducts[0].id, 1)).rejects.toThrow(
      "Another tab",
    );

    release();
    await held;
    await other.initialize();
    expect(other.read()!.activeRun?.stage).toBe("interrupted");
  });

  it("history writes do not change domain revision and active receipt survives compaction", async () => {
    const { requestId, proposal } = await prepare();

    await store.commit(requestId, proposal);

    await store.transaction((state) => {
      state.messages = [];

      state.commitReceipts.push(
        ...Array.from({ length: 99 }, () => ({
          ...state.commitReceipts[0],
          requestId: crypto.randomUUID(),
          proposalId: crypto.randomUUID(),
        })),
      );
    });

    expect(store.read()!.stateRevision).toBe(1);

    expect(
      store
        .read()!
        .commitReceipts.some((receipt) => receipt.requestId === requestId),
    ).toBe(true);

    expect(snapshotOf(store.read()!).messages).toHaveLength(0);
  });
});
