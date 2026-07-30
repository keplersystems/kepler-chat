<script lang="ts">
  import { api, apiErrorMessage } from "$lib/api";
  import type { McpServerConfig, McpServerEntry } from "$lib/server/mcp";
  import type { McpRemoteConfig } from "@opencode-ai/sdk/v2";
  import { Button } from "$lib/components/ui/button";
  import { IconButton } from "$lib/components/ui/icon-button";
  import { Input } from "$lib/components/ui/input";
  import * as Dialog from "$lib/components/ui/dialog";
  import { ThinkingOrb } from "$lib/components/ui/orb";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import XIcon from "@lucide/svelte/icons/x";

  interface Props {
    projectId?: string;
    /** Server names managed elsewhere (e.g. connector presets) to hide from this list. */
    exclude?: string[];
  }

  const { projectId, exclude = [] }: Props = $props();

  const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
  const serverTypes = ["local", "remote"] as const;
  const badgeClass =
    "inline-flex shrink-0 items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground";
  const labelClass = "text-sm font-medium";
  const hintClass = "text-xs text-muted-foreground";
  const errorTextClass = "text-sm text-destructive";

  let servers = $state<McpServerEntry[] | null>(null);
  let listError = $state<string | null>(null);
  let expandedError = $state<string | null>(null);

  let dialogOpen = $state(false);
  let editing = $state(false);
  let editingBase = $state<McpServerConfig | null>(null);
  let form = $state(emptyForm());
  let formError = $state<string | null>(null);
  let saving = $state(false);

  let deleteTarget = $state<McpServerEntry | null>(null);
  let deleting = $state(false);
  let deleteError = $state<string | null>(null);

  const visible = $derived(servers?.filter((s) => !exclude.includes(s.name)) ?? null);

  $effect(() => {
    void projectId;
    load();
  });

  function emptyForm() {
    return {
      name: "",
      type: "local" as "local" | "remote",
      command: "",
      env: [] as { key: string; value: string }[],
      url: "",
      clientId: "",
      clientSecret: "",
      scope: "",
    };
  }

  function scopeBody() {
    return projectId ? { projectId } : {};
  }

  function scopeQuery() {
    return projectId ? { projectId } : {};
  }

  function entryKey(entry: McpServerEntry): string {
    return `${entry.scope.kind}:${entry.name}`;
  }

  function canEdit(entry: McpServerEntry): boolean {
    return !projectId || entry.scope.kind === "project";
  }

  async function load() {
    const { data, error } = await api.api.mcp.get({ query: scopeQuery() });
    if (error) {
      listError = apiErrorMessage(error.value, "Failed to load MCP servers");
      return;
    }
    servers = data.servers as McpServerEntry[];
    listError = null;
  }

  /** `oauth.redirectUri` is server-managed and rejected by the API schema. */
  function sanitize(config: McpServerConfig): McpServerConfig {
    if (config.type !== "remote" || typeof config.oauth !== "object" || config.oauth === null) {
      return config;
    }
    const { redirectUri: _, ...oauth } = config.oauth;
    return { ...config, oauth };
  }

  async function toggleEnabled(entry: McpServerEntry) {
    const config = sanitize({ ...entry.config, enabled: !(entry.config.enabled ?? true) });
    const { error } = await api.api.mcp({ name: entry.name }).put({ ...scopeBody(), config });
    if (error) listError = apiErrorMessage(error.value, "Failed to update server");
    await load();
  }

  async function startAuth(entry: McpServerEntry) {
    const { data, error } = await api.api.mcp({ name: entry.name }).auth.post(scopeBody());
    if (error || !data) {
      listError = apiErrorMessage(error?.value, "Failed to start authentication");
      return;
    }
    window.location.href = data.authorizationUrl;
  }

  function openCreate() {
    form = emptyForm();
    editing = false;
    editingBase = null;
    formError = null;
    dialogOpen = true;
  }

  function openEdit(entry: McpServerEntry) {
    const config = entry.config;
    const oauth = config.type === "remote" && typeof config.oauth === "object" ? config.oauth : null;
    form = {
      ...emptyForm(),
      name: entry.name,
      type: config.type,
      ...(config.type === "local"
        ? {
            command: config.command.join(" "),
            env: Object.entries(config.environment ?? {}).map(([key, value]) => ({ key, value })),
          }
        : {
            url: config.url,
            clientId: oauth?.clientId ?? "",
            clientSecret: oauth?.clientSecret ?? "",
            scope: oauth?.scope ?? "",
          }),
    };
    editing = true;
    editingBase = config;
    formError = null;
    dialogOpen = true;
  }

  function buildConfig(): McpServerConfig | string {
    if (!NAME_PATTERN.test(form.name)) {
      return "Name must start with a letter or digit and may only contain letters, digits, hyphens, and underscores";
    }
    const base = editingBase?.type === form.type ? editingBase : null;
    const carried = {
      ...(base?.enabled !== undefined && { enabled: base.enabled }),
      ...(base?.timeout !== undefined && { timeout: base.timeout }),
    };
    if (form.type === "local") {
      const command = form.command.trim().split(/\s+/).filter(Boolean);
      if (command.length === 0) return "Command is required";
      const environment = Object.fromEntries(
        form.env.filter((row) => row.key.trim()).map((row) => [row.key.trim(), row.value]),
      );
      return {
        type: "local",
        command,
        ...(Object.keys(environment).length > 0 && { environment }),
        ...carried,
      };
    }
    const url = form.url.trim();
    if (!url) return "URL is required";
    const remoteBase = base as McpRemoteConfig | null;
    const oauthFields = {
      ...(form.clientId.trim() && { clientId: form.clientId.trim() }),
      ...(form.clientSecret.trim() && { clientSecret: form.clientSecret.trim() }),
      ...(form.scope.trim() && { scope: form.scope.trim() }),
    };
    const oauth =
      Object.keys(oauthFields).length > 0
        ? oauthFields
        : remoteBase?.oauth !== undefined
          ? remoteBase.oauth === false
            ? (false as const)
            : {}
          : undefined;
    return {
      type: "remote",
      url,
      ...(remoteBase?.headers && { headers: remoteBase.headers }),
      ...(oauth !== undefined && { oauth }),
      ...carried,
    };
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    const result = buildConfig();
    if (typeof result === "string") {
      formError = result;
      return;
    }
    saving = true;
    const { error } = await api.api.mcp({ name: form.name }).put({ ...scopeBody(), config: result });
    saving = false;
    if (error) {
      formError = apiErrorMessage(error.value, "Failed to save server");
      return;
    }
    dialogOpen = false;
    await load();
  }

  function openDelete(entry: McpServerEntry) {
    deleteTarget = entry;
    deleteError = null;
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    deleting = true;
    const { error } = await api.api
      .mcp({ name: deleteTarget.name })
      .delete(null, { query: scopeQuery() });
    deleting = false;
    if (error) {
      deleteError = apiErrorMessage(error.value, "Failed to delete server");
      return;
    }
    deleteTarget = null;
    await load();
  }
