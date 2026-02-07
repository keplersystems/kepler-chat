import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "file:test.db";
process.env.BETTER_AUTH_SECRET ??= "test-secret-abcdefghijklmnopqrstuvwxyz";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.CORS_ORIGIN ??= "http://localhost:5173";
process.env.KEPLER_SESSIONS_PATH ??= "/tmp/kepler-test-sessions";
process.env.KEPLER_PROVIDER_CREDENTIALS_KEY ??= Buffer.alloc(32, 2).toString(
  "base64",
);

const { decryptProviderPayload, encryptProviderPayload } = await import(
  "./provider-credentials"
);

describe("provider credential crypto", () => {
  it("round-trips encrypted payload", () => {
    const payload = { type: "api", key: "secret-value" };
    const encrypted = encryptProviderPayload(payload);
    const decrypted = decryptProviderPayload(encrypted);

    expect(decrypted).toEqual(payload);
  });

  it("uses non-deterministic IVs", () => {
    const payload = { type: "api", key: "secret-value" };
    const first = encryptProviderPayload(payload);
    const second = encryptProviderPayload(payload);

    expect(first.encryptedPayload).not.toBe(second.encryptedPayload);
    expect(first.iv).not.toBe(second.iv);
  });
});
