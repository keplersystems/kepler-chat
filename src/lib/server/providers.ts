import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  Auth as OpencodeAuth,
  Provider,
  ProviderAuthAuthorization,
  ProviderAuthMethod,
  ProviderListResponse,
} from "@opencode-ai/sdk/v2";
import { eq } from "drizzle-orm";
import { env } from "$lib/env";
import { db } from "$lib/server/db/client";
import { providerEnvProfile } from "$lib/server/db/schema/opencode";
import { encryptProviderPayload } from "$lib/server/crypto";
import { HttpError } from "$lib/server/http-error";
import {
  decryptEnvProfileValue,
  isFilePathEnvKey,
  isSecretLikeEnvKey,
} from "$lib/server/opencode/provider-env";
import { opencodeServer } from "$lib/server/opencode/supervisor";
import type {
  EnvProfile,
  EnvSchemaField,
  NormalizedProvider,
} from "$lib/types";

export interface ProviderCatalog {
  providers: ProviderListResponse;
  auth: Record<string, ProviderAuthMethod[]>;
}

// provider.list() costs ~350ms in OpenCode; cache briefly and drop the cache
// whenever credentials or env profiles change.
let catalogCache: (ProviderCatalog & { at: number }) | null = null;
const CATALOG_TTL_MS = 60_000;

export function invalidateProviderCatalog(): void {
  catalogCache = null;
}

export async function loadProviderCatalog(): Promise<ProviderCatalog> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache;
  const { client } = await opencodeServer.client();
  const [providersRes, authRes] = await Promise.all([
    client.provider.list(),
    client.provider.auth(),
  ]);
  if (providersRes.error || !providersRes.data) {
    throw new Error("Failed to fetch providers");
  }
  if (authRes.error || !authRes.data) {
    throw new Error("Failed to fetch provider auth methods");
  }
  catalogCache = { providers: providersRes.data, auth: authRes.data, at: Date.now() };
  return catalogCache;
}

export async function requireProvider(providerId: string): Promise<Provider> {
  const { providers } = await loadProviderCatalog();
  const provider = providers.all.find((p) => p.id === providerId);
  if (!provider) throw new HttpError(404, "Provider not found");
  return provider;
}

export function buildProviderEnvSchema(envVars: string[]): EnvSchemaField[] {
  return envVars.map((key) => {
    const inputKind = isFilePathEnvKey(key)
      ? "file_path"
      : isSecretLikeEnvKey(key)
        ? "secret"
        : "text";

    const description =
      inputKind === "file_path"
        ? "Filesystem path to credential/config file available to OpenCode"
        : inputKind === "secret"
          ? "Sensitive value; encrypted at rest"
          : "Provider configuration value";

    return { key, required: true, inputKind, description };
  });
}

function normalizeProvider(
  provider: Provider,
  oauthMethods: ProviderAuthMethod[],
  connectedProviderIds: string[],
  profileKeys: Set<string>,
): NormalizedProvider {
  const envVars = provider.env;
  const keyLikeEnvVars = envVars.filter(isSecretLikeEnvKey);
  const configuredKeys = envVars.filter((key) => profileKeys.has(key));

  let authMode: NormalizedProvider["authMode"] = "manual_env";
  if (oauthMethods.length > 0) {
    authMode = "oauth";
  } else if (keyLikeEnvVars.length === 1 && envVars.length === 1) {
    authMode = "api_key";
  }

  return {
    providerId: provider.id,
    providerName: provider.name,
    connected: connectedProviderIds.includes(provider.id),
    authMode,
    oauthMethods: oauthMethods.map((method, index) => ({
      index,
      type: method.type,
      label: method.label,
    })),
    envVars,
    keyLikeEnvVars,
    primaryApiKeyEnvVar: keyLikeEnvVars[0] ?? null,
    requiresAdditionalEnv: envVars.length > keyLikeEnvVars.length,
    envProfileStatus: {
      configuredCount: configuredKeys.length,
      totalCount: envVars.length,
      configuredKeys,
      missingKeys: envVars.filter((key) => !profileKeys.has(key)),
      ready: envVars.length > 0 && configuredKeys.length === envVars.length,
    },
  };
}

export async function listProviders(): Promise<{
  providers: ProviderListResponse;
  normalizedProviders: NormalizedProvider[];
}> {
  const { providers, auth } = await loadProviderCatalog();
  const envProfileRows = await db.query.providerEnvProfile.findMany();
  const profileKeysByProvider = new Map<string, Set<string>>();
  for (const row of envProfileRows) {
    const set = profileKeysByProvider.get(row.provider_id) ?? new Set<string>();
    set.add(row.env_key);
    profileKeysByProvider.set(row.provider_id, set);
  }

  const normalizedProviders = providers.all.map((provider) =>
    normalizeProvider(
      provider,
      auth[provider.id] ?? [],
      providers.connected,
      profileKeysByProvider.get(provider.id) ?? new Set<string>(),
    ),
  );

  return { providers, normalizedProviders };
}

