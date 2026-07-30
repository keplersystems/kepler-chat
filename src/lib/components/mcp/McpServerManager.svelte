<script lang="ts">
  import { api, apiErrorMessage } from "$lib/api";
  import type { McpServerConfig, McpServerEntry } from "$lib/server/mcp";
  import type { McpRemoteConfig } from "@opencode-ai/sdk/v2";
  import {
    ConfirmDeleteDialog,
    ManagerFormDialog,
    ManagerListShell,
    createManagerState,
  } from "$lib/components/manager";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { IconButton } from "$lib/components/ui/icon-button";
  import { Input } from "$lib/components/ui/input";
  import { Toggle } from "$lib/components/ui/toggle";
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
  const labelClass = "text-sm font-medium";
  const hintClass = "text-xs text-muted-foreground";

  let expandedError = $state<string | null>(null);
  let editingBase = $state<McpServerConfig | null>(null);
  let form = $state(emptyForm());

  const manager = createManagerState<McpServerEntry>({
    async list() {
      const { data, error } = await api.api.mcp.get({ query: scopeQuery() });
      if (error) throw new Error(apiErrorMessage(error.value, "Failed to load MCP servers"));
      return data.servers as McpServerEntry[];
    },
    async remove(entry) {
      const { error } = await api.api
        .mcp({ name: entry.name })
        .delete(null, { query: scopeQuery() });
      if (error) throw new Error(apiErrorMessage(error.value, "Failed to delete server"));
    },
  });

  let listActionError = $state<string | null>(null);
  const listError = $derived(manager.listError ?? listActionError);

  const visible = $derived(
    manager.items?.filter((s) => !exclude.includes(s.name)) ?? null,
  );

  $effect(() => {
    void projectId;
    manager.load();
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
    listActionError = error ? apiErrorMessage(error.value, "Failed to update server") : null;
    await manager.load();
  }

  async function startAuth(entry: McpServerEntry) {
    const { data, error } = await api.api.mcp({ name: entry.name }).auth.post(scopeBody());
    if (error || !data) {
      listActionError = apiErrorMessage(error?.value, "Failed to start authentication");
      return;
    }
    window.location.href = data.authorizationUrl;
  }

  function openCreate() {
    form = emptyForm();
    editingBase = null;
    manager.openDialog(false);
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
    editingBase = config;
    manager.openDialog(true);
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
      manager.formError = result;
      return;
    }
    await manager.save(async () => {
      const { error } = await api.api
        .mcp({ name: form.name })
        .put({ ...scopeBody(), config: result });
      if (error) throw new Error(apiErrorMessage(error.value, "Failed to save server"));
    });
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

<ManagerListShell
  error={listError}
  loading={visible === null}
  empty={visible?.length === 0}
  emptyText="No MCP servers configured yet."
  addLabel="Add server"
  onAdd={openCreate}
  onRetry={() => {
    listActionError = null;
    manager.retry();
  }}
>
  <ul class="space-y-2">
    {#each visible ?? [] as entry (entryKey(entry))}
      {@const enabled = entry.config.enabled ?? true}
      <li class="rounded-lg border border-border bg-card p-4">
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <span class="truncate font-mono text-sm font-medium">{entry.name}</span>
            <Badge>{entry.config.type}</Badge>
            {#if projectId && entry.scope.kind === "global"}
              <Badge>Global</Badge>
            {/if}
          </div>
          <div class="flex items-center gap-3">
            {@render statusIndicator(entry)}
            {#if canEdit(entry)}
              <Toggle
                checked={enabled}
                onCheckedChange={() => toggleEnabled(entry)}
                aria-label="Enable {entry.name}"
              />
              <div class="flex items-center gap-1">
                <IconButton aria-label="Edit {entry.name}" onclick={() => openEdit(entry)}>
                  <PencilIcon size={14} />
                </IconButton>
                <IconButton
                  aria-label="Delete {entry.name}"
                  onclick={() => manager.openDelete(entry)}
                >
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
</ManagerListShell>

<ManagerFormDialog
  bind:open={manager.dialogOpen}
  title={manager.editing ? "Edit server" : "Add server"}
  description={manager.editing
    ? "Update the MCP server configuration."
    : "Register an MCP server for the agent to use."}
  error={manager.formError}
  saving={manager.saving}
  submitLabel={manager.editing ? "Save changes" : "Add server"}
  onsubmit={save}
>
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
      disabled={manager.editing}
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
</ManagerFormDialog>

<ConfirmDeleteDialog
  open={manager.deleteTarget !== null}
  title="Delete server"
  error={manager.deleteError}
  deleting={manager.deleting}
  onCancel={() => (manager.deleteTarget = null)}
  onConfirm={manager.confirmDelete}
>
  {#snippet description()}
    Remove <span class="font-mono text-foreground">{manager.deleteTarget?.name}</span> from the
    configuration? The agent will lose access to its tools.
  {/snippet}
</ConfirmDeleteDialog>
