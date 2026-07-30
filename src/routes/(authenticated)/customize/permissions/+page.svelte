<script lang="ts">
  import { onMount } from "svelte";
  import { api, apiErrorMessage } from "$lib/api";
  import { ThinkingOrb } from "$lib/components/ui/orb";

  type Action = "allow" | "ask" | "deny";
  type Permissions = Record<string, Action>;

  const tools: Array<{ key: string; label: string; description: string }> = [
    { key: "bash", label: "Terminal", description: "Run shell commands in the workspace." },
    { key: "edit", label: "File edits", description: "Create and modify files." },
    { key: "webfetch", label: "Web fetch", description: "Fetch pages and APIs from the internet." },
    { key: "websearch", label: "Web search", description: "Search the web." },
    { key: "codesearch", label: "Code search", description: "Search remote code indexes." },
    {
      key: "external_directory",
      label: "Outside the workspace",
      description: "Touch files outside the conversation's own directory.",
    },
  ];
  const actions: Action[] = ["allow", "ask", "deny"];

  let permissions = $state<Permissions | null>(null);
  let error = $state<string | null>(null);
  let saving = $state(false);

  onMount(async () => {
    const { data, error: err } = await api.api.permissions.get();
    if (err) {
      error = apiErrorMessage(err.value, "Failed to load permissions");
      return;
    }
    permissions = data.permissions as Permissions;
  });

  async function setAction(key: string, action: Action) {
    if (!permissions || saving) return;
    const previous = permissions[key];
    if (previous === action) return;
    permissions[key] = action;
    saving = true;
    const { error: err } = await api.api.permissions.put({
      permissions: permissions as never,
    });
    saving = false;
    if (err) {
      permissions[key] = previous;
      error = apiErrorMessage(err.value, "Failed to save permissions");
      return;
    }
    error = null;
  }
</script>

<div class="max-w-2xl space-y-6">
  <p class="text-sm text-muted-foreground">
    What the agent may do without asking. Changes take a few seconds to apply.
  </p>

  {#if error}
    <p class="text-sm text-destructive" role="alert">{error}</p>
  {/if}

  {#if permissions === null && !error}
    <div class="flex justify-center py-12">
      <ThinkingOrb size={20} state="searching" />
    </div>
  {:else if permissions !== null}
    <div class="divide-y divide-border {saving ? 'pointer-events-none opacity-60' : ''}">
      {#each tools as tool (tool.key)}
        <div class="flex items-center justify-between gap-4 py-4">
          <div>
            <p class="text-sm text-foreground">{tool.label}</p>
            <p class="mt-0.5 text-sm text-muted-foreground">{tool.description}</p>
          </div>
          <div class="flex items-center gap-0.5 rounded-lg bg-secondary p-0.5">
            {#each actions as action (action)}
              <button
                type="button"
                onclick={() => setAction(tool.key, action)}
                aria-pressed={permissions[tool.key] === action}
                class="rounded-md px-3 py-1 text-sm capitalize {permissions[tool.key] === action
                  ? 'bg-background font-medium text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'}"
              >
                {action}
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
