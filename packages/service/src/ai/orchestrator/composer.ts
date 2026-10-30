import type { Cart, EventPayload, Product } from "@shop/shared/contracts";
import { cartView } from "@shop/shared/domain";
import { responseSchema, type ComposerInput } from "../llm/types.js";

// Presentation is deterministic. Cart data always comes from application state.
export function composeResponse(
  input: ComposerInput,
  source: "knowledge" | "action",
  cart: Cart,
  products: Product[],
): EventPayload<"assistant.message"> {
  const { text, showCart: requested } = responseSchema.parse(input);
  const showCart = source === "action" || requested;

  return {
    messageId: crypto.randomUUID(),
    content: text,
    showCart,
    cart: showCart ? cartView(cart, products) : null,
  };
}
