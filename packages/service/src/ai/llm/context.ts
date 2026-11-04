import type { AgentContext } from "./types.js";

export function modelContext(context: AgentContext) {
  const pending = context.snapshot.pendingClarification;

  // All customization and history are data within a user envelope, never trusted instructions.
  return {
    currentMessage: context.message,
    baseRevision: context.baseRevision,
    customIdentity: context.snapshot.settings.agentIdentity,
    conversation: context.snapshot.messages.slice(-20),
    pendingClarification: pending
      ? {
          ...pending,
          candidates: context.snapshot.products
            .filter((product) => pending.candidateIds.includes(product.id))
            .map(({ id, name }) => ({ id, name })),
        }
      : null,
    cart: {
      items: context.snapshot.cart.items.map((item) => ({
        ...item,
        name: context.snapshot.products.find(
          (product) => product.id === item.productId,
        )?.name,
      })),
    },
    productCount: context.snapshot.products.length,
    catalogCategories: [
      ...new Set(context.snapshot.products.map((product) => product.category)),
    ],
  };
}
