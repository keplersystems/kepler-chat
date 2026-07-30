<script lang="ts">
  import { api, apiErrorMessage } from "$lib/api";
  import type { SkillEntry } from "$lib/server/skills";
  import { Button } from "$lib/components/ui/button";
  import { IconButton } from "$lib/components/ui/icon-button";
  import { Input, Textarea } from "$lib/components/ui/input";
  import * as Dialog from "$lib/components/ui/dialog";
  import { ThinkingOrb } from "$lib/components/ui/orb";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";

  interface Props {
    projectId?: string;
  }

  const { projectId }: Props = $props();

  const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  const badgeClass =
    "inline-flex shrink-0 items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground";
  const labelClass = "text-sm font-medium";
  const errorTextClass = "text-sm text-destructive";

  let skills = $state<SkillEntry[] | null>(null);
  let listError = $state<string | null>(null);

  let dialogOpen = $state(false);
  let editing = $state(false);
  let form = $state({ name: "", description: "", content: "" });
  let formError = $state<string | null>(null);
  let saving = $state(false);

  let deleteTarget = $state<SkillEntry | null>(null);
  let deleting = $state(false);
  let deleteError = $state<string | null>(null);

  $effect(() => {
    void projectId;
    load();
  });

  function scopeQuery() {
    return projectId ? { projectId } : {};
  }

  function canEdit(skill: SkillEntry): boolean {
    return !projectId || skill.scope.kind === "project";
  }

  async function load() {
    const { data, error } = await api.api.skills.get({ query: scopeQuery() });
    if (error) {
      listError = apiErrorMessage(error.value, "Failed to load skills");
      return;
    }
    skills = data.skills as SkillEntry[];
    listError = null;
  }

  function openCreate() {
    form = { name: "", description: "", content: "" };
    editing = false;
    formError = null;
    dialogOpen = true;
  }

  function openEdit(skill: SkillEntry) {
    form = { name: skill.name, description: skill.description, content: skill.content };
    editing = true;
    formError = null;
    dialogOpen = true;
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!NAME_PATTERN.test(form.name)) {
      formError = "Name must be lowercase kebab-case (letters, digits, hyphens)";
      return;
    }
    if (!form.description.trim()) {
      formError = "Description is required";
      return;
    }
    if (!form.content.trim()) {
      formError = "Content is required";
      return;
    }
    saving = true;
    const { error } = await api.api.skills({ name: form.name }).put({
      ...(projectId ? { projectId } : {}),
      description: form.description.trim(),
      content: form.content,
    });
    saving = false;
    if (error) {
      formError = apiErrorMessage(error.value, "Failed to save skill");
      return;
    }
    dialogOpen = false;
    await load();
  }

  function openDelete(skill: SkillEntry) {
    deleteTarget = skill;
    deleteError = null;
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    deleting = true;
    const { error } = await api.api
      .skills({ name: deleteTarget.name })
      .delete(null, { query: scopeQuery() });
    deleting = false;
    if (error) {
      deleteError = apiErrorMessage(error.value, "Failed to delete skill");
      return;
    }
    deleteTarget = null;
    await load();
  }
</script>

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

  {#if skills === null}
    {#if !listError}
      <div class="flex justify-center py-10 text-muted-foreground">
        <ThinkingOrb size={20} state="searching" />
      </div>
    {/if}
  {:else}
    {#if skills.length === 0}
      <div class="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No skills yet. Create one to give the agent a reusable workflow.
      </div>
    {:else}
      <ul class="space-y-2">
        {#each skills as skill (`${skill.scope.kind}:${skill.name}`)}
          <li class="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate font-mono text-sm font-medium">{skill.name}</span>
                <span class={badgeClass}>{skill.scope.kind === "global" ? "Global" : "Project"}</span>
              </div>
              <p class="mt-0.5 truncate text-sm text-muted-foreground">{skill.description}</p>
            </div>
            {#if canEdit(skill)}
              <div class="flex items-center gap-1">
                <IconButton aria-label="Edit {skill.name}" onclick={() => openEdit(skill)}>
                  <PencilIcon size={14} />
                </IconButton>
                <IconButton aria-label="Delete {skill.name}" onclick={() => openDelete(skill)}>
                  <Trash2Icon size={14} />
                </IconButton>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    <Button variant="outline" size="sm" class="gap-1.5" onclick={openCreate}>
      <PlusIcon size={16} />
      New skill
    </Button>
  {/if}
</div>

<Dialog.Root bind:open={dialogOpen}>
  <Dialog.Content class="max-h-[85vh] max-w-2xl overflow-y-auto">
    <Dialog.Header>
      <Dialog.Title>{editing ? "Edit skill" : "New skill"}</Dialog.Title>
      <Dialog.Description>
        {editing
          ? "Update the skill's description and instructions."
          : "Define a reusable set of instructions the agent can invoke."}
      </Dialog.Description>
    </Dialog.Header>

    <form class="space-y-4" onsubmit={save}>
      <div class="space-y-1.5">
        <label class={labelClass} for="skill-name">Name</label>
        <Input
          id="skill-name"
          bind:value={form.name}
          disabled={editing}
          class="font-mono"
          placeholder="my-skill"
        />
      </div>
      <div class="space-y-1.5">
        <label class={labelClass} for="skill-description">Description</label>
        <Input
          id="skill-description"
          bind:value={form.description}
          placeholder="When and why the agent should use this skill"
        />
      </div>
      <div class="space-y-1.5">
        <label class={labelClass} for="skill-content">Content</label>
        <Textarea id="skill-content" bind:value={form.content} class="min-h-64" />
        <p class="text-xs text-muted-foreground">
          Markdown; the agent loads this when the skill is invoked
        </p>
      </div>

      {#if formError}
        <p class={errorTextClass} role="alert">{formError}</p>
      {/if}

      <Dialog.Footer>
        <Button type="button" variant="outline" onclick={() => (dialogOpen = false)}>Cancel</Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : editing ? "Save changes" : "Create skill"}
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
      <Dialog.Title>Delete skill</Dialog.Title>
      <Dialog.Description>
        Delete <span class="font-mono text-foreground">{deleteTarget?.name}</span>? This removes its
        SKILL.md permanently.
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
