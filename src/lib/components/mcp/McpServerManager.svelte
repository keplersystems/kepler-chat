<script lang="ts">
  import { api, apiErrorMessage } from "$lib/api";
  import type { McpServerConfig, McpServerEntry } from "$lib/contracts";
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

  let form = $state(emptyForm());

  const manager = createManagerState<McpServerEntry>({
    async list() {
      const { data, error } = await api.api.mcp.get({ query: scopeQuery() });
      if (error) throw new Error(apiErrorMessage(error.value, "Failed to load MCP servers"));
      return data.servers;
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
      headers: [] as { key: string; value: string }[],
      // Carried through edits: a full-document upsert would otherwise re-enable
      // a server the user had disabled.
      enabled: true,
    };
  }

  function scopeBody() {
    return projectId ? { projectId } : {};
  }

  function scopeQuery() {
    return projectId ? { projectId } : {};
  }

  function entryKey(entry: McpServerEntry): string {
    return `${entry.scope}:${entry.name}`;
  }

  function canEdit(entry: McpServerEntry): boolean {
    return !projectId || entry.scope === "project";
  }

  async function toggleEnabled(entry: McpServerEntry) {
    const config = { ...entry.config, enabled: !(entry.config.enabled ?? true) };
    const { error } = await api.api.mcp({ name: entry.name }).put({ ...scopeBody(), config });
    listActionError = error ? apiErrorMessage(error.value, "Failed to update server") : null;
    await manager.load();
  }

  function openCreate() {
    form = emptyForm();
    manager.openDialog(false);
  }

  function openEdit(entry: McpServerEntry) {
    const config = entry.config;
    form = {
      ...emptyForm(),
      name: entry.name,
      type: config.type,
      enabled: config.enabled ?? true,
      ...(config.type === "local"
        ? {
            command: config.command.join(" "),
            env: Object.entries(config.environment ?? {}).map(([key, value]) => ({ key, value })),
          }
        : {
            url: config.url,
            headers: Object.entries(config.headers ?? {}).map(([key, value]) => ({ key, value })),
          }),
    };
    manager.openDialog(true);
  }

  function recordFrom(rows: { key: string; value: string }[]): Record<string, string> {
    return Object.fromEntries(
      rows.filter((row) => row.key.trim()).map((row) => [row.key.trim(), row.value]),
    );
  }

  function buildConfig(): McpServerConfig | string {
    if (!NAME_PATTERN.test(form.name)) {
      return "Name must start with a letter or digit and may only contain letters, digits, hyphens, and underscores";
    }
    if (form.type === "local") {
      const command = form.command.trim().split(/\s+/).filter(Boolean);
      if (command.length === 0) return "Command is required";
      const environment = recordFrom(form.env);
      return {
        type: "local",
        command,
        ...(Object.keys(environment).length > 0 && { environment }),
        ...(form.enabled ? {} : { enabled: false }),
      };
    }
    const url = form.url.trim();
    if (!url) return "URL is required";
    const headers = recordFrom(form.headers);
    return {
      type: "remote",
      url,
      ...(Object.keys(headers).length > 0 && { headers }),
      ...(form.enabled ? {} : { enabled: false }),
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

{#snippet keyValueRows(
  rows: { key: string; value: string }[],
  keyPlaceholder: string,
  valuePlaceholder: string,
  addLabel: string,
)}
  {#each rows as row (row)}
    <div class="flex items-center gap-2">
      <Input aria-label="Name" bind:value={row.key} class="font-mono" placeholder={keyPlaceholder} />
      <Input
        aria-label="Value"
        bind:value={row.value}
        class="font-mono"
        placeholder={valuePlaceholder}
      />
      <IconButton aria-label="Remove row" onclick={() => rows.splice(rows.indexOf(row), 1)}>
        <XIcon size={14} />
      </IconButton>
    </div>
  {/each}
  <Button
    type="button"
    variant="ghost"
    size="sm"
    class="gap-1"
    onclick={() => rows.push({ key: "", value: "" })}
  >
    <PlusIcon size={14} />
    {addLabel}
  </Button>
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
            {#if projectId && entry.scope === "global"}
              <Badge>Global</Badge>
            {/if}
          </div>
          {#if canEdit(entry)}
            <div class="flex items-center gap-3">
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
            </div>
          {/if}
        </div>
        <p class="mt-1 truncate font-mono text-xs text-muted-foreground">
          {entry.config.type === "local" ? entry.config.command.join(" ") : entry.config.url}
        </p>
      </li>
    {/each}
  </ul>
</ManagerListShell>

<ManagerFormDialog
  bind:open={manager.dialogOpen}
  title={manager.editing ? "Edit server" : "Add server"}
  description={manager.editing
    ? "Update the MCP server configuration."
    : "Register an MCP server for agents to use."}
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
      {@render keyValueRows(form.env, "KEY", "value", "Add variable")}
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
    <fieldset class="space-y-2">
      <legend class="{labelClass} pb-1.5">
        Headers <span class={hintClass}>(e.g. Authorization for servers that need auth)</span>
      </legend>
      {@render keyValueRows(form.headers, "Authorization", "Bearer ...", "Add header")}
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
    configuration? Agents will lose access to its tools.
  {/snippet}
</ConfirmDeleteDialog>
