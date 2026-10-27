import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    HOST: z.string().min(1).default("127.0.0.1"),
    PORT: z.coerce.number().int().min(0).max(65535).default(3001),
    LLM_PROVIDER: z.enum(["openai", "fake"]).default("openai"),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().optional(),
    ALLOWED_ORIGINS: z
      .string()
      .default("http://localhost:3000,http://127.0.0.1:3000"),
    REQUEST_DEADLINE_MS: z.coerce
      .number()
      .int()
      .min(50)
      .max(120000)
      .default(60000),
    LLM_TIMEOUT_MS: z.coerce.number().int().min(20).max(60000).default(20000),
    ACK_TIMEOUT_MS: z.coerce.number().int().min(20).max(30000).default(5000),
    MAX_CONCURRENT_RUNS: z.coerce.number().int().min(1).max(32).default(8),
    MAX_LLM_CALLS: z.coerce.number().int().min(1).max(16).default(8),
    MAX_TOOL_CALLS: z.coerce.number().int().min(1).max(24).default(12),
    MAX_OUTPUT_TOKENS: z.coerce.number().int().min(200).max(4000).default(1500),
  })
  .refine(
    (env) => env.NODE_ENV !== "production" || env.LLM_PROVIDER !== "fake",
    "Fake provider is only available in development and test.",
  );

export type Config = z.infer<typeof envSchema>;

export function readConfig(
  env: Record<string, string | undefined> = process.env,
): Config {
  return envSchema.parse(env);
}

export function readiness(config: Config) {
  if (config.LLM_PROVIDER === "fake")
    return { ready: true, reason: "Development fake provider" };
  if (!config.OPENAI_API_KEY || config.OPENAI_API_KEY.startsWith("your-"))
    return {
      ready: false,
      reason: "OPENAI_API_KEY is required on the server.",
    };
  if (!config.OPENAI_MODEL || config.OPENAI_MODEL.startsWith("your-"))
    return { ready: false, reason: "OPENAI_MODEL is required on the server." };

  return {
    ready: true,
    reason:
      "Configured. Model capability is verified separately by live evaluations.",
  };
}
