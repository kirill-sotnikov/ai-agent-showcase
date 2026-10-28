import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  readConfig,
  readiness,
} from "../../packages/service/src/config/index.js";
import { readLiveLimits } from "./budget.js";
import { readEvaluationOptions } from "./options.js";
import { createShoppingSuite } from "./suite.js";

// Set before the dynamic SDK import so results and logs stay in this checkout.
process.env.PROMPTFOO_CONFIG_DIR ??= resolve(".promptfoo");
process.env.PROMPTFOO_DISABLE_TELEMETRY ??= "1";
process.env.PROMPTFOO_DISABLE_UPDATE ??= "1";

const { live, scenarios, outputPath } = readEvaluationOptions(
  process.argv.slice(2),
);

const config = readConfig();

async function main() {
  await mkdir(dirname(outputPath), { recursive: true });

  if (live && !readiness({ ...config, LLM_PROVIDER: "openai" }).ready) {
    const report = {
      status: "skipped",
      reason: "Live evaluations need server OPENAI_API_KEY and OPENAI_MODEL.",
      model: config.OPENAI_MODEL ?? null,
    };

    await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n");
    console.info(JSON.stringify(report));
    process.exitCode = 1;

    return;
  }

  const { suite, budget, caseCount } = createShoppingSuite({
    config,
    live,
    scenarios,
    limits: live ? readLiveLimits() : undefined,
    outputPath,
  });

  console.error(
    `[eval:${live ? "live" : "fake"}] Promptfoo: ${caseCount} scenarios; ` +
      `timeout ${config.REQUEST_DEADLINE_MS / 1000}s per scenario.`,
  );

  const { evaluate } = await import("promptfoo");

  const evaluation = await evaluate(suite, {
    cache: false,
    maxConcurrency: 1,
    showProgressBar: false,
    progressCallback: (completed, total, _index, _step, metrics) => {
      console.error(
        `[promptfoo] ${completed}/${total}: ` +
          `${metrics.testPassCount} passed, ${metrics.testFailCount} failed, ` +
          `${metrics.testErrorCount} errors`,
      );
    },
  });

  const report = await evaluation.toEvaluateSummary();

  console.error(
    `Report saved to ${outputPath}. Open the UI with yarn eval:view.`,
  );

  console.info(
    JSON.stringify({
      framework: "promptfoo",
      evalId: evaluation.id,
      provider: live ? "openai" : "fake",
      model: live ? config.OPENAI_MODEL : "deterministic-v1",
      estimatedUSD: budget?.spentUSD ?? 0,
      ...report.stats,
    }),
  );

  if (report.stats.failures || report.stats.errors) process.exitCode = 1;
}

await main();
