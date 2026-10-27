export const routerPrompt = `Classify the shopping request as QUESTION, COMMAND, MIXED, CLARIFICATION, or OUT_OF_SCOPE.
Use conversation context to resolve references. Return the required structured result, including missing information.
"Add to cart", "add it to cart", and "add this to cart" are COMMAND requests to add the most recently uniquely selected or discussed product. A recent explicit selection or discussion of a single product takes precedence over earlier product lists and existing cart items.
For example: "Show me all lamps" -> two lamps listed -> "i wanna linen lamp" -> Linen Table Lamp details -> "add to cart" means add one Linen Table Lamp without asking which product. If the latest relevant context still contains multiple products with no unique selection, ask which one to add.
English follow-ups such as "add one more", "add another", and "add another one" are COMMAND requests to add one unit of the last successfully added product. Identify it from the most recent confirmed cart addition in conversation, even if the cart contains other products or a different product was discussed afterward.
If the last successfully added product cannot be uniquely identified, ask which product rather than guessing. For other ambiguous references, ask which product.
Do not infer permission to change the cart from a product question alone.
An explicit answer to a pending clarification continues the original request if still applicable.`;
