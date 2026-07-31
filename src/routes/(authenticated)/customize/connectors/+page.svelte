<script lang="ts">
  import { onMount } from "svelte";
  import { api, apiErrorMessage } from "$lib/api";
  import { CONNECTOR_PRESETS, type ConnectorPreset } from "$lib/connectors";
  import type { McpServerEntry } from "$lib/contracts";
  import McpServerManager from "$lib/components/mcp/McpServerManager.svelte";
  import { ManagerFormDialog } from "$lib/components/manager";
  import { Button } from "$lib/components/ui/button";
  import { IconButton } from "$lib/components/ui/icon-button";
  import { Input } from "$lib/components/ui/input";
  import { ThinkingOrb } from "$lib/components/ui/orb";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import XIcon from "@lucide/svelte/icons/x";

  const presetNames = CONNECTOR_PRESETS.map((preset) => preset.name);

  let servers = $state<McpServerEntry[] | null>(null);
  let loadError = $state<string | null>(null);
  let busy = $state<string | null>(null);
  let actionError = $state<string | null>(null);

  let dialogOpen = $state(false);
  let dialogPreset = $state<ConnectorPreset | null>(null);
  let dialogEditing = $state(false);
  let dialogHeaders = $state<{ key: string; value: string }[]>([]);
  let dialogError = $state<string | null>(null);
  let dialogSaving = $state(false);

  onMount(loadServers);

  async function loadServers() {
    const { data, error } = await api.api.mcp.get({ query: {} });
    if (error) {
      loadError = apiErrorMessage(error.value, "Failed to load connectors");
      return;
    }
    servers = data.servers;
    loadError = null;
  }

  function entryFor(preset: ConnectorPreset): McpServerEntry | null {
    return servers?.find((server) => server.name === preset.name) ?? null;
  }

  function openDialog(preset: ConnectorPreset) {
    const entry = entryFor(preset);
    const headers = entry?.config.type === "remote" ? entry.config.headers : undefined;
    dialogPreset = preset;
    dialogEditing = entry !== null;
    dialogHeaders = Object.entries(headers ?? {}).map(([key, value]) => ({ key, value }));
    dialogError = null;
    dialogOpen = true;
  }

  async function saveDialog(event: SubmitEvent) {
    event.preventDefault();
    if (!dialogPreset) return;
    const headers = Object.fromEntries(
      dialogHeaders.filter((row) => row.key.trim()).map((row) => [row.key.trim(), row.value]),
    );
    dialogSaving = true;
    const { error } = await api.api.mcp({ name: dialogPreset.name }).put({
      config: {
        type: "remote",
        url: dialogPreset.url,
        ...(Object.keys(headers).length > 0 && { headers }),
      },
    });
    dialogSaving = false;
    if (error) {
      dialogError = apiErrorMessage(error.value, `Failed to save ${dialogPreset.title}`);
      return;
    }
    dialogOpen = false;
    await loadServers();
  }

  async function remove(preset: ConnectorPreset) {
    busy = preset.name;
    const { error } = await api.api.mcp({ name: preset.name }).delete(null, { query: {} });
    actionError = error ? apiErrorMessage(error.value, `Failed to remove ${preset.title}`) : null;
    await loadServers();
    busy = null;
  }
</script>

<div class="space-y-8">
  <p class="text-sm text-muted-foreground">
    Connect agents to external services over MCP. Servers needing auth take a request header.
  </p>

  {#if actionError}
    <div
      class="flex items-center justify-between gap-3 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
      role="alert"
    >
      <span>{actionError}</span>
      <IconButton size="sm" aria-label="Dismiss" onclick={() => (actionError = null)}>
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
          {@const working = busy === preset.name}
          <div class="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <div>
              <div class="flex items-center justify-between gap-2">
                <h3 class="font-semibold">{preset.title}</h3>
                {#if entry}
                  <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span class="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true"></span>
                    Added
                  </span>
                {/if}
              </div>
              <p class="mt-0.5 text-sm text-muted-foreground">{preset.description}</p>
              <p class="mt-1 truncate font-mono text-xs text-muted-foreground">{preset.url}</p>
            </div>
            <div class="mt-auto flex items-center gap-2">
              {#if !entry}
                <Button size="sm" disabled={working} onclick={() => openDialog(preset)}>Add</Button>
              {:else}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={working}
                  onclick={() => openDialog(preset)}
                >
                  Headers
                </Button>
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

<ManagerFormDialog
  bind:open={dialogOpen}
  title={dialogEditing ? `Edit ${dialogPreset?.title ?? ""} headers` : `Add ${dialogPreset?.title ?? ""}`}
  description={dialogEditing
    ? "Update the request headers sent to this connector."
    : "Headers are optional; add an Authorization header if the service requires it."}
  error={dialogError}
  saving={dialogSaving}
  submitLabel={dialogEditing ? "Save changes" : "Add connector"}
  onsubmit={saveDialog}
>
  <fieldset class="space-y-2">
    <legend class="pb-1.5 text-sm font-medium">Headers</legend>
    {#each dialogHeaders as row (row)}
      <div class="flex items-center gap-2">
        <Input aria-label="Header name" bind:value={row.key} class="font-mono" placeholder="Authorization" />
        <Input aria-label="Header value" bind:value={row.value} class="font-mono" placeholder="Bearer ..." />
        <IconButton
          aria-label="Remove header"
          onclick={() => dialogHeaders.splice(dialogHeaders.indexOf(row), 1)}
        >
          <XIcon size={14} />
        </IconButton>
      </div>
    {/each}
    <Button
      type="button"
      variant="ghost"
      size="sm"
      class="gap-1"
      onclick={() => dialogHeaders.push({ key: "", value: "" })}
    >
      <PlusIcon size={14} />
      Add header
    </Button>
  </fieldset>
</ManagerFormDialog>
