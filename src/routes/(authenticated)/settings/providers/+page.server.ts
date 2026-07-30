import { error, fail } from "@sveltejs/kit";
import { serverApi } from "$lib/api";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch, url }) => {
  const api = serverApi(fetch, url.origin);
  const { data, error: err } = await api.api.providers.get();
  if (err || !data) throw error(500, "Failed to load providers");
  return { normalizedProviders: data.normalizedProviders };
};

export const actions: Actions = {
  saveEnvProfile: async ({ request, fetch, url }) => {
    const formData = await request.formData();
    const providerId = formData.get("providerId");
    if (typeof providerId !== "string" || providerId.length === 0) {
      return fail(400, { error: "providerId required" });
    }

    const api = serverApi(fetch, url.origin);
    const values: Record<string, string> = {};

    for (const [key, raw] of formData.entries()) {
      if (key === "providerId") continue;
      if (typeof raw === "string") {
        if (raw.trim().length > 0) values[key] = raw;
        continue;
      }
      const file = raw as File;
      if (file.size === 0) continue;
      const { data, error: uploadErr } = await api.api
        .providers({ providerId })
        ["env-file"]({ envKey: key })
        .post({ file });
      if (uploadErr || !data || "error" in data) {
        return fail(500, { error: `Failed to upload ${key}` });
      }
      values[key] = data.path;
    }

    const { error: putErr } = await api.api
      .providers({ providerId })
      ["env-profile"].put({ values });
    if (putErr) return fail(500, { error: "Failed to save env profile" });

    return { success: true };
  },

  removeEnvProfile: async ({ request, fetch, url }) => {
    const providerId = (await request.formData()).get("providerId");
    if (typeof providerId !== "string") return fail(400, { error: "providerId required" });

    const api = serverApi(fetch, url.origin);
    const { error: err } = await api.api.providers({ providerId })["env-profile"].delete();
    if (err) return fail(500, { error: "Failed to remove env profile" });
    return { success: true };
  },

  startOAuth: async ({ request, fetch, url }) => {
    const formData = await request.formData();
    const providerId = formData.get("providerId");
    const methodRaw = formData.get("method");
    if (typeof providerId !== "string" || typeof methodRaw !== "string") {
      return fail(400, { error: "providerId and method required" });
    }
    const method = Number(methodRaw);
    if (!Number.isFinite(method) || method < 0) {
      return fail(400, { error: "Invalid method" });
    }

    const api = serverApi(fetch, url.origin);
    const { data, error: err } = await api.api
      .providers({ providerId })
      .oauth.authorize.post({ method });
    if (err || !data) return fail(500, { error: "Failed to start OAuth" });

    return {
      oauth: {
        providerId,
        method,
        url: data.url,
        instructions: data.instructions,
      },
    };
  },

  completeOAuth: async ({ request, fetch, url }) => {
    const formData = await request.formData();
    const providerId = formData.get("providerId");
    const methodRaw = formData.get("method");
    const codeRaw = formData.get("code");
    if (typeof providerId !== "string" || typeof methodRaw !== "string") {
      return fail(400, { error: "providerId and method required" });
    }
    const method = Number(methodRaw);
    if (!Number.isFinite(method) || method < 0) {
      return fail(400, { error: "Invalid method" });
    }
    const code =
      typeof codeRaw === "string" && codeRaw.trim().length > 0 ? codeRaw.trim() : undefined;

    const api = serverApi(fetch, url.origin);
    const { error: err } = await api.api
      .providers({ providerId })
      .oauth.callback.post({ method, code });
    if (err) return fail(500, { error: "Failed to complete OAuth" });
    return { success: true };
  },
};