export async function getEnvSchema(providerId: string): Promise<EnvSchemaField[]> {
  const provider = await requireProvider(providerId);
  return buildProviderEnvSchema(provider.env);
}

export async function getEnvProfile(providerId: string): Promise<EnvProfile> {
  const provider = await requireProvider(providerId);
  const envSchema = buildProviderEnvSchema(provider.env);
  const rows = await db.query.providerEnvProfile.findMany({
    where: (fields, { eq }) => eq(fields.provider_id, providerId),
  });
  const byKey = new Map(rows.map((row) => [row.env_key, row]));

  return {
    providerId,
    values: envSchema.map((field) => {
      const row = byKey.get(field.key);
      if (!row) return { key: field.key, value: null, configured: false };
      return {
        key: field.key,
        value: field.inputKind === "secret" ? null : decryptEnvProfileValue(row),
        configured: true,
      };
    }),
  };
}

export async function saveEnvProfile(
  providerId: string,
  values: Record<string, string>,
): Promise<void> {
  const provider = await requireProvider(providerId);
  const allowed = new Set(provider.env);
  const incoming = Object.entries(values).filter(([, value]) => value.trim().length > 0);
  const invalidKeys = incoming.map(([key]) => key).filter((key) => !allowed.has(key));
  if (invalidKeys.length > 0) {
    throw new HttpError(400, `Invalid env keys: ${invalidKeys.join(", ")}`);
  }

  const existingRows = await db.query.providerEnvProfile.findMany({
    where: (fields, { eq }) => eq(fields.provider_id, providerId),
  });
  const finalKeys = new Set([
    ...existingRows.map((row) => row.env_key),
    ...incoming.map(([key]) => key),
  ]);
  for (const key of provider.env) {
    if (!finalKeys.has(key)) {
      throw new HttpError(400, `Missing required env value: ${key}`);
    }
  }

  for (const [key, value] of incoming) {
    const encrypted = encryptProviderPayload({ value });
    await db
      .insert(providerEnvProfile)
      .values({
        provider_id: providerId,
        env_key: key,
        encrypted_value: encrypted.encryptedPayload,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        key_version: 1,
      })
      .onConflictDoUpdate({
        target: [providerEnvProfile.provider_id, providerEnvProfile.env_key],
        set: {
          encrypted_value: encrypted.encryptedPayload,
          iv: encrypted.iv,
          auth_tag: encrypted.authTag,
          key_version: 1,
          updated_at: new Date(),
        },
      });
  }

  await opencodeServer.restart();
  invalidateProviderCatalog();
}

export async function deleteEnvProfile(providerId: string): Promise<void> {
  await db
    .delete(providerEnvProfile)
    .where(eq(providerEnvProfile.provider_id, providerId));
  await opencodeServer.restart();
  invalidateProviderCatalog();
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function saveEnvFile(
  providerId: string,
  envKey: string,
  file: File,
): Promise<string> {
  const provider = await requireProvider(providerId);
  const field = buildProviderEnvSchema(provider.env).find((f) => f.key === envKey);
  if (!field) throw new HttpError(400, "Invalid env key for provider");
  if (field.inputKind !== "file_path") {
    throw new HttpError(400, "Selected env key is not a file path field");
  }

  const baseDir = resolve(
    env.KEPLER_SESSIONS_PATH,
    "provider-env",
    sanitizeSegment(providerId),
    sanitizeSegment(envKey),
  );
  await mkdir(baseDir, { recursive: true });
  // Absolute path — the OpenCode process runs with cwd set to the
  // conversation directory, so relative paths would resolve incorrectly.
  const filePath = join(baseDir, sanitizeSegment(file.name) || "credential.bin");
  await writeFile(filePath, new Uint8Array(await file.arrayBuffer()));
  return filePath;
}

export async function setProviderAuth(
  providerId: string,
  auth: OpencodeAuth,
): Promise<void> {
  const { client } = await opencodeServer.client();
  const { data, error } = await client.auth.set({ providerID: providerId, auth });
  if (error || !data) throw new Error("Failed to set provider auth");
  invalidateProviderCatalog();
}

export async function removeProviderAuth(providerId: string): Promise<void> {
  const { client } = await opencodeServer.client();
  const { data, error } = await client.auth.remove({ providerID: providerId });
  if (error || !data) throw new Error("Failed to remove provider auth");
  invalidateProviderCatalog();
}

export async function authorizeProviderOAuth(
  providerId: string,
  method: number,
): Promise<ProviderAuthAuthorization> {
  const { client } = await opencodeServer.client();
  const { data, error } = await client.provider.oauth.authorize({
    providerID: providerId,
    method,
  });
  if (error || !data) throw new Error("Failed to authorize provider oauth");
  return data;
}

export async function completeProviderOAuth(
  providerId: string,
  method: number,
  code?: string,
): Promise<void> {
  const { client } = await opencodeServer.client();
  const { data, error } = await client.provider.oauth.callback({
    providerID: providerId,
    method,
    code,
  });
  if (error || !data) throw new Error("Failed to complete provider oauth callback");
  invalidateProviderCatalog();
}
