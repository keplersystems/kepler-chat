import { Elysia, t } from "elysia";
import { db } from "@kepler-chat/db";
import {
  providerCredential,
  providerEnvProfile,
} from "@kepler-chat/db/schema/opencode";
import { and, eq } from "drizzle-orm";
import { opencodeManager } from "../services/opencode";
import { requireAuth } from "../middleware/auth";
import {
  decryptProviderPayload,
  encryptProviderPayload,
} from "../lib/provider-credentials";
import type { Auth as OpencodeAuth } from "@opencode-ai/sdk/v2";

const providerApiAuthSchema = t.Object({
  type: t.Literal("api"),
  key: t.String({ minLength: 1 }),
});

const providerWellKnownAuthSchema = t.Object({
  type: t.Literal("wellknown"),
  key: t.String({ minLength: 1 }),
  token: t.String({ minLength: 1 }),
});

const providerOAuthAuthorizeSchema = t.Object({
  method: t.Number({ minimum: 0 }),
});

const providerOAuthCallbackSchema = t.Object({
  method: t.Number({ minimum: 0 }),
  code: t.Optional(t.String({ minLength: 1 })),
});

type ProviderAuthMode = "oauth" | "api_key" | "manual_env";
type ProviderEnvInputKind = "text" | "secret" | "file_path";

interface ProviderListItem {
  id: string;
  name: string;
  env?: string[];
}

interface ProviderOAuthMethod {
  type: "oauth" | "api";
  label: string;
}

interface IndexedProviderOAuthMethod extends ProviderOAuthMethod {
  index: number;
}

interface ProviderEnvFieldSchema {
  key: string;
  required: true;
  inputKind: ProviderEnvInputKind;
  description: string;
}

interface ProviderEnvProfileStatus {
  configuredCount: number;
  totalCount: number;
  configuredKeys: string[];
  missingKeys: string[];
  ready: boolean;
}

const providerEnvProfileUpsertSchema = t.Object({
  values: t.Record(t.String({ minLength: 1 }), t.String({ minLength: 1 })),
});

function isSecretLikeEnvKey(value: string): boolean {
  return /(?:^|_)(?:API_KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY)(?:_|$)/i.test(
    value,
  );
}

function isFilePathEnvKey(value: string): boolean {
  return /(?:^|_)(?:CREDENTIALS|CERT|KEY_FILE|TOKEN_FILE|CONFIG_FILE)(?:_|$)/i.test(
    value,
  );
}

function buildProviderEnvSchema(envVars: string[]): ProviderEnvFieldSchema[] {
  return envVars.map((key) => {
    const inputKind: ProviderEnvInputKind = isFilePathEnvKey(key)
      ? "file_path"
      : isSecretLikeEnvKey(key)
        ? "secret"
        : "text";

    const description =
      inputKind === "file_path"
        ? "Filesystem path to credential/config file available to this user's sandbox"
        : inputKind === "secret"
          ? "Sensitive value; encrypted at rest"
          : "Provider configuration value";

    return {
      key,
      required: true,
      inputKind,
      description,
    };
  });
}

function getProviderFromList(
  providers: ProviderListItem[],
  providerId: string,
): ProviderListItem | null {
  const provider = providers.find((item) => item.id === providerId);
  return provider ?? null;
}

function normalizeProviderCapabilities(input: {
  provider: ProviderListItem;
  oauthMethods: IndexedProviderOAuthMethod[];
  connectedProviderIds: string[];
  envProfileStatus: ProviderEnvProfileStatus;
}) {
  const envVars = input.provider.env ?? [];
  const keyLikeEnvVars = envVars.filter((value) => isSecretLikeEnvKey(value));
  const envSchema = buildProviderEnvSchema(envVars);

  let authMode: ProviderAuthMode = "manual_env";
  if (input.oauthMethods.length > 0) {
    authMode = "oauth";
  } else if (keyLikeEnvVars.length === 1 && envVars.length === 1) {
    authMode = "api_key";
  }

  return {
    providerId: input.provider.id,
    providerName: input.provider.name,
    connected: input.connectedProviderIds.includes(input.provider.id),
    authMode,
    oauthMethods: input.oauthMethods,
    envSchema,
    envVars,
    keyLikeEnvVars,
    primaryApiKeyEnvVar: keyLikeEnvVars[0] ?? null,
    requiresAdditionalEnv: envVars.length > keyLikeEnvVars.length,
    envProfileStatus: input.envProfileStatus,
  };
}

