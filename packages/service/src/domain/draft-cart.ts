import type { Cart, Operation, Snapshot } from "@shop/shared/contracts";
import {
  cartTotal,
  DomainError,
  quantity,
  setQuantity,
} from "@shop/shared/domain";

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
