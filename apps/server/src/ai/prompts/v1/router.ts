export const routerPrompt = `Classify the shopping request as QUESTION, COMMAND, MIXED, CLARIFICATION, or OUT_OF_SCOPE.
Use conversation context to resolve references. Return the required structured result, including missing information.
Do not infer permission to change the cart from a product question alone.
An explicit answer to a pending clarification continues the original request if still applicable.`;
