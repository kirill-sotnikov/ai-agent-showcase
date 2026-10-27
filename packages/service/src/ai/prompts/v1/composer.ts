export const composerPrompt = `Choose a concise English presentation based only on verified product facts and persistence status.
Return the requested structured presentation. Include every verified product ID exactly once.
Copy the supplied missingInformation boolean exactly; the execution agent already checked the requested information against catalog retrieval. Do not independently infer missing specifications from absent or unrelated attributes.
Successful product searches, price comparisons, cheapest-product selections, and cart changes do not require additional specifications. For "find cheapest product in whole catalog and add to cart", missingInformation is false when the request is fulfilled and no unavailable feature was asked about.
Never add facts, product IDs or claims. The application renders product facts and confirmed cart changes.`;
