<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { replaceState } from "$app/navigation";
  import { api, apiErrorMessage } from "$lib/api";
  import { CONNECTOR_PRESETS, type ConnectorPreset } from "$lib/connectors";
  import type { McpServerEntry } from "$lib/server/mcp";
  import McpServerManager from "$lib/components/mcp/McpServerManager.svelte";
  import { Button } from "$lib/components/ui/button";
  import { IconButton } from "$lib/components/ui/icon-button";
  import { ThinkingOrb } from "$lib/components/ui/orb";
  import XIcon from "@lucide/svelte/icons/x";

  const presetNames = CONNECTOR_PRESETS.map((preset) => preset.name);

  function presetTitle(name: string): string {
    return CONNECTOR_PRESETS.find((preset) => preset.name === name)?.title ?? name;
  }

  const connectedParam = page.url.searchParams.get("connected");
  const errorParam = page.url.searchParams.get("error");
  let banner = $state(
    connectedParam
      ? { kind: "success" as const, text: `${presetTitle(connectedParam)} connected.` }
      : errorParam
        ? { kind: "error" as const, text: `Connection failed: ${errorParam}` }
        : null,
  );

  let servers = $state<McpServerEntry[] | null>(null);
  let loadError = $state<string | null>(null);
  let busy = $state<string | null>(null);

  onMount(() => {
    if (connectedParam || errorParam) replaceState("/customize/connectors", {});
    loadServers();
  });

  async function loadServers() {
    const { data, error } = await api.api.mcp.get({ query: {} });
    if (error) {
      loadError = apiErrorMessage(error.value, "Failed to load connectors");
      return;
    }
    servers = data.servers as McpServerEntry[];
    loadError = null;
  }

  function entryFor(preset: ConnectorPreset): McpServerEntry | null {
    return servers?.find((server) => server.name === preset.name) ?? null;
  }

  function fail(text: string) {
    banner = { kind: "error", text };
    busy = null;
  }

  async function startAuth(name: string) {
    const { data, error } = await api.api.mcp({ name }).auth.post({});
    if (error || !data) {
      fail(apiErrorMessage(error?.value, `Failed to start authentication for ${presetTitle(name)}`));
      return;
    }
    window.location.href = data.authorizationUrl;
  }

  async function add(preset: ConnectorPreset) {
    busy = preset.name;
    const { error } = await api.api
      .mcp({ name: preset.name })
      .put({ config: { type: "remote", url: preset.url, oauth: {} } });
    if (error) {
      fail(apiErrorMessage(error.value, `Failed to add ${preset.title}`));
      return;
    }
    // Only launch OAuth when the server actually demands it — some connectors
    // (e.g. Context7) connect without authentication.
    await loadServers();
    if (entryFor(preset)?.status?.status === "needs_auth") {
      await startAuth(preset.name);
      return;
    }
    busy = null;
  }

  function connect(preset: ConnectorPreset) {
    busy = preset.name;
    startAuth(preset.name);
  }

  async function disconnect(preset: ConnectorPreset) {
    busy = preset.name;
    const { error } = await api.api.mcp({ name: preset.name }).auth.delete(null, { query: {} });
    if (error) fail(apiErrorMessage(error.value, `Failed to disconnect ${preset.title}`));
    await loadServers();
    busy = null;
  }

  async function remove(preset: ConnectorPreset) {
    busy = preset.name;
    const { error } = await api.api.mcp({ name: preset.name }).delete(null, { query: {} });
    if (error) fail(apiErrorMessage(error.value, `Failed to remove ${preset.title}`));
    await loadServers();
    busy = null;
  }
</script>

<div class="space-y-8">
  <p class="text-sm text-muted-foreground">
    Connect the agent to external services over MCP, or configure your own servers.
  </p>

  {#if banner}
    <div
      class="flex items-center justify-between gap-3 rounded-md px-4 py-3 text-sm {banner.kind ===
      'success'
        ? 'bg-accent text-accent-foreground'
        : 'bg-destructive/10 text-destructive'}"
      role="status"
    >
      <span class="flex items-center gap-2">
        {#if banner.kind === "success"}
          <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-activity" aria-hidden="true"></span>
        {/if}
        {banner.text}
      </span>
      <IconButton size="sm" aria-label="Dismiss" onclick={() => (banner = null)}>
        <XIcon size={14} />
      </IconButton>
    </div>
  {/if}

  <section class="space-y-3">
    {#if loadError}
      <div
        class="flex items-center justify-between gap-3 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
        role="alert"
      >
        <span>{loadError}</span>
        <Button
          variant="outline"
          size="sm"
          onclick={() => {
            loadError = null;
            loadServers();
          }}
        >
          Retry
        </Button>
      </div>
    {:else if servers === null}
      <div class="flex justify-center py-10 text-muted-foreground">
        <ThinkingOrb size={20} state="searching" />
      </div>
    {:else}
      <div class="grid gap-4 sm:grid-cols-2">
        {#each CONNECTOR_PRESETS as preset (preset.name)}
          {@const entry = entryFor(preset)}
          {@const status = entry?.status?.status ?? null}
          {@const working = busy === preset.name}
          <div class="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <div>
              <div class="flex items-center justify-between gap-2">
                <h3 class="font-semibold">{preset.title}</h3>
                {#if status === "connected"}
                  <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span class="h-1.5 w-1.5 rounded-full bg-activity" aria-hidden="true"></span>
                    Connected
                  </span>
                {:else if status === "failed"}
                  <span class="text-xs text-destructive" title={entry?.status?.status === "failed" ? entry.status.error : undefined}>
                    Failed
                  </span>
                {:else if status === "disabled"}
                  <span class="text-xs text-muted-foreground">Disabled</span>
                {:else if status === "needs_client_registration"}
                  <span class="text-xs text-destructive">Registration rejected</span>
                {/if}
              </div>
              <p class="mt-0.5 text-sm text-muted-foreground">{preset.description}</p>
              <p class="mt-1 truncate font-mono text-xs text-muted-foreground">{preset.url}</p>
            </div>
            <div class="mt-auto flex items-center gap-2">
              {#if !entry}
                <Button size="sm" disabled={working} onclick={() => add(preset)}>
                  {working ? "Redirecting..." : "Add"}
                </Button>
              {:else}
                {#if status === "needs_auth"}
                  <Button size="sm" disabled={working} onclick={() => connect(preset)}>
                    {working ? "Redirecting..." : "Connect"}
                  </Button>
                {:else if status === "connected"}
                  <Button size="sm" variant="outline" disabled={working} onclick={() => disconnect(preset)}>
                    Disconnect
                  </Button>
                {/if}
                <Button size="sm" variant="ghost" disabled={working} onclick={() => remove(preset)}>
                  Remove
                </Button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <section class="space-y-3">
    <div>
      <h2 class="font-medium">Custom servers</h2>
      <p class="text-sm text-muted-foreground">MCP servers you configure manually.</p>
    </div>
    <McpServerManager exclude={presetNames} />
  </section>
</div>
