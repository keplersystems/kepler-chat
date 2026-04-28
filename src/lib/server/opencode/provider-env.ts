import { db } from "$lib/server/db/client";
import { env } from "$lib/env";
import { createDecipheriv } from "node:crypto";
import { isAbsolute, resolve } from "node:path";

const ALGORITHM = "aes-256-gcm";

function isFilePathEnvKey(value: string): boolean {
  return /(?:^|_)(?:CREDENTIALS|CERT|KEY_FILE|TOKEN_FILE|CONFIG_FILE)(?:_|$)/i.test(
    value,
  );
}

function getCredentialKey(): Buffer {
  const key = Buffer.from(env.KEPLER_PROVIDER_CREDENTIALS_KEY, "base64");
  if (key.length !== 32) {
    throw new Error("Invalid credentials encryption key length");
  }
  return key;
}

function decryptValue(payload: {
  encryptedValue: string;
  iv: string;
  authTag: string;
}): string {
  const key = getCredentialKey();
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.encryptedValue, "base64")),
    decipher.final(),
  ]);
  const parsed = JSON.parse(decrypted.toString("utf8")) as { value?: string };
  if (!parsed.value || typeof parsed.value !== "string") {
    throw new Error("Invalid encrypted provider env payload");
  }
  return parsed.value;
}

export async function loadProviderEnv(): Promise<Record<string, string>> {
  const rows = await db.query.providerEnvProfile.findMany();
  const envMap: Record<string, string> = {};
  for (const row of rows) {
    const value = decryptValue({
      encryptedValue: row.encrypted_value,
      iv: row.iv,
      authTag: row.auth_tag,
    });
    envMap[row.env_key] = isFilePathEnvKey(row.env_key) && !isAbsolute(value)
      ? resolve(env.KEPLER_SESSIONS_PATH, value)
      : value;
  }
  return envMap;
}
