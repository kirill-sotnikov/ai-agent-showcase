import { z } from "zod";
import {
  idSchema,
  toolArguments,
  type SafeDetails,
  type Snapshot,
  type ToolName,
} from "@shop/contracts";
import {
  CatalogService,
  cartTotal,
  DomainError,
  DraftCartService,
} from "@shop/domain";

export const chooseCheapestSchema = z.strictObject({
  productIds: z.array(idSchema).min(1).max(10),
});
export const registry = {
  ...toolArguments,
  choose_cheapest: chooseCheapestSchema,
};
export type GatewayTool = keyof typeof registry;
export class ToolGateway {
  readonly catalog: CatalogService;

  readonly draft: DraftCartService;

  readonly retrievedIds = new Set<string>();

  calls = 0;

  constructor(
    readonly role: "knowledge" | "action",
    readonly snapshot: Snapshot,
    readonly maxCalls: number,
    readonly signal: AbortSignal,
    readonly onTool: (
      phase: "started" | "completed",
      details: SafeDetails,
      durationMs?: number,
    ) => void,
  ) {
    this.catalog = new CatalogService(snapshot.products);
    this.draft = new DraftCartService(snapshot);
  }

  async call(name: string, raw: unknown): Promise<unknown> {
    this.signal.throwIfAborted();
    if (!Object.hasOwn(registry, name))
      throw new DomainError("TOOL_NOT_ALLOWED", "This tool is not available.");

    const tool = name as GatewayTool;

    if (
      this.role === "knowledge" &&
      ["add_to_cart", "set_cart_quantity", "remove_from_cart"].includes(tool)
    )
      throw new DomainError(
        "TOOL_NOT_ALLOWED",
        "Product questions cannot change your cart.",
      );
    if (++this.calls > this.maxCalls)
      throw new DomainError(
        "TOOL_LIMIT_EXCEEDED",
        "The tool budget for this request was exceeded.",
      );

    const args = registry[tool].safeParse(raw);

    if (!args.success)
      throw new DomainError("INVALID_REQUEST", "Invalid tool arguments.");

    const startedAt = performance.now();

    const details: SafeDetails =
      tool === "choose_cheapest" ? {} : { tool: tool as ToolName };

    if ("query" in args.data) details.query = args.data.query;
    if ("productId" in args.data) details.productId = args.data.productId;
    if ("quantity" in args.data) details.quantity = args.data.quantity;
    this.onTool("started", details);

    let result: unknown;

    if (tool === "search_products") {
      const input = toolArguments.search_products.parse(raw);

      const products = this.catalog.search(
        input.query,
        input.category,
        input.maxPriceMinor,
        input.limit,
      );

      for (const product of products) this.retrievedIds.add(product.id);
      result = products;
      details.productIds = products.map((product) => product.id);
      details.resultCount = products.length;
    } else if (tool === "get_product") {
      const product = this.catalog.get(
        toolArguments.get_product.parse(raw).productId,
      );

      this.retrievedIds.add(product.id);
      result = product;
      details.productIds = [product.id];
    } else if (tool === "get_cart") {
      result = {
        cart: this.draft.cart,
        totalMinor: cartTotal(this.draft.cart, this.snapshot.products),
      };

      details.totalMinor = cartTotal(this.draft.cart, this.snapshot.products);
    } else if (tool === "choose_cheapest") {
      const input = chooseCheapestSchema.parse(raw);

      if (input.productIds.some((id) => !this.retrievedIds.has(id)))
        throw new DomainError(
          "INVALID_REQUEST",
          "Product selection must use retrieved products.",
        );

      result = this.catalog.cheapest(
        input.productIds.map((id) => this.catalog.get(id)),
      );
    } else {
      const input = args.data as { productId: string; quantity: number | null };

      if (!this.retrievedIds.has(input.productId))
        throw new DomainError(
          "INVALID_REQUEST",
          "Retrieve a product before changing its quantity.",
        );
      result = this.draft.change(tool, input.productId, input.quantity);
      details.totalMinor = cartTotal(this.draft.cart, this.snapshot.products);
    }

    this.signal.throwIfAborted();
    this.onTool("completed", details, performance.now() - startedAt);

    return result;
  }

  availableTools() {
    return Object.entries(registry).filter(
      ([name]) =>
        this.role === "action" ||
        !["add_to_cart", "set_cart_quantity", "remove_from_cart"].includes(
          name,
        ),
    );
  }
}
