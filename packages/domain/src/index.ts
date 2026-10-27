import {
  cartSchema,
  type Cart,
  type ErrorCode,
  type Operation,
  type Product,
  type Proposal,
  type Snapshot,
} from "@shop/contracts";

export class DomainError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
export const DEFAULT_IDENTITY =
  "You are a helpful shopping assistant. Help customers discover products, understand their features, compare suitable options, and build their cart. Be concise, friendly, and clear. Use only the provided product catalog.";
export const seedProducts: Product[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Arc Desk Lamp",
    description:
      "An adjustable reading lamp with a warm LED light and a matte finish.",
    priceMinor: 3900,
    currency: "USD",
    category: "Lighting",
    attributes: { color: "Sage", material: "Aluminum", power: "8 W" },
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Linen Table Lamp",
    description:
      "Soft ambient lighting with a natural linen shade and ceramic base.",
    priceMinor: 4800,
    currency: "USD",
    category: "Lighting",
    attributes: { color: "Sand", material: "Ceramic" },
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Blue Ceramic Mug",
    description:
      "A comfortable everyday mug, dishwasher safe, with a glazed blue finish.",
    priceMinor: 1800,
    currency: "USD",
    category: "Kitchen",
    attributes: { color: "Blue", capacity: "350 ml" },
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Cloud Wireless Headphones",
    description:
      "Lightweight wireless headphones with noise isolation and USB-C charging.",
    priceMinor: 8900,
    currency: "USD",
    category: "Audio",
    attributes: {
      color: "Black",
      battery: "30 hours",
      connectivity: "Bluetooth",
    },
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    name: "Studio Wireless Headphones",
    description: "Over-ear wireless headphones with active noise cancellation.",
    priceMinor: 12900,
    currency: "USD",
    category: "Audio",
    attributes: {
      color: "Silver",
      battery: "40 hours",
      connectivity: "Bluetooth",
    },
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    name: "Canvas Everyday Tote",
    description: "A durable cotton canvas tote with an inside pocket.",
    priceMinor: 2400,
    currency: "USD",
    category: "Accessories",
    attributes: { color: "Natural", material: "Cotton" },
  },
];
export function assertCart(cart: Cart, products: Product[]) {
  cartSchema.parse(cart);
  if (
    cart.items.some(
      (item) => !products.some((product) => product.id === item.productId),
    )
  )
    throw new DomainError(
      "PRODUCT_NOT_FOUND",
      "This product is no longer in the catalog.",
    );
}
export function cartTotal(cart: Cart, products: Product[]) {
  assertCart(cart, products);
  return cart.items.reduce(
    (total, item) =>
      total +
      products.find((product) => product.id === item.productId)!.priceMinor *
        item.quantity,
    0,
  );
}
export function quantity(cart: Cart, productId: string) {
  return cart.items.find((item) => item.productId === productId)?.quantity ?? 0;
}
export function setQuantity(
  cart: Cart,
  products: Product[],
  productId: string,
  value: number,
): Cart {
  if (!products.some((product) => product.id === productId))
    throw new DomainError("PRODUCT_NOT_FOUND", "Product not found.");
  if (!Number.isInteger(value) || value < 0 || value > 99)
    throw new DomainError(
      "INVALID_QUANTITY",
      "Quantity must be a whole number between 0 and 99.",
    );
  const items = cart.items.filter((item) => item.productId !== productId);
  if (value > 0) items.push({ productId, quantity: value });
  return {
    items: items.sort((left, right) =>
      left.productId.localeCompare(right.productId),
    ),
  };
}
export function normalize(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
export class CatalogService {
  constructor(readonly products: Product[]) {}
  get(productId: string) {
    const product = this.products.find((product) => product.id === productId);
    if (!product)
      throw new DomainError("PRODUCT_NOT_FOUND", "Product not found.");
    return product;
  }
  search(
    query: string,
    category: string | null = null,
    maxPriceMinor: number | null = null,
    limit = 10,
  ) {
    const tokens = normalize(query)
      .split(" ")
      .filter(Boolean)
      .map((token) => token.replace(/s$/, ""));
    return this.products
      .filter((product) => {
        const text = normalize(
          [
            product.name,
            product.description,
            product.category,
            ...Object.values(product.attributes),
          ].join(" "),
        );
        return (
          tokens.every((token) => text.includes(token)) &&
          (!category || normalize(product.category) === normalize(category)) &&
          (maxPriceMinor === null || product.priceMinor <= maxPriceMinor)
        );
      })
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name) ||
          left.id.localeCompare(right.id),
      )
      .slice(0, Math.min(10, limit));
  }
  cheapest(products: Product[]) {
    return [...products].sort(
      (left, right) =>
        left.priceMinor - right.priceMinor || left.id.localeCompare(right.id),
    )[0];
  }
}
export class DraftCartService {
  cart: Cart;
  readonly operations: Operation[] = [];
  constructor(readonly snapshot: Snapshot) {
    this.cart = structuredClone(snapshot.cart);
  }
  change(tool: Operation["tool"], productId: string, amount: number | null) {
    const previousQuantity = quantity(this.cart, productId);
    if (tool === "remove_from_cart" && previousQuantity === 0)
      throw new DomainError(
        "CART_ITEM_NOT_FOUND",
        "This product is not in your cart.",
      );
    const nextQuantity =
      tool === "add_to_cart"
        ? previousQuantity + amount!
        : tool === "set_cart_quantity"
          ? amount!
          : amount === null
            ? 0
            : Math.max(0, previousQuantity - amount);
    this.cart = setQuantity(
      this.cart,
      this.snapshot.products,
      productId,
      nextQuantity,
    );
    this.operations.push({
      operationId: crypto.randomUUID(),
      tool,
      productId,
      previousQuantity,
      nextQuantity,
    });
    return {
      cart: this.cart,
      totalMinor: cartTotal(this.cart, this.snapshot.products),
    };
  }
}
export const canonicalCart = (cart: Cart) =>
  JSON.stringify(
    [...cart.items].sort((left, right) =>
      left.productId.localeCompare(right.productId),
    ),
  );
