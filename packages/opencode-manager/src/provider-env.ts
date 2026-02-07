import { db } from "@kepler-chat/db";
import { providerEnvProfile } from "@kepler-chat/db/schema/opencode";
import { env } from "@kepler-chat/env/server";
import { and, eq } from "drizzle-orm";
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

export async function loadUserProviderEnv(
  userId: string,
): Promise<Record<string, string>> {
  const rows = await db.query.providerEnvProfile.findMany({
    where: and(eq(providerEnvProfile.user_id, userId)),
  });
  const envMap: Record<string, string> = {};
  const userBasePath = resolve(env.KEPLER_SESSIONS_PATH, userId);
  for (const row of rows) {
    const value = decryptValue({
      encryptedValue: row.encrypted_value,
      iv: row.iv,
      authTag: row.auth_tag,
    });
    if (isFilePathEnvKey(row.env_key)) {
      envMap[row.env_key] = isAbsolute(value) ? value : resolve(userBasePath, value);
      continue;
    }

    envMap[row.env_key] = value;
  }
  return envMap;
}
