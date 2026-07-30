<script lang="ts">
  import { api } from "$lib/api";
  import type { EnvSchema, NormalizedProvider } from "$lib/types";
  import ProviderCard from "$lib/components/settings/ProviderCard.svelte";
  import EnvProfileDialog from "$lib/components/settings/EnvProfileDialog.svelte";
  import OAuthDialog from "$lib/components/settings/OAuthDialog.svelte";

  interface Props {
    data: { normalizedProviders: NormalizedProvider[] };
    form: {
      error?: string;
      oauth?: { providerId: string; method: number; url: string; instructions: string };
    } | null;
  }

  const { data, form }: Props = $props();

  let envProvider = $state<NormalizedProvider | null>(null);
  let envSchema = $state<EnvSchema | null>(null);
  let envInitialValues = $state<Record<string, string>>({});
  let envOpen = $state(false);
  let envLoading = $state(false);

  let oauthProvider = $state<NormalizedProvider | null>(null);
  let oauthOpen = $state(false);

  $effect(() => {
    if (form?.oauth) {
      const matched = data.normalizedProviders.find(
        (p) => p.providerId === form.oauth!.providerId,
      );
      oauthProvider = matched ?? null;
      oauthOpen = true;
    }
  });

  async function openEnvDialog(provider: NormalizedProvider) {
    envProvider = provider;
    envLoading = true;
    envOpen = true;
    try {
      const [schemaRes, profileRes] = await Promise.all([
        api.api.providers({ providerId: provider.providerId })["env-schema"].get(),
        api.api.providers({ providerId: provider.providerId })["env-profile"].get(),
      ]);

      if (schemaRes.error || !schemaRes.data || "error" in schemaRes.data) return;
      const schema = schemaRes.data;
      const profile =
        profileRes.data && !("error" in profileRes.data) ? profileRes.data : null;

      envSchema = schema;
      const initial: Record<string, string> = {};
      for (const field of schema.envSchema) {
        const existing = profile?.values.find((v) => v.key === field.key);
        initial[field.key] = existing?.value ?? "";
      }
      envInitialValues = initial;
    } finally {
      envLoading = false;
    }
  }

  function closeEnvDialog() {
    envOpen = false;
    envProvider = null;
    envSchema = null;
    envInitialValues = {};
  }

  function closeOauthDialog() {
    oauthOpen = false;
    oauthProvider = null;
  }
</script>

<div class="space-y-8">
  <p class="text-sm text-muted-foreground">
    Manage your AI provider credentials. You need to authenticate with at least one provider to
    send messages.
  </p>

  {#if form?.error}
    <div
      class="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
      role="alert"
    >
      {form.error}
    </div>
  {/if}

  <div class="space-y-3">
    {#each data.normalizedProviders as provider (provider.providerId)}
      <ProviderCard {provider} onOpenEnv={openEnvDialog} />
    {/each}
  </div>
</div>

<EnvProfileDialog
  bind:open={envOpen}
  providerId={envProvider?.providerId ?? null}
  providerName={envProvider?.providerName ?? null}
  schema={envLoading ? null : envSchema}
  initialValues={envInitialValues}
  onClose={closeEnvDialog}
/>

<OAuthDialog
  bind:open={oauthOpen}
  providerId={form?.oauth?.providerId ?? null}
  providerName={oauthProvider?.providerName ?? null}
  method={form?.oauth?.method ?? null}
  url={form?.oauth?.url ?? ""}
  instructions={form?.oauth?.instructions ?? ""}
  onClose={closeOauthDialog}
/>