export async function cartFingerprint(cart: Cart) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalCart(cart)),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
export function verifyProposal(proposal: Proposal, snapshot: Snapshot) {
  assertCart(proposal.nextCart, snapshot.products);
  let replay = structuredClone(snapshot.cart);
  const operationIds = new Set<string>();
  for (const operation of proposal.operations) {
    if (
      operationIds.has(operation.operationId) ||
      quantity(replay, operation.productId) !== operation.previousQuantity
    )
      throw new DomainError("INVALID_REQUEST", "Invalid proposed operations.");
    operationIds.add(operation.operationId);
    if (
      (operation.tool === "add_to_cart" &&
        operation.nextQuantity <= operation.previousQuantity) ||
      (operation.tool === "remove_from_cart" &&
        operation.nextQuantity > operation.previousQuantity)
    )
      throw new DomainError(
        "INVALID_REQUEST",
        "Invalid proposed operation direction.",
      );
    replay = setQuantity(
      replay,
      snapshot.products,
      operation.productId,
      operation.nextQuantity,
    );
  }
  if (
    canonicalCart(replay) !== canonicalCart(proposal.nextCart) ||
    cartTotal(replay, snapshot.products) !== proposal.totalMinor
  )
    throw new DomainError("INVALID_REQUEST", "Invalid proposed totals.");
}
export const formatMoney = (minor: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    minor / 100,
  );
export function commitSummary(cart: Cart, products: Product[]) {
  const count = cart.items.reduce((total, item) => total + item.quantity, 0);
  return `Cart saved. ${count} ${count === 1 ? "item" : "items"}, total ${formatMoney(cartTotal(cart, products))}.`;
}
