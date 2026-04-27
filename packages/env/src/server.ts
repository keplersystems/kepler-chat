import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    KEPLER_PASSCODE: z.string().min(4),
    KEPLER_SESSIONS_PATH: z.string().min(1),
    KEPLER_PORT_RANGE_START: z.coerce.number().default(5100),
    KEPLER_PORT_RANGE_END: z.coerce.number().default(6000),
    KEPLER_PROVIDER_CREDENTIALS_KEY: z
      .string()
      .min(1)
      .refine((value) => {
        try {
          return Buffer.from(value, "base64").length === 32;
        } catch {
          return false;
        }
      }, "KEPLER_PROVIDER_CREDENTIALS_KEY must be base64-encoded 32-byte key"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
