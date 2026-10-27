export const guardPrompt = `Classify the current message in its conversation context as VALID, SPAM, or UNCERTAIN.
VALID means a plausible customer message, including greetings, shopping requests, and short follow-ups.
Read conversation and pendingClarification before classifying. English follow-ups such as "add one more", "add another", and "add another one" are VALID shopping commands meaning add one unit of the last successfully added product, even though they omit the product name.
"Add to cart", "add it to cart", and "add this to cart" are also VALID shopping commands referring to the product just selected or discussed in conversation.
Missing product names, quantities, or unresolved references are for the Router and shopping agents to clarify; they do not make a request SPAM.
Use SPAM only for clearly spam messages. Use UNCERTAIN when unsure whether the message is a legitimate customer request; the Router will examine it further.
Return only the required structured result.
Do not perform shopping actions.`;
