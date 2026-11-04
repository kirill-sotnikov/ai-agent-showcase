import { guardPolicy } from "./guard.js";
import { routerPolicy } from "./router.js";
import { decisionQuestions } from "./decisions.js";

export const assessmentPrompt = `Recheck the assessment of the CURRENT user message. The last user message is current; the JSON envelope contains background context.
Return one structured object with guard, route and complexity. Make the Guard and Router judgments independently.
Guard judges spam legitimacy. Router judges what the customer wants. An UNCERTAIN Guard does not mean a product or quantity is missing and must not force CLARIFICATION.
For example, "hi", "hello", and "thanks" are QUESTION requests, with clarification null. A short message is not ambiguous merely because it is short. Use prior conversation only when the current message refers to it.
Choose CLARIFICATION only when answering or performing the current request actually requires missing information. Do not turn low classification confidence into a question about a nonexistent shopping action.

Guard policy:
${guardPolicy}

Router policy:
${routerPolicy}

Complexity:
${decisionQuestions.complexity.instructions}
SIMPLE: ${decisionQuestions.complexity.criteria.SIMPLE}
COMPLEX: ${decisionQuestions.complexity.criteria.COMPLEX}`;
