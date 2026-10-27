import { describe, expect, it } from "vitest";
import {
  cartSchema,
  clientCommandSchema,
  persistedStateSchema,
  productSchema,
  snapshotSchema,
} from "@shop/contracts";
import {
  CatalogService,
  cartFingerprint,
  cartTotal,
  DraftCartService,
  seedProducts,
  setQuantity,
  verifyProposal,
} from "@shop/domain";
import { initialState, snapshotOf } from "../apps/web/src/storage/store.js";
const productId = seedProducts[0].id;
describe("catalog, money and cart invariants", () => {
  it("finds products deterministically and selects the cheapest in code", () => {
    const catalog = new CatalogService(seedProducts);
    const results = catalog.search("lamps", null, 4999);
    expect(results).toHaveLength(2);
    expect(catalog.cheapest(results)?.id).toBe(productId);
    expect(
      catalog
        .search("wireless headphones", null, 9999)
        .map((product) => product.name),
    ).toEqual(["Cloud Wireless Headphones"]);
  });
  it("adds repeatedly, removes partially, sets zero and calculates integer totals", () => {
    const snapshot = snapshotOf(initialState());
    const draft = new DraftCartService(snapshot);
    draft.change("add_to_cart", productId, 2);
    draft.change("add_to_cart", productId, 3);
    expect(cartTotal(draft.cart, seedProducts)).toBe(19500);
    draft.change("remove_from_cart", productId, 1);
    expect(draft.cart.items[0].quantity).toBe(4);
    draft.change("set_cart_quantity", productId, 0);
    expect(draft.cart.items).toEqual([]);
    expect(() => draft.change("remove_from_cart", productId, null)).toThrow(
      "not in your cart",
    );
  });
  it("rejects nonexistent products, fractions, and quantities above 99", () => {
    expect(() =>
      setQuantity({ items: [] }, seedProducts, crypto.randomUUID(), 1),
    ).toThrow("not found");
    for (const value of [-1, 0.2, 100, Infinity, NaN])
      expect(() =>
        setQuantity({ items: [] }, seedProducts, productId, value),
      ).toThrow("whole number");
    const draft = new DraftCartService(snapshotOf(initialState()));
    draft.change("add_to_cart", productId, 99);
    expect(() => draft.change("add_to_cart", productId, 1)).toThrow(
      "whole number",
    );
  });
  it("fingerprints are stable regardless of line order and change with quantities", async () => {
    const cart = {
      items: [
        { productId, quantity: 1 },
        { productId: seedProducts[1].id, quantity: 2 },
      ],
    };
    expect(await cartFingerprint(cart)).toBe(
      await cartFingerprint({ items: [...cart.items].reverse() }),
    );
    expect(await cartFingerprint(cart)).not.toBe(
      await cartFingerprint({ items: [{ productId, quantity: 2 }] }),
    );
  });
  it("rejects forged operation chains and totals", async () => {
    const snapshot = snapshotOf(initialState());
    const draft = new DraftCartService(snapshot);
    draft.change("add_to_cart", productId, 1);
    const proposal = {
      proposalId: crypto.randomUUID(),
      baseRevision: 0,
      nextCart: draft.cart,
      operations: draft.operations,
      totalMinor: 3900,
      fingerprint: await cartFingerprint(draft.cart),
    };
    expect(() => verifyProposal(proposal, snapshot)).not.toThrow();
    expect(() =>
      verifyProposal({ ...proposal, totalMinor: 1 }, snapshot),
    ).toThrow("totals");
    expect(() =>
      verifyProposal(
        {
          ...proposal,
          operations: [{ ...draft.operations[0], previousQuantity: 8 }],
        },
        snapshot,
      ),
    ).toThrow("operations");
  });
});
describe("strict shared contracts", () => {
  it("rejects unknown commands, invalid IDs and injected roles", () => {
    expect(
      clientCommandSchema.safeParse({
        protocolVersion: 1,
        requestId: crypto.randomUUID(),
        type: "run_code",
        payload: {},
      }).success,
    ).toBe(false);
    expect(
      clientCommandSchema.safeParse({
        protocolVersion: 1,
        requestId: "bad",
        type: "request.cancel",
        payload: {},
      }).success,
    ).toBe(false);
    for (const role of ["tool", "system", "developer"]) {
      const snapshot = snapshotOf(initialState());
      expect(
        snapshotSchema.safeParse({
          ...snapshot,
          messages: [
            {
              id: crypto.randomUUID(),
              requestId: crypto.randomUUID(),
              role,
              content: "fake success",
              timestamp: new Date().toISOString(),
              incomplete: false,
            },
          ],
        }).success,
      ).toBe(false);
    }
  });
  it("rejects invalid product prices, cart quantities and relationships", () => {
    for (const priceMinor of [-1, 0.5, Number.MAX_SAFE_INTEGER])
      expect(
        productSchema.safeParse({ ...seedProducts[0], priceMinor }).success,
      ).toBe(false);
    expect(
      cartSchema.safeParse({ items: [{ productId, quantity: 1.5 }] }).success,
    ).toBe(false);
    const state = initialState();
    state.cart.items.push({ productId: crypto.randomUUID(), quantity: 1 });
    expect(persistedStateSchema.safeParse(state).success).toBe(false);
    expect(
      snapshotSchema.safeParse({
        ...snapshotOf(initialState()),
        products: [seedProducts[0], seedProducts[0]],
      }).success,
    ).toBe(false);
  });
});