</script>

{#snippet statusIndicator(entry: McpServerEntry)}
  {@const key = entryKey(entry)}
  {#if entry.status?.status === "connected"}
    <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span class="h-1.5 w-1.5 rounded-full bg-activity" aria-hidden="true"></span>
      Connected
    </span>
  {:else if entry.status?.status === "disabled"}
    <span class="text-xs text-muted-foreground">Disabled</span>
  {:else if entry.status?.status === "failed"}
    <button
      type="button"
      class="flex items-center gap-1 rounded-md text-xs text-destructive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-expanded={expandedError === key}
      onclick={() => (expandedError = expandedError === key ? null : key)}
    >
      Failed
      <ChevronDownIcon
        size={12}
        class="transition-transform duration-200 {expandedError === key ? 'rotate-180' : ''}"
      />
    </button>
  {:else if entry.status?.status === "needs_auth"}
    <Button size="sm" variant="outline" onclick={() => startAuth(entry)}>Connect</Button>
  {:else if entry.status?.status === "needs_client_registration"}
    {#if canEdit(entry)}
      <button
        type="button"
        class="rounded-md text-left text-xs text-destructive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onclick={() => openEdit(entry)}
      >
        Registration rejected — provide a client ID
      </button>
    {:else}
      <span class="text-xs text-destructive">Registration rejected — provide a client ID</span>
    {/if}
  {/if}
{/snippet}

<div class="space-y-3">
  {#if listError}
    <div
      class="flex items-center justify-between gap-3 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
      role="alert"
    >
      <span>{listError}</span>
      <Button
        variant="outline"
        size="sm"
        onclick={() => {
          listError = null;
          load();
        }}
      >
        Retry
      </Button>
    </div>
  {/if}

  {#if visible === null}
    {#if !listError}
      <div class="flex justify-center py-10 text-muted-foreground">
        <ThinkingOrb size={20} state="searching" />
      </div>
    {/if}
  {:else}
    {#if visible.length === 0}
      <div class="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No MCP servers configured yet.
      </div>
    {:else}
      <ul class="space-y-2">
        {#each visible as entry (entryKey(entry))}
          {@const enabled = entry.config.enabled ?? true}
          <li class="rounded-lg border border-border bg-card p-4">
            <div class="flex flex-wrap items-center gap-3">
              <div class="flex min-w-0 flex-1 items-center gap-2">
                <span class="truncate font-mono text-sm font-medium">{entry.name}</span>
                <span class={badgeClass}>{entry.config.type}</span>
                {#if projectId && entry.scope.kind === "global"}
                  <span class={badgeClass}>Global</span>
                {/if}
              </div>
              <div class="flex items-center gap-3">
                {@render statusIndicator(entry)}
                {#if canEdit(entry)}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label="Enable {entry.name}"
                    class="relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {enabled
                      ? 'bg-primary'
                      : 'bg-muted'}"
                    onclick={() => toggleEnabled(entry)}
                  >
                    <span
                      class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow-xs transition-transform duration-200 {enabled
                        ? 'translate-x-4'
                        : ''}"
                    ></span>
                  </button>
                  <div class="flex items-center gap-1">
                    <IconButton aria-label="Edit {entry.name}" onclick={() => openEdit(entry)}>
                      <PencilIcon size={14} />
                    </IconButton>
                    <IconButton aria-label="Delete {entry.name}" onclick={() => openDelete(entry)}>
                      <Trash2Icon size={14} />
                    </IconButton>
                  </div>
                {/if}
              </div>
            </div>
            <p class="mt-1 truncate font-mono text-xs text-muted-foreground">
              {entry.config.type === "local" ? entry.config.command.join(" ") : entry.config.url}
            </p>
            {#if entry.status?.status === "failed" && expandedError === entryKey(entry)}
              <p class="mt-2 rounded-md bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
                {entry.status.error}
              </p>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    <Button variant="outline" size="sm" class="gap-1.5" onclick={openCreate}>
      <PlusIcon size={16} />
      Add server
    </Button>
  {/if}
</div>

<Dialog.Root bind:open={dialogOpen}>
  <Dialog.Content class="max-h-[85vh] overflow-y-auto">
    <Dialog.Header>
      <Dialog.Title>{editing ? "Edit server" : "Add server"}</Dialog.Title>
      <Dialog.Description>
        {editing
          ? "Update the MCP server configuration."
          : "Register an MCP server for the agent to use."}
      </Dialog.Description>
    </Dialog.Header>

    <form class="space-y-4" onsubmit={save}>
      <div class="flex gap-2" role="radiogroup" aria-label="Server type">
        {#each serverTypes as type (type)}
          <button
            type="button"
            role="radio"
            aria-checked={form.type === type}
            class="flex-1 rounded-md border px-3 py-2 text-sm font-medium capitalize transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {form.type ===
            type
              ? 'border-primary bg-primary/10 text-foreground'
              : 'border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'}"
            onclick={() => (form.type = type)}
          >
            {type}
          </button>
        {/each}
      </div>

      <div class="space-y-1.5">
        <label class={labelClass} for="mcp-name">Name</label>
        <Input
          id="mcp-name"
          bind:value={form.name}
          disabled={editing}
          class="font-mono"
          placeholder="my-server"
        />
      </div>

      {#if form.type === "local"}
        <div class="space-y-1.5">
          <label class={labelClass} for="mcp-command">Command</label>
          <Input
            id="mcp-command"
            bind:value={form.command}
            class="font-mono"
            placeholder="bunx my-mcp-server --flag"
          />
          <p class={hintClass}>Split on whitespace; arguments with spaces aren't supported.</p>
        </div>
        <fieldset class="space-y-2">
          <legend class="{labelClass} pb-1.5">Environment variables</legend>
          {#each form.env as row (row)}
            <div class="flex items-center gap-2">
              <Input aria-label="Variable name" bind:value={row.key} class="font-mono" placeholder="KEY" />
              <Input aria-label="Variable value" bind:value={row.value} class="font-mono" placeholder="value" />
              <IconButton
                aria-label="Remove variable"
                onclick={() => form.env.splice(form.env.indexOf(row), 1)}
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
            onclick={() => form.env.push({ key: "", value: "" })}
          >
            <PlusIcon size={14} />
            Add variable
          </Button>
        </fieldset>
      {:else}
        <div class="space-y-1.5">
          <label class={labelClass} for="mcp-url">URL</label>
          <Input
            id="mcp-url"
            bind:value={form.url}
            class="font-mono"
            placeholder="https://example.com/mcp"
          />
        </div>
        <fieldset class="space-y-3">
          <legend class="{labelClass} pb-1.5">OAuth <span class={hintClass}>(optional)</span></legend>
          <div class="space-y-1.5">
            <label class={labelClass} for="mcp-oauth-client-id">Client ID</label>
            <Input id="mcp-oauth-client-id" bind:value={form.clientId} class="font-mono" />
          </div>
          <div class="space-y-1.5">
            <label class={labelClass} for="mcp-oauth-client-secret">Client secret</label>
            <Input
              id="mcp-oauth-client-secret"
              type="password"
              bind:value={form.clientSecret}
              class="font-mono"
            />
          </div>
          <div class="space-y-1.5">
            <label class={labelClass} for="mcp-oauth-scope">Scope</label>
            <Input id="mcp-oauth-scope" bind:value={form.scope} class="font-mono" />
          </div>
        </fieldset>
      {/if}

      {#if formError}
        <p class={errorTextClass} role="alert">{formError}</p>
      {/if}

      <Dialog.Footer>
        <Button type="button" variant="outline" onclick={() => (dialogOpen = false)}>Cancel</Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : editing ? "Save changes" : "Add server"}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root
  open={deleteTarget !== null}
  onOpenChange={(open) => {
    if (!open) deleteTarget = null;
  }}
>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Delete server</Dialog.Title>
      <Dialog.Description>
        Remove <span class="font-mono text-foreground">{deleteTarget?.name}</span> from the
        configuration? The agent will lose access to its tools.
      </Dialog.Description>
    </Dialog.Header>
    {#if deleteError}
      <p class={errorTextClass} role="alert">{deleteError}</p>
    {/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (deleteTarget = null)}>Cancel</Button>
      <Button variant="destructive" onclick={confirmDelete} disabled={deleting}>
        {deleting ? "Deleting..." : "Delete"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
