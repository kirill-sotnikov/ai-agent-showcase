import { parseArgs } from "node:util";
import { shoppingScenarios } from "./datasets/shopping-v1.js";

export function readEvaluationOptions(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      live: { type: "boolean", default: false },
      cases: { type: "string" },
      output: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });

  const ids = values.cases?.split(",").map((id) => id.trim());

  if (ids?.some((id) => !id))
    throw new Error("--cases requires comma-separated scenario IDs.");

  const unknown = ids?.filter(
    (id) => !shoppingScenarios.some((scenario) => scenario.id === id),
  );

  if (unknown?.length)
    throw new Error(`Unknown shopping scenarios: ${unknown.join(", ")}`);

  const scenarios = ids
    ? shoppingScenarios.filter((scenario) => ids.includes(scenario.id))
    : shoppingScenarios;

  return {
    live: values.live,
    scenarios,
    outputPath:
      values.output ??
      `tests/evals/results/${values.live ? "live" : "fake"}-${ids ? "selected" : "latest"}.json`,
  };
}
