import type { Assertion, GradingResult } from "promptfoo";
import { canonicalCart } from "@shop/shared/domain";
import {
  shoppingResultSchema,
  type ShoppingResult,
  type ShoppingScenario,
} from "./types.js";

type Check = (result: ShoppingResult) => GradingResult;

function grade(pass: boolean, success: string, failure: string): GradingResult {
  return { pass, score: pass ? 1 : 0, reason: pass ? success : failure };
}

function assertion(metric: string, check: Check): Assertion {
  return {
    type: "javascript",
    metric,
    value: (output) => check(shoppingResultSchema.parse(JSON.parse(output))),
  };
}

export function scenarioAssertions(scenario: ShoppingScenario): Assertion[] {
  const expectedCart = {
    items: scenario.expected.items ?? scenario.cart ?? [],
  };

  const expectsCommit =
    canonicalCart(expectedCart) !==
    canonicalCart({ items: scenario.cart ?? [] });

  const assertions: Assertion[] = [
    assertion("outcome", (result) =>
      grade(
        result.outcome === scenario.expected.outcome,
        `Outcome: ${result.outcome}`,
        `Expected ${scenario.expected.outcome}, got ${result.outcome}`,
      ),
    ),
    assertion("cart", (result) =>
      grade(
        canonicalCart(result.cart) === canonicalCart(expectedCart),
        "Cart matches expected items and quantities",
        `Expected ${JSON.stringify(expectedCart)}, got ${JSON.stringify(result.cart)}`,
      ),
    ),
    assertion("persistence", (result) =>
      grade(
        !result.prematureClaim &&
          result.committed === expectsCommit &&
          result.cartStatus === (expectsCommit ? "committed" : "unchanged"),
        "Persistence status and confirmation order are correct",
        `Expected committed=${expectsCommit}; got committed=${result.committed}, ` +
          `cartStatus=${result.cartStatus}, prematureClaim=${result.prematureClaim}`,
      ),
    ),
  ];

  if (scenario.expected.outcome === "clarification")
    assertions.push(
      assertion("clarification", (result) =>
        grade(
          Boolean(result.clarification?.question.trim()) &&
            result.messages.includes(result.clarification?.question ?? ""),
          "A clarification question was emitted and shown to the user",
          "Missing clarification question or assistant message",
        ),
      ),
    );

  const expectedProductIds = scenario.expected.productIds;

  if (expectedProductIds)
    assertions.push(
      assertion("products", (result) =>
        grade(
          JSON.stringify([...result.productIds].sort()) ===
            JSON.stringify([...expectedProductIds].sort()),
          "Response contains exactly the expected products",
          `Expected products ${JSON.stringify(expectedProductIds)}, got ${JSON.stringify(result.productIds)}`,
        ),
      ),
    );

  if (scenario.expected.missingInformation !== undefined)
    assertions.push(
      assertion("missing_information", (result) =>
        grade(
          result.messages.some((message) =>
            /not (include|provide|specif|list)|doesn't (include|provide|specif|list)|unknown|not available|no (information|details)|cannot (confirm|determine)|can't (confirm|determine)/i.test(
              message,
            ),
          ) === scenario.expected.missingInformation,
          "Missing specifications are communicated correctly",
          "Missing-specification disclosure does not match expectations",
        ),
      ),
    );

  if (scenario.expected.showCart !== undefined)
    assertions.push(
      assertion("show_cart", (result) =>
        grade(
          result.showCarts.length > 0 &&
            result.showCarts.every(
              (value) => value === scenario.expected.showCart,
            ),
          "Cart visibility matches the request",
          "Incorrect cart visibility",
        ),
      ),
    );

  if (scenario.expected.answerContains)
    assertions.push(
      assertion("answer", (result) =>
        grade(
          scenario.expected.answerContains!.every((text) =>
            result.messages
              .join(" ")
              .toLowerCase()
              .includes(text.toLowerCase()),
          ),
          "The text answers the user's question",
          "Missing expected answer content",
        ),
      ),
    );

  if (scenario.expected.noTools)
    assertions.push(
      assertion("no_tools", (result) =>
        grade(
          result.tools.length === 0,
          "Conversational answer needs no tools",
          "Unnecessary tool calls",
        ),
      ),
    );

  if (scenario.expected.errorCode)
    assertions.push(
      assertion("error_code", (result) =>
        grade(
          result.error?.code === scenario.expected.errorCode,
          `Expected error: ${scenario.expected.errorCode}`,
          `Expected error ${scenario.expected.errorCode}, got ${result.error?.code ?? "none"}`,
        ),
      ),
    );

  return assertions;
}
