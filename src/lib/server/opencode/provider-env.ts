import { db } from "$lib/server/db/client";
import { env } from "$lib/env";
import { decryptProviderPayload } from "$lib/server/crypto";
import { isAbsolute, resolve } from "node:path";

export function isSecretLikeEnvKey(value: string): boolean {
  return /(?:^|_)(?:API_KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY)(?:_|$)/i.test(
    value,
  );
}

export function isFilePathEnvKey(value: string): boolean {
  return /(?:^|_)(?:CREDENTIALS|CERT|KEY_FILE|TOKEN_FILE|CONFIG_FILE)(?:_|$)/i.test(
    value,
  );
}

export function decryptEnvProfileValue(row: {
  encrypted_value: string;
  iv: string;
  auth_tag: string;
}): string {
  const parsed = decryptProviderPayload({
    encryptedPayload: row.encrypted_value,
    iv: row.iv,
    authTag: row.auth_tag,
  }) as { value?: string };
  if (!parsed.value || typeof parsed.value !== "string") {
    throw new Error("Invalid encrypted provider env payload");
  }
  return parsed.value;
}

export async function loadProviderEnv(): Promise<Record<string, string>> {
  const rows = await db.query.providerEnvProfile.findMany();
  const envMap: Record<string, string> = {};
  for (const row of rows) {
    const value = decryptEnvProfileValue(row);
    envMap[row.env_key] = isFilePathEnvKey(row.env_key) && !isAbsolute(value)
      ? resolve(env.KEPLER_SESSIONS_PATH, value)
      : value;
  }
  return envMap;
}
