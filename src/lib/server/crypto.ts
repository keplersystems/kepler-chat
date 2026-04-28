import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "$lib/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getCredentialKey(): Buffer {
  const key = Buffer.from(env.KEPLER_PROVIDER_CREDENTIALS_KEY, "base64");
  if (key.length !== 32) {
    throw new Error("Invalid credentials encryption key length");
  }
  return key;
}

export interface EncryptedPayload {
  encryptedPayload: string;
  iv: string;
  authTag: string;
}

export function encryptProviderPayload(payload: unknown): EncryptedPayload {
  const key = getCredentialKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    encryptedPayload: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptProviderPayload(payload: EncryptedPayload): unknown {
  const key = getCredentialKey();
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.encryptedPayload, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8"));
}
