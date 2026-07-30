<script lang="ts">
  import { enhance } from "$app/forms";
  import type { NormalizedProvider } from "$lib/types";
  import { Button } from "$lib/components/ui/button";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import ProviderLogo from "$lib/components/ui/ProviderLogo.svelte";
  import { getProviderIconSvg } from "$lib/providerIcons";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";

  interface Props {
    provider: NormalizedProvider;
    onOpenEnv: (provider: NormalizedProvider) => void;
  }

  const { provider, onOpenEnv }: Props = $props();

  const status = $derived(getStatus(provider));
  const configuredCount = $derived(provider.envProfileStatus.configuredCount);
  const fullyConfigured = $derived(provider.envProfileStatus.ready);

  function getStatus(p: NormalizedProvider): { label: string; dot: string } {
    if (p.connected || p.envProfileStatus.ready) return { label: "Ready", dot: "bg-primary" };
    if (p.envProfileStatus.configuredCount > 0) {
      return { label: "Partially configured", dot: "bg-muted-foreground" };
    }
    return { label: "Not configured", dot: "bg-muted-foreground/40" };
  }
</script>

<div class="kepler-provider-card rounded-lg border border-border bg-card shadow-xs">
  <Collapsible.Root>
    <Collapsible.Trigger
      class="group flex w-full items-center justify-between rounded-lg p-4 text-left transition-colors duration-200 ease-out hover:bg-accent/50 data-[state=open]:rounded-b-none"
    >
      <div class="flex items-center gap-3">
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted transition-transform duration-300 ease-out group-hover:scale-105"
        >
          {#if getProviderIconSvg(provider.providerId)}
            <ProviderLogo providerId={provider.providerId} size={20} />
          {:else}
            <span class="font-mono text-sm font-medium text-muted-foreground">
              {provider.providerName.charAt(0).toUpperCase()}
            </span>
          {/if}
        </div>
        <div>
          <h3 class="font-semibold">{provider.providerName}</h3>
          <p class="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            {#if provider.authMode === "oauth"}
              OAuth authentication
            {:else if provider.authMode === "api_key"}
              API key authentication
            {:else}
              Environment variables
            {/if}
            <span class="inline-flex items-center gap-1.5 text-xs">
              <span class="h-1.5 w-1.5 rounded-full {status.dot}" aria-hidden="true"></span>
              {status.label}
            </span>
          </p>
        </div>
      </div>
      <ChevronDownIcon
        size={20}
        class="shrink-0 text-muted-foreground transition-transform duration-300 ease-out group-data-[state=open]:rotate-180"
      />
    </Collapsible.Trigger>

    <Collapsible.Content
      class="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down"
    >
      <div class="border-t border-border px-4 pb-4">
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
          {:else}
            <div class="space-y-2">
              {#if fullyConfigured}
                <div class="flex items-center justify-between gap-3">
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
                  <p class="text-sm font-medium">Partially configured</p>
                  <p class="font-mono text-xs text-muted-foreground">
                    Configured: {provider.envProfileStatus.configuredKeys.join(", ")}
                  </p>
                  <p class="font-mono text-xs text-destructive">
                    Missing: {provider.envProfileStatus.missingKeys.join(", ")}
                  </p>
                  <Button size="sm" onclick={() => onOpenEnv(provider)}>Complete Setup</Button>
                </div>
              {:else}
                <div class="space-y-2">
                  <p class="text-sm font-medium">Environment Setup Required</p>
                  <p class="text-xs text-muted-foreground">
                    This provider requires {provider.envVars.length} environment variables
                  </p>
                  <Button size="sm" onclick={() => onOpenEnv(provider)}>Guided Setup</Button>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </Collapsible.Content>
  </Collapsible.Root>
</div>

<style>
  .kepler-provider-card {
    transition:
      box-shadow var(--duration-fast) var(--ease-smooth-out),
      border-color var(--duration-fast) var(--ease-smooth-out),
      transform var(--duration-fast) var(--ease-smooth-out);
  }
  .kepler-provider-card:hover {
    box-shadow: var(--shadow-sm);
  }
  .kepler-provider-card:has(:global([data-state="open"])) {
    box-shadow: var(--shadow);
    border-color: color-mix(in oklch, var(--ring) 18%, var(--border));
  }
</style>
