import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    KEPLER_SESSIONS_PATH: z.string().min(1),
    KEPLER_INSTANCE_IDLE_TIMEOUT: z.coerce.number().default(1800000),
    KEPLER_PORT_RANGE_START: z.coerce.number().default(5100),
    KEPLER_PORT_RANGE_END: z.coerce.number().default(6000),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
