<script lang="ts">
  import { api, apiErrorMessage } from "$lib/api";
  import type { SkillEntry } from "$lib/server/skills";
  import {
    ConfirmDeleteDialog,
    ManagerFormDialog,
    ManagerListShell,
    createManagerState,
  } from "$lib/components/manager";
  import { Badge } from "$lib/components/ui/badge";
  import { IconButton } from "$lib/components/ui/icon-button";
  import { Input, Textarea } from "$lib/components/ui/input";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";

  interface Props {
    projectId?: string;
  }

  const { projectId }: Props = $props();

  const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  let form = $state({ name: "", description: "", content: "" });

  const manager = createManagerState<SkillEntry>({
    async list() {
      const { data, error } = await api.api.skills.get({ query: scopeQuery() });
      if (error) throw new Error(apiErrorMessage(error.value, "Failed to load skills"));
      return data.skills as SkillEntry[];
    },
    async remove(skill) {
      const { error } = await api.api
        .skills({ name: skill.name })
        .delete(null, { query: scopeQuery() });
      if (error) throw new Error(apiErrorMessage(error.value, "Failed to delete skill"));
    },
  });

  $effect(() => {
    void projectId;
    manager.load();
  });

  function scopeQuery() {
    return projectId ? { projectId } : {};
  }

  function canEdit(skill: SkillEntry): boolean {
    return !projectId || skill.scope.kind === "project";
  }

  function openCreate() {
    form = { name: "", description: "", content: "" };
    manager.openDialog(false);
  }

  function openEdit(skill: SkillEntry) {
    form = { name: skill.name, description: skill.description, content: skill.content };
    manager.openDialog(true);
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!NAME_PATTERN.test(form.name)) {
      manager.formError = "Name must be lowercase kebab-case (letters, digits, hyphens)";
      return;
    }
    if (!form.description.trim()) {
      manager.formError = "Description is required";
      return;
    }
    if (!form.content.trim()) {
      manager.formError = "Content is required";
      return;
    }
    await manager.save(async () => {
      const { error } = await api.api.skills({ name: form.name }).put({
        ...(projectId ? { projectId } : {}),
        description: form.description.trim(),
        content: form.content,
      });
      if (error) throw new Error(apiErrorMessage(error.value, "Failed to save skill"));
    });
  }
</script>

<ManagerListShell
  error={manager.listError}
  loading={manager.items === null}
  empty={manager.items?.length === 0}
  emptyText="No skills yet. Create one to give the agent a reusable workflow."
  addLabel="New skill"
  onAdd={openCreate}
  onRetry={manager.retry}
>
  <ul class="space-y-2">
    {#each manager.items ?? [] as skill (`${skill.scope.kind}:${skill.name}`)}
      <li class="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="truncate font-mono text-sm font-medium">{skill.name}</span>
            <Badge>{skill.scope.kind === "global" ? "Global" : "Project"}</Badge>
          </div>
          <p class="mt-0.5 truncate text-sm text-muted-foreground">{skill.description}</p>
        </div>
        {#if canEdit(skill)}
          <div class="flex items-center gap-1">
            <IconButton aria-label="Edit {skill.name}" onclick={() => openEdit(skill)}>
              <PencilIcon size={14} />
            </IconButton>
            <IconButton aria-label="Delete {skill.name}" onclick={() => manager.openDelete(skill)}>
              <Trash2Icon size={14} />
            </IconButton>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
</ManagerListShell>

<ManagerFormDialog
  bind:open={manager.dialogOpen}
  title={manager.editing ? "Edit skill" : "New skill"}
  description={manager.editing
    ? "Update the skill's description and instructions."
    : "Define a reusable set of instructions the agent can invoke."}
  error={manager.formError}
  saving={manager.saving}
  submitLabel={manager.editing ? "Save changes" : "Create skill"}
  contentClass="max-h-[85vh] max-w-2xl overflow-y-auto"
  onsubmit={save}
>
  <div class="space-y-1.5">
    <label class="text-sm font-medium" for="skill-name">Name</label>
    <Input
      id="skill-name"
      bind:value={form.name}
      disabled={manager.editing}
      class="font-mono"
      placeholder="my-skill"
    />
  </div>
  <div class="space-y-1.5">
    <label class="text-sm font-medium" for="skill-description">Description</label>
    <Input
      id="skill-description"
      bind:value={form.description}
      placeholder="When and why the agent should use this skill"
    />
  </div>
  <div class="space-y-1.5">
    <label class="text-sm font-medium" for="skill-content">Content</label>
    <Textarea id="skill-content" bind:value={form.content} class="min-h-64" />
    <p class="text-xs text-muted-foreground">
      Markdown; the agent loads this when the skill is invoked
    </p>
  </div>
</ManagerFormDialog>

<ConfirmDeleteDialog
  open={manager.deleteTarget !== null}
  title="Delete skill"
  error={manager.deleteError}
  deleting={manager.deleting}
  onCancel={() => (manager.deleteTarget = null)}
  onConfirm={manager.confirmDelete}
>
  {#snippet description()}
    Delete <span class="font-mono text-foreground">{manager.deleteTarget?.name}</span>? This
    removes its SKILL.md permanently.
  {/snippet}
</ConfirmDeleteDialog>
