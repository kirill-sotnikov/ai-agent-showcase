import { AIMessage } from "@langchain/core/messages";
import { expect, it } from "vitest";
import {
  parseAgentMessage,
  parseAgentResult,
} from "../packages/service/src/ai/llm/agent-result.js";

const answer = {
  text: "Hello! How can I help you shop?",
  showCart: false,
  productIds: [],
  clarification: null,
  missingInformation: false,
};

it.each(["json", ""])(
  "accepts a complete final JSON response wrapped in a %s Markdown fence",
  (language) => {
    expect(
      parseAgentMessage(
        new AIMessage(
          `\n\`\`\`${language}\n${JSON.stringify(answer)}\n\`\`\`\n`,
        ),
      ),
    ).toEqual(answer);
  },
);

it("accepts text content blocks while retaining the structured result", () => {
  expect(
    parseAgentMessage(
      new AIMessage({
        content: [{ type: "text", text: JSON.stringify(answer) }],
      }),
    ),
  ).toEqual(answer);
});

it("restores only an omitted nullable clarification in a final tool call", () => {
  expect(
    parseAgentResult({
      text: answer.text,
      showCart: false,
      productIds: [],
      missingInformation: false,
    }),
  ).toEqual(answer);
});

it.each([
  "Hi! How can I help?",
  '{"text":"Hello!"}',
  `Here is your answer: ${JSON.stringify(answer)}`,
  JSON.stringify({ ...answer, productIds: ["invented"] }),
  JSON.stringify({ ...answer, showCart: "false" }),
  JSON.stringify({ ...answer, unexpected: true }),
])(
  "keeps unstructured or invalid final results subject to schema validation: %s",
  (text) => {
    expect(() => parseAgentMessage(new AIMessage(text))).toThrow();
  },
);
