import { Elysia, t } from "elysia";
import { requireAuth } from "$lib/server/auth";
import {
  authorizeProviderOAuth,
  completeProviderOAuth,
  deleteEnvProfile,
  getEnvProfile,
  getEnvSchema,
  listProviders,
  removeProviderAuth,
  saveEnvFile,
  saveEnvProfile,
  setProviderAuth,
} from "$lib/server/providers";

const providerParamsSchema = t.Object({
  providerId: t.String({ minLength: 1 }),
});

const providerApiAuthSchema = t.Object({
  type: t.Literal("api"),
  key: t.String({ minLength: 1 }),
});

const providerWellKnownAuthSchema = t.Object({
  type: t.Literal("wellknown"),
  key: t.String({ minLength: 1 }),
  token: t.String({ minLength: 1 }),
});

export const providersRoute = new Elysia({ prefix: "/api/providers" })
  .get(
    "/",
    async (context) => {
      requireAuth(context);
      return listProviders();
    },
    {
      detail: {
        summary: "List providers",
        tags: ["Providers"],
        description: "List available providers/models and auth methods",
      },
    },
  )
  .get(
    "/:providerId/env-schema",
    async (context) => {
      requireAuth(context);
      const { providerId } = context.params;
      return { providerId, envSchema: await getEnvSchema(providerId) };
    },
    {
      params: providerParamsSchema,
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
      requireAuth(context);
      return getEnvProfile(context.params.providerId);
    },
    {
      params: providerParamsSchema,
      detail: {
        summary: "Get provider env profile",
        tags: ["Providers"],
        description:
          "Get saved provider environment profile (secrets are never returned)",
      },
    },
  )
  .put(
    "/:providerId/env-profile",
    async (context) => {
      requireAuth(context);
      await saveEnvProfile(context.params.providerId, context.body.values);
      return { success: true };
    },
    {
      params: providerParamsSchema,
      body: t.Object({
        values: t.Record(t.String({ minLength: 1 }), t.String({ minLength: 1 })),
      }),
      detail: {
        summary: "Save provider env profile",
        tags: ["Providers"],
        description:
          "Save encrypted provider environment values and restart the OpenCode server",
      },
    },
  )
  .post(
    "/:providerId/env-file/:envKey",
    async (context) => {
      requireAuth(context);
      const { providerId, envKey } = context.params;
      return { path: await saveEnvFile(providerId, envKey, context.body.file) };
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
      requireAuth(context);
      await deleteEnvProfile(context.params.providerId);
      return { success: true };
    },
    {
      params: providerParamsSchema,
      detail: {
        summary: "Delete provider env profile",
        tags: ["Providers"],
        description:
          "Delete stored provider environment profile and restart the OpenCode server",
      },
    },
  )
  .post(
    "/:providerId/auth",
    async (context) => {
      requireAuth(context);
      await setProviderAuth(context.params.providerId, context.body);
      return { success: true };
    },
    {
      params: providerParamsSchema,
      body: t.Union([providerApiAuthSchema, providerWellKnownAuthSchema]),
      detail: {
        summary: "Set provider auth",
        tags: ["Providers"],
        description: "Set provider credentials in OpenCode",
      },
    },
  )
  .delete(
    "/:providerId/auth",
    async (context) => {
      requireAuth(context);
      await removeProviderAuth(context.params.providerId);
      return { success: true };
    },
    {
      params: providerParamsSchema,
      detail: {
        summary: "Remove provider auth",
        tags: ["Providers"],
        description: "Remove provider credentials from OpenCode",
      },
    },
  )
  .post(
    "/:providerId/oauth/authorize",
    async (context) => {
      requireAuth(context);
      return authorizeProviderOAuth(context.params.providerId, context.body.method);
    },
    {
      params: providerParamsSchema,
      body: t.Object({
        method: t.Number({ minimum: 0 }),
      }),
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
      requireAuth(context);
      const { method, code } = context.body;
      await completeProviderOAuth(context.params.providerId, method, code);
      return { success: true };
    },
    {
      params: providerParamsSchema,
      body: t.Object({
        method: t.Number({ minimum: 0 }),
        code: t.Optional(t.String({ minLength: 1 })),
      }),
      detail: {
        summary: "Complete provider OAuth",
        tags: ["Providers"],
        description: "Complete provider OAuth callback in OpenCode",
      },
    },
  );
