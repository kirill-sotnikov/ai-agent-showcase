import type { Product } from "@shop/contracts";
import { normalize } from "@shop/domain";
import type { ToolGateway } from "../tools/gateway.js";
import type { AgentContext, AgentResult, Provider, Route } from "./types.js";

const words: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
function amount(value: string | undefined, fallback: number) {
  return value ? (words[value] ?? Number(value)) : fallback;
}
const mutation = /\b(add|remove|delete|set|buy)\b/i;
function requestText(context: AgentContext) {
  const pending = context.snapshot.pendingClarification;
  if (
    pending &&
    pending.baseRevision === context.baseRevision &&
    Date.parse(pending.expiresAt) > Date.now()
  )
    return `${pending.originalMessage}\nChoice: ${context.message}`;
  return context.message;
}
export class FakeProvider implements Provider {
  async guard(_context: AgentContext, signal: AbortSignal) {
    signal.throwIfAborted();
    return { verdict: "VALID" as const };
  }
  async route(context: AgentContext, signal: AbortSignal): Promise<Route> {
    signal.throwIfAborted();
    const message = requestText(context);
    const isQuestion =
      /^(?:how (?:do|can)|can i|does|what|is|are)\b/i.test(message) &&
      !/\band (?:add|remove|set|buy)\b/i.test(message);
    const isCommand = mutation.test(message) && !isQuestion;
    return {
      intent: isCommand
        ? /\b(find|cheapest|compare)\b/i.test(message)
          ? "MIXED"
          : "COMMAND"
        : "QUESTION",
      confidence: 1,
      clarification: null,
    };
  }
  async execute(
    role: "knowledge" | "action",
    context: AgentContext,
    gateway: ToolGateway,
    signal: AbortSignal,
  ): Promise<AgentResult> {
    signal.throwIfAborted();
    const text = requestText(context).toLowerCase();
    const pending = context.snapshot.pendingClarification;
    const choice = pending ? normalize(context.message) : "";
    let products: Product[] = [];
    if (pending && pending.baseRevision === context.baseRevision) {
      products = context.snapshot.products.filter(
        (product) =>
          pending.candidateIds.includes(product.id) &&
          (normalize(product.name).includes(choice) ||
            normalize(product.name)
              .split(" ")
              .some((word) => choice.includes(word))),
      );
      if (/^(yes|ok|sure)$/.test(choice) && pending.candidateIds.length === 1)
        products = context.snapshot.products.filter(
          (product) => product.id === pending.candidateIds[0],
        );
      for (const product of products)
        await gateway.call("get_product", { productId: product.id });
    }
    if (products.length === 0) {
      const stopWords = new Set([
        "a",
        "an",
        "the",
        "of",
        "and",
        "in",
        "my",
        "to",
        "one",
        "two",
        "three",
        "under",
        "with",
        "from",
        "set",
        "quantity",
        "for",
        "is",
        "it",
        "on",
        "add",
        "remove",
        "all",
        "these",
        "this",
        "those",
        "what",
        "which",
        "find",
        "compare",
        "cheapest",
        "difference",
        "between",
      ]);
      const vocabulary = new Set(
        context.snapshot.products.flatMap((product) =>
          normalize(
            [
              product.name,
              product.category,
              ...Object.values(product.attributes),
            ].join(" "),
          )
            .split(" ")
            .map((token) => token.replace(/s$/, "")),
        ),
      );
      const query = normalize(context.message)
        .split(" ")
        .map((token) => token.replace(/s$/, ""))
        .filter((token) => !stopWords.has(token) && vocabulary.has(token))
        .join(" ");
      const maxPrice = text.match(
        /(?:under|below|less than)\s*\$?(\d+(?:\.\d{1,2})?)/,
      );
      products = (await gateway.call("search_products", {
        query,
        category: null,
        maxPriceMinor: maxPrice
          ? Math.round(Number(maxPrice[1]) * 100) - 1
          : null,
        limit: 10,
      })) as Product[];
      if (/\b(remove|delete)\b/.test(text))
        products = products.filter((product) =>
          context.snapshot.cart.items.some(
            (item) => item.productId === product.id,
          ),
        );
      if (
        context.snapshot.products.length > 0 &&
        !query &&
        !/\b(all|catalog|products|cart|cheapest|hello|hi|hey)\b/.test(text) &&
        !pending
      )
        return {
          productIds: [],
          clarification: "Which product would you like to explore?",
          missingInformation: false,
        };
    }
    if (/\bcheapest\b/.test(text) && products.length > 0)
      products = [
        (await gateway.call("choose_cheapest", {
          productIds: products.map((product) => product.id),
        })) as Product,
      ];
    if (role === "action") {
      if (
        products.length !== 1 ||
        (pending &&
          /^(yes|ok|sure)$/.test(choice) &&
          pending.candidateIds.length > 1)
      )
        return {
          productIds: products.map((product) => product.id),
          clarification:
            products.length === 0
              ? "I could not find that product. Which product do you mean?"
              : `Which product do you mean: ${products.map((product) => product.name).join(" or ")}?`,
          missingInformation: false,
        };
      const productId = products[0].id;
      const operationText = pending
        ? pending.originalMessage.toLowerCase()
        : text;
      if (/\b(remove|delete)\b/.test(operationText)) {
        const match = operationText.match(
          /(?:remove|delete)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/,
        );
        await gateway.call("remove_from_cart", {
          productId,
          quantity: match ? amount(match[1], 1) : null,
        });
      } else if (/\bset\b/.test(operationText)) {
        const match = operationText.match(
          /(?:to|quantity)\s+(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/,
        );
        if (!match)
          return {
            productIds: [productId],
            clarification: "What quantity would you like?",
            missingInformation: false,
          };
        await gateway.call("set_cart_quantity", {
          productId,
          quantity: amount(match[1], 1),
        });
      } else {
        const match = operationText.match(
          /(?:add|buy)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/,
        );
        await gateway.call("add_to_cart", {
          productId,
          quantity: amount(match?.[1], 1),
        });
      }
    }
    return {
      productIds: products.map((product) => product.id),
      clarification: null,
      missingInformation: /\b(waterproof|warranty|weight|compatible)\b/.test(
        text,
      ),
    };
  }
  async present(
    _context: AgentContext,
    result: AgentResult,
    committed: boolean,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    return {
      intro: committed
        ? ("Here is your saved cart." as const)
        : ("Here are the matching products." as const),
      productIds: result.productIds,
      missingInformation: result.missingInformation,
    };
  }
}
