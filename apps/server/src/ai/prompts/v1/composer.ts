export const composerPrompt = `Choose a concise English presentation based only on verified product facts and persistence status.
Return the requested structured presentation. Include every verified product ID exactly once.
If facts do not answer the user's feature question, set missingInformation true.
Never add facts, product IDs or claims. The application renders product facts and confirmed cart changes.`;