function buildEnvProfileStatus(params: {
  envVars: string[];
  profileKeys: Set<string>;
}): ProviderEnvProfileStatus {
  const totalCount = params.envVars.length;
  const configuredKeys = params.envVars.filter((key) =>
    params.profileKeys.has(key),
  );
  const missingKeys = params.envVars.filter((key) => !params.profileKeys.has(key));
  const configuredCount = configuredKeys.length;

  return {
    configuredCount,
    totalCount,
    configuredKeys,
    missingKeys,
    ready: totalCount > 0 && configuredCount === totalCount,
  };
}

export const providersRoute = new Elysia({ prefix: "/api/providers" })
  .get(
    "/",
    async (context) => {
      const userId = await requireAuth(context);
      const { client } = await opencodeManager.getOrSpawnAnyForUser(userId);

      const [{ data: providers, error: providerError }, { data: auth, error: authError }] =
        await Promise.all([client.provider.list(), client.provider.auth()]);

      if (providerError || !providers) {
        throw new Error("Failed to fetch providers");
      }
      if (authError || !auth) {
        throw new Error("Failed to fetch provider auth methods");
      }

      const mirroredCredentials = await db.query.providerCredential.findMany({
        where: eq(providerCredential.user_id, userId),
      });
      const envProfileRows = await db.query.providerEnvProfile.findMany({
        where: eq(providerEnvProfile.user_id, userId),
      });
      const profileKeysByProvider = new Map<string, Set<string>>();
      for (const row of envProfileRows) {
        const set = profileKeysByProvider.get(row.provider_id) ?? new Set<string>();
        set.add(row.env_key);
        profileKeysByProvider.set(row.provider_id, set);
      }
      const oauthMethodMap = auth as Record<string, ProviderOAuthMethod[]>;
      const normalizedProviders = (providers.all as ProviderListItem[]).map(
        (provider) => {
          const oauthMethods = (oauthMethodMap[provider.id] ?? []).map(
            (method, index) => ({
              ...method,
              index,
            }),
          );
          const envProfileStatus = buildEnvProfileStatus({
            envVars: provider.env ?? [],
            profileKeys: profileKeysByProvider.get(provider.id) ?? new Set<string>(),
          });

          return normalizeProviderCapabilities({
            provider,
            oauthMethods,
            connectedProviderIds: providers.connected,
            envProfileStatus,
          });
        },
      );

      return {
        providers,
        normalizedProviders,
        mirroredCredentials: mirroredCredentials.map((credential) => ({
          providerId: credential.provider_id,
          authType: credential.auth_type,
          keyVersion: credential.key_version,
          updatedAt: credential.updated_at,
        })),
      };
    },
    {
      detail: {
        summary: "List providers",
        tags: ["Providers"],
        description:
          "List available providers/models, auth methods, and mirrored credential metadata for the authenticated user",
      },
    },
  )
  .get(
    "/:providerId/env-schema",
    async (context) => {
      const userId = await requireAuth(context);
      const { providerId } = context.params;
      const { client } = await opencodeManager.getOrSpawnAnyForUser(userId);
      const { data: providers, error } = await client.provider.list();
      if (error || !providers) {
        throw new Error("Failed to fetch providers");
      }

      const provider = getProviderFromList(
        providers.all as ProviderListItem[],
        providerId,
      );
      if (!provider) {
        context.set.status = 404;
        return { error: "Provider not found" };
      }

      const envSchema = buildProviderEnvSchema(provider.env ?? []);
      return {
        providerId,
        envSchema,
      };
    },
    {
      params: t.Object({
        providerId: t.String({ minLength: 1 }),
      }),
      detail: {
        summary: "Get provider env schema",
        tags: ["Providers"],
        description:
          "Get required environment variables for provider setup with input metadata",
      },
    },
  )
  .get(
    "/:providerId/env-profile",
    async (context) => {
      const userId = await requireAuth(context);
      const { providerId } = context.params;
      const { client } = await opencodeManager.getOrSpawnAnyForUser(userId);
      const { data: providers, error } = await client.provider.list();
      if (error || !providers) {
        throw new Error("Failed to fetch providers");
      }

      const provider = getProviderFromList(
        providers.all as ProviderListItem[],
        providerId,
      );
      if (!provider) {
        context.set.status = 404;
        return { error: "Provider not found" };
      }

      const envSchema = buildProviderEnvSchema(provider.env ?? []);
      const rows = await db.query.providerEnvProfile.findMany({
        where: (fields, { and, eq }) =>
          and(eq(fields.user_id, userId), eq(fields.provider_id, providerId)),
      });

      const byKey = new Map(rows.map((row) => [row.env_key, row]));
      const values = envSchema.map((field) => {
        const row = byKey.get(field.key);
        if (!row) {
          return {
            key: field.key,
            value: null,
            configured: false,
          };
        }

        const decrypted = decryptProviderPayload({
          encryptedPayload: row.encrypted_value,
          iv: row.iv,
          authTag: row.auth_tag,
        }) as { value?: string };

        return {
          key: field.key,
          value: field.inputKind === "secret" ? null : (decrypted.value ?? null),
          configured: true,
        };
      });

      return {
        providerId,
        values,
      };
    },
    {
      params: t.Object({
        providerId: t.String({ minLength: 1 }),
      }),
      detail: {
        summary: "Get provider env profile",
        tags: ["Providers"],
        description:
          "Get saved provider environment profile for the authenticated user (secrets are never returned)",
      },
    },
  )
  .put(
    "/:providerId/env-profile",
    async (context) => {
      const userId = await requireAuth(context);
      const { providerId } = context.params;
      const { values } = context.body;
      const { client } = await opencodeManager.getOrSpawnAnyForUser(userId);
      const { data: providers, error } = await client.provider.list();
      if (error || !providers) {
        throw new Error("Failed to fetch providers");
      }

      const provider = getProviderFromList(
        providers.all as ProviderListItem[],
        providerId,
      );
      if (!provider) {
        context.set.status = 404;
        return { error: "Provider not found" };
      }

      const envVars = provider.env ?? [];
      const allowed = new Set(envVars);
      const incomingEntries = Object.entries(values).filter(([, value]) => value.trim().length > 0);
      const invalidKeys = incomingEntries
        .map(([key]) => key)
        .filter((key) => !allowed.has(key));
      if (invalidKeys.length > 0) {
        context.set.status = 400;
        return { error: `Invalid env keys: ${invalidKeys.join(", ")}` };
      }

      const existingRows = await db.query.providerEnvProfile.findMany({
        where: (fields, { and, eq }) =>
          and(eq(fields.user_id, userId), eq(fields.provider_id, providerId)),
      });
      const existingKeys = new Set(existingRows.map((row) => row.env_key));
      const incomingKeys = new Set(incomingEntries.map(([key]) => key));
      const finalKeys = new Set([...existingKeys, ...incomingKeys]);

      for (const key of envVars) {
        if (!finalKeys.has(key)) {
          context.set.status = 400;
          return { error: `Missing required env value: ${key}` };
        }
      }

      for (const [key, value] of incomingEntries) {
        const encrypted = encryptProviderPayload({ value });
        await db
          .insert(providerEnvProfile)
          .values({
            user_id: userId,
            provider_id: providerId,
            env_key: key,
            encrypted_value: encrypted.encryptedPayload,
            iv: encrypted.iv,
            auth_tag: encrypted.authTag,
            key_version: 1,
          })
          .onConflictDoUpdate({
            target: [
              providerEnvProfile.user_id,
              providerEnvProfile.provider_id,
              providerEnvProfile.env_key,
            ],
            set: {
              encrypted_value: encrypted.encryptedPayload,
              iv: encrypted.iv,
              auth_tag: encrypted.authTag,
              key_version: 1,
              updated_at: new Date(),
            },
          });
      }

      await opencodeManager.teardownAllForUser(userId);

      return { success: true };
    },
    {
      params: t.Object({
        providerId: t.String({ minLength: 1 }),
      }),
      body: providerEnvProfileUpsertSchema,
      detail: {
        summary: "Save provider env profile",
        tags: ["Providers"],
        description:
          "Save encrypted provider environment values for the authenticated user and restart their OpenCode instances",
      },
    },
  )
  .post(
    "/:providerId/env-file/:envKey",
    async (context) => {
      const userId = await requireAuth(context);
      const { providerId, envKey } = context.params;
      const { file } = context.body;
      const { client } = await opencodeManager.getOrSpawnAnyForUser(userId);
      const { data: providers, error } = await client.provider.list();
      if (error || !providers) {
        throw new Error("Failed to fetch providers");
      }

      const provider = getProviderFromList(
        providers.all as ProviderListItem[],
        providerId,
      );
      if (!provider) {
        context.set.status = 404;
        return { error: "Provider not found" };
      }

      const envSchema = buildProviderEnvSchema(provider.env ?? []);
      const envField = envSchema.find((field) => field.key === envKey);
      if (!envField) {
        context.set.status = 400;
        return { error: "Invalid env key for provider" };
      }
      if (envField.inputKind !== "file_path") {
        context.set.status = 400;
        return { error: "Selected env key is not a file path field" };
      }

      if (!(file instanceof File)) {
        context.set.status = 400;
        return { error: "Missing file upload" };
      }

      const { env } = await import("@kepler-chat/env/server");
      const { join, resolve } = await import("path");
      const { mkdir, writeFile } = await import("fs/promises");
      const sanitizeSegment = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, "_");
      const safeProviderId = sanitizeSegment(providerId);
      const safeEnvKey = sanitizeSegment(envKey);
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const baseDir = resolve(
        env.KEPLER_SESSIONS_PATH,
        userId,
        "input",
        "provider-env",
        safeProviderId,
        safeEnvKey,
      );
      await mkdir(baseDir, { recursive: true });
      const filePath = join(baseDir, sanitizedName || "credential.bin");
      const bytes = new Uint8Array(await file.arrayBuffer());
      await writeFile(filePath, bytes);

      // Return absolute path — the OpenCode process runs with cwd set to
      // the conversation directory, so relative paths would resolve incorrectly.
      return { path: filePath };
    },
    {
      params: t.Object({
        providerId: t.String({ minLength: 1 }),
        envKey: t.String({ minLength: 1 }),
      }),
      body: t.Object({
        file: t.File(),
      }),
      detail: {
        summary: "Upload provider env file",
        tags: ["Providers"],
        description:
          "Upload a credential/config file for a provider env key and return sandbox path",
      },
    },
  )
  .delete(
    "/:providerId/env-profile",
    async (context) => {
      const userId = await requireAuth(context);
      const { providerId } = context.params;

      await db
        .delete(providerEnvProfile)
        .where(
          and(
            eq(providerEnvProfile.user_id, userId),
            eq(providerEnvProfile.provider_id, providerId),
          ),
        );

      await opencodeManager.teardownAllForUser(userId);

      return { success: true };
    },
    {
      params: t.Object({
        providerId: t.String({ minLength: 1 }),
      }),
      detail: {
        summary: "Delete provider env profile",
        tags: ["Providers"],
        description:
          "Delete stored provider environment profile for the authenticated user and restart their OpenCode instances",
      },
    },
  )
  .post(
    "/:providerId/auth",
    async (context) => {
      const userId = await requireAuth(context);
      const { providerId } = context.params;
      const payload = context.body as OpencodeAuth;

      // Propagate auth.set to every running instance so each isolated
      // XDG directory gets the new credential written.
      const allInstances = await opencodeManager.getAllForUser(userId);
      if (allInstances.length === 0) {
        // No running instances — spawn one to write the auth
        const { client } = await opencodeManager.getOrSpawnAnyForUser(userId);
        allInstances.push({ client } as typeof allInstances[0]);
      }

      for (const inst of allInstances) {
        const { data, error } = await inst.client.auth.set({
          providerID: providerId,
          auth: payload,
        });
        if (error || !data) {
          throw new Error("Failed to set provider auth");
        }
      }

      const encrypted = encryptProviderPayload(payload);
      await db
        .insert(providerCredential)
        .values({
          user_id: userId,
          provider_id: providerId,
          auth_type: payload.type,
          encrypted_payload: encrypted.encryptedPayload,
          iv: encrypted.iv,
          auth_tag: encrypted.authTag,
          key_version: 1,
        })
        .onConflictDoUpdate({
          target: [providerCredential.user_id, providerCredential.provider_id],
          set: {
            auth_type: payload.type,
            encrypted_payload: encrypted.encryptedPayload,
            iv: encrypted.iv,
            auth_tag: encrypted.authTag,
            key_version: 1,
            updated_at: new Date(),
          },
        });

      return { success: true };
    },
    {
      params: t.Object({
        providerId: t.String({ minLength: 1 }),
      }),
      body: t.Union([providerApiAuthSchema, providerWellKnownAuthSchema]),
      detail: {
        summary: "Set provider auth",
        tags: ["Providers"],
        description:
          "Set provider credentials in OpenCode and mirror the encrypted payload in Kepler DB",
      },
    },
  )
  .delete(
    "/:providerId/auth",
    async (context) => {
      const userId = await requireAuth(context);
      const { providerId } = context.params;
      // Propagate auth.remove to every running instance so each isolated
      // XDG directory has the credential removed.
      const allInstances = await opencodeManager.getAllForUser(userId);
      if (allInstances.length === 0) {
        const { client } = await opencodeManager.getOrSpawnAnyForUser(userId);
        allInstances.push({ client } as typeof allInstances[0]);
      }

      for (const inst of allInstances) {
        const { data, error } = await inst.client.auth.remove({
          providerID: providerId,
        });
        if (error || !data) {
          throw new Error("Failed to remove provider auth");
        }
      }

      await db
        .delete(providerCredential)
        .where(
          and(
            eq(providerCredential.user_id, userId),
            eq(providerCredential.provider_id, providerId),
          ),
        );

      return { success: true };
    },
    {
      params: t.Object({
        providerId: t.String({ minLength: 1 }),
      }),
      detail: {
        summary: "Remove provider auth",
        tags: ["Providers"],
        description:
          "Remove provider credentials from OpenCode and delete mirrored Kepler DB credential row",
      },
    },
  )
  .post(
    "/:providerId/oauth/authorize",
    async (context) => {
      const userId = await requireAuth(context);
      const { providerId } = context.params;
      const { method } = context.body;
      const { client } = await opencodeManager.getOrSpawnAnyForUser(userId);

      const { data, error } = await client.provider.oauth.authorize({
        providerID: providerId,
        method,
      });

      if (error || !data) {
        throw new Error("Failed to authorize provider oauth");
      }

      return data;
    },
    {
      params: t.Object({
        providerId: t.String({ minLength: 1 }),
      }),
      body: providerOAuthAuthorizeSchema,
      detail: {
        summary: "Start provider OAuth",
        tags: ["Providers"],
        description: "Get provider OAuth authorization URL and flow instructions",
      },
    },
  )
  .post(
    "/:providerId/oauth/callback",
    async (context) => {
      const userId = await requireAuth(context);
      const { providerId } = context.params;
      const payload = context.body;
      const { client } = await opencodeManager.getOrSpawnAnyForUser(userId);

      const { data, error } = await client.provider.oauth.callback({
        providerID: providerId,
        method: payload.method,
        code: payload.code,
      });

      if (error || !data) {
        throw new Error("Failed to complete provider oauth callback");
      }

      const encrypted = encryptProviderPayload({
        type: "oauth",
        providerId,
        method: payload.method,
        code: payload.code ?? null,
        mirroredAt: Date.now(),
      });

      await db
        .insert(providerCredential)
        .values({
          user_id: userId,
          provider_id: providerId,
          auth_type: "oauth",
          encrypted_payload: encrypted.encryptedPayload,
          iv: encrypted.iv,
          auth_tag: encrypted.authTag,
          key_version: 1,
        })
        .onConflictDoUpdate({
          target: [providerCredential.user_id, providerCredential.provider_id],
          set: {
            auth_type: "oauth",
            encrypted_payload: encrypted.encryptedPayload,
            iv: encrypted.iv,
            auth_tag: encrypted.authTag,
            key_version: 1,
            updated_at: new Date(),
          },
        });

      return { success: true };
    },
    {
      params: t.Object({
        providerId: t.String({ minLength: 1 }),
      }),
      body: providerOAuthCallbackSchema,
      detail: {
        summary: "Complete provider OAuth",
        tags: ["Providers"],
        description:
          "Complete provider OAuth callback in OpenCode and mirror encrypted callback payload metadata in Kepler DB",
      },
    },
  );
