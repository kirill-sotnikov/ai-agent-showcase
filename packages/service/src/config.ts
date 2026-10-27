import { z } from "zod";

const environmentSchema = z.object({
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(0).max(65_535).default(3_001),
});

export const readConfig = () => {
  const environment = environmentSchema.parse(process.env);

  return { host: environment.HOST, port: environment.PORT };
};
