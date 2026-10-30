import {
  cartSchema,
  type Cart,
  type ErrorCode,
  type Product,
  type Proposal,
  type Snapshot,
} from "../contracts/index.js";
import { formatMoney } from "../money.js";

export class DomainError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

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

export function cartView(cart: Cart, products: Product[]) {
  const totalMinor = cartTotal(cart, products);

  return {
    items: cart.items.map((item) => {
      const product = products.find((entry) => entry.id === item.productId)!;

      return { ...item, name: product.name, priceMinor: product.priceMinor };
    }),
    totalMinor,
  };
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

export function commitSummary(cart: Cart, products: Product[]) {
  const count = cart.items.reduce((total, item) => total + item.quantity, 0);

  return `Cart saved. ${count} ${count === 1 ? "item" : "items"}, total ${formatMoney(cartTotal(cart, products))}.`;
}
