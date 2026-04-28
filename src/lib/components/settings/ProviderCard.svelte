<script lang="ts">
  import { enhance } from "$app/forms";
  import type { NormalizedProvider } from "$lib/types";
  import { Button } from "$lib/components/ui/button";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";

  interface Props {
    provider: NormalizedProvider;
    onOpenEnv: (provider: NormalizedProvider) => void;
  }

  const { provider, onOpenEnv }: Props = $props();

  const status = $derived(getStatus(provider));
  const configuredCount = $derived(provider.envProfileStatus?.configuredCount ?? 0);
  const totalCount = $derived(provider.envProfileStatus?.totalCount ?? 0);
  const fullyConfigured = $derived(
    configuredCount > 0 && configuredCount === totalCount && totalCount > 0,
  );

  function getStatus(p: NormalizedProvider): { label: string; color: string } {
    if (p.connected) return { label: "Ready", color: "text-green-600" };
    const { configuredCount: cc = 0, totalCount: tc = 0 } = p.envProfileStatus ?? {};
    if (cc === tc && tc > 0) return { label: "Ready", color: "text-green-600" };
    if (cc > 0) return { label: "Partially configured", color: "text-amber-600" };
    return { label: "Not configured", color: "text-muted-foreground" };
  }
</script>

<div class="rounded-2xl border bg-card shadow-xs">
  <Collapsible.Root>
    <Collapsible.Trigger
      class="group flex w-full items-center justify-between p-4 text-left hover:bg-accent/50 rounded-2xl transition-colors data-[state=open]:rounded-b-none"
    >
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
          <SparklesIcon size={20} class="text-primary" />
        </div>
        <div>
          <h3 class="font-semibold">{provider.providerName}</h3>
          <p class="text-sm text-muted-foreground">
            {#if provider.authMode === "oauth"}
              OAuth authentication
            {:else if provider.authMode === "api_key"}
              API key authentication
            {:else if provider.authMode === "manual_env"}
              Environment variables
            {:else}
              No authentication required
            {/if}
            <span class="ml-2 {status.color}">● {status.label}</span>
          </p>
        </div>
      </div>
      <ChevronDownIcon size={20} class="text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
    </Collapsible.Trigger>

    <Collapsible.Content>
      <div class="border-t px-4 pb-4">
        <div class="pt-3">
          {#if provider.authMode === "oauth"}
            <div class="space-y-2">
              <p class="text-sm font-medium">OAuth Authentication</p>
              <p class="text-xs text-muted-foreground">Choose a method to connect:</p>
              <div class="flex flex-wrap gap-2">
                {#each provider.oauthMethods as method (method.index)}
                  <form method="POST" action="?/startOAuth" use:enhance>
                    <input type="hidden" name="providerId" value={provider.providerId} />
                    <input type="hidden" name="method" value={method.index} />
                    <Button type="submit" size="sm" variant="outline">{method.label}</Button>
                  </form>
                {/each}
              </div>
            </div>
          {:else if provider.authMode === "api_key" || provider.authMode === "manual_env"}
            <div class="space-y-2">
              {#if fullyConfigured}
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm font-medium">Configured</p>
                    <p class="text-xs text-muted-foreground">
                      {configuredCount} environment variables set
                    </p>
                  </div>
                  <div class="flex gap-2">
                    <Button variant="outline" size="sm" onclick={() => onOpenEnv(provider)}>
                      Edit
                    </Button>
                    <form method="POST" action="?/removeEnvProfile" use:enhance>
                      <input type="hidden" name="providerId" value={provider.providerId} />
                      <Button type="submit" variant="outline" size="sm">Remove</Button>
                    </form>
                  </div>
                </div>
              {:else if configuredCount > 0}
                <div class="space-y-2">
                  <p class="text-sm font-medium text-amber-600">Partially Configured</p>
                  <p class="text-xs text-muted-foreground">
                    Configured: {provider.envProfileStatus?.configuredKeys.join(", ")}
                  </p>
                  <p class="text-xs text-destructive">
                    Missing: {provider.envProfileStatus?.missingKeys.join(", ")}
                  </p>
                  <Button size="sm" onclick={() => onOpenEnv(provider)}>
                    Complete Setup
                  </Button>
                </div>
              {:else}
                <div class="space-y-2">
                  <p class="text-sm font-medium">Environment Setup Required</p>
                  <p class="text-xs text-muted-foreground">
                    This provider requires {provider.envVars.length} environment variables
                  </p>
                  <Button size="sm" onclick={() => onOpenEnv(provider)}>
                    Guided Setup
                  </Button>
                </div>
              {/if}
            </div>
          {:else}
            <p class="text-sm text-muted-foreground">No authentication required</p>
          {/if}
        </div>
      </div>
    </Collapsible.Content>
  </Collapsible.Root>
</div>
