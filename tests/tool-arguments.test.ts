import { expect, it } from "vitest";
import { seedProducts } from "@shop/shared/defaults";
import { normalizeToolArguments } from "../packages/service/src/ai/llm/tool-arguments.js";
import {
  registry,
  ToolGateway,
} from "../packages/service/src/ai/tools/gateway.js";
import { initialState, snapshotOf } from "../packages/web/src/storage/store.js";

const productId = seedProducts[0].id;

it("restores an omitted nullable removal quantity and clears the whole draft line", async () => {
  const snapshot = snapshotOf(initialState());

  snapshot.cart.items = [{ productId, quantity: 3 }];

  const gateway = new ToolGateway(
    "action",
    snapshot,
    4,
    new AbortController().signal,
    () => {},
  );

  const args = { productId };

  await gateway.call("get_product", { productId });

  await gateway.call(
    "remove_from_cart",
    normalizeToolArguments("remove_from_cart", args),
  );

  expect(gateway.draft.cart.items).toEqual([]);

  expect(gateway.results.at(-1)?.arguments).toEqual({
    productId,
    quantity: null,
  });

  expect(args).toEqual({ productId });
  expect(snapshot.cart.items).toEqual([{ productId, quantity: 3 }]);
});

it("restores omitted nullable search filters while preserving explicit filters", () => {
  expect(
    normalizeToolArguments("search_products", { query: "lamp", limit: 10 }),
  ).toEqual({ query: "lamp", limit: 10, category: null, maxPriceMinor: null });

  expect(
    normalizeToolArguments("search_products", {
      query: "lamp",
      limit: 10,
      category: "Lighting",
      maxPriceMinor: 4999,
    }),
  ).toEqual({
    query: "lamp",
    limit: 10,
    category: "Lighting",
    maxPriceMinor: 4999,
  });
});

it.each([1, 2, null])(
  "preserves an explicit removal quantity of %s",
  (quantity) => {
    expect(
      normalizeToolArguments("remove_from_cart", { productId, quantity }),
    ).toEqual({ productId, quantity });
  },
);

it.each([
  ["add_to_cart", { productId }],
  ["set_cart_quantity", { productId }],
  ["remove_from_cart", { quantity: null }],
  ["remove_from_cart", { productId, quantity: "null" }],
  ["remove_from_cart", { productId, quantity: "1" }],
  ["remove_from_cart", { productId, quantity: 0 }],
  ["remove_from_cart", { productId, quantity: -1 }],
  ["remove_from_cart", { productId, quantity: 0.5 }],
  ["remove_from_cart", { productId, quantity: 100 }],
  ["remove_from_cart", { productId, unexpected: true }],
  ["search_products", { query: "lamp" }],
  ["get_product", {}],
] as const)("keeps invalid %s arguments invalid: %j", (name, args) => {
  expect(
    registry[name].safeParse(normalizeToolArguments(name, args)).success,
  ).toBe(false);
});

it.each([null, [], "invalid"])(
  "does not coerce an invalid argument envelope: %j",
  (args) => {
    expect(normalizeToolArguments("remove_from_cart", args)).toEqual(args);
  },
);

it("does not resolve unknown or inherited tool names", () => {
  const args = { productId };

  expect(normalizeToolArguments("execute_code", args)).toBe(args);
  expect(normalizeToolArguments("__proto__", args)).toBe(args);
});
