import { registry } from "../tools/gateway.js";

// Some chat backends omit properties whose value is null in function calls.
// Restore only nulls allowed by the declared tool schema; required non-null
// fields, extra keys, and invalid values still go through strict validation.
export function normalizeToolArguments(name: string, raw: unknown): unknown {
  if (
    !Object.hasOwn(registry, name) ||
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw)
  )
    return raw;

  const schema = registry[name as keyof typeof registry];

  const missingNulls = Object.fromEntries(
    Object.entries(schema.shape)
      .filter(
        ([key, field]) =>
          !Object.hasOwn(raw, key) && field.safeParse(null).success,
      )
      .map(([key]) => [key, null]),
  );

  return { ...raw, ...missingNulls };
}
