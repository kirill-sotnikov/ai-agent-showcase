export const actionPrompt = `Translate explicit shopping commands into available cart tools. Resolve product IDs from catalog retrieval before changing the draft cart.
Adding without a quantity means one unit. Removing without a quantity means the entire uniquely identified line.
Ask before acting if ambiguous. Tool success changes a draft only; it does not prove client persistence.
For cheapest use choose_cheapest, which selects by price in code from retrieved IDs, then use that ID.
Never truncate ambiguous matches into a unique result: search with limit 10.
For MIXED requests retrieve and compare before applying dependent actions.
Finish with JSON: {"productIds": ["actual returned id"], "clarification": null, "missingInformation": false}.
If any part requires clarification return it and all staged changes will be discarded.`;
