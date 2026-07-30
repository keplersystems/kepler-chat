<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { api } from "$lib/api";
  import { focusInput, relativeTime } from "$lib/utils";
  import type { ConversationDTO, ProjectDTO } from "$lib/contracts";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import PlusIcon from "@lucide/svelte/icons/plus";

  interface Props {
    data: { conversations: ConversationDTO[]; projects: ProjectDTO[] };
  }

  const { data }: Props = $props();

  const chatCount = (projectId: string) =>
    data.conversations.filter((c) => c.project_id === projectId).length;

  let creating = $state(false);
  let nameDraft = $state("");
  let createError = $state("");

  async function commitCreate() {
    const name = nameDraft.trim();
    creating = false;
    nameDraft = "";
    if (!name) return;
    const { data: created } = await api.api.projects.post({ name });
    if (!created) {
      createError = "Failed to create project";
      return;
    }
    createError = "";
    await invalidateAll();
    await goto(`/projects/${created.id}`);
  }
</script>

<div class="h-full overflow-y-auto">
  <div class="mx-auto w-full max-w-3xl px-6 py-10">
    <div class="flex items-center justify-between max-md:pl-10">
      <h1 class="text-xl font-semibold tracking-tight text-foreground">Projects</h1>
      <Button
        variant="secondary"
        size="sm"
        class="gap-1.5"
        onclick={() => {
          creating = true;
          createError = "";
        }}
      >
        <PlusIcon size={15} />
        New project
      </Button>
    </div>

    {#if creating}
      <form
        class="mt-6"
        use:focusInput
        onsubmit={(e) => {
          e.preventDefault();
          commitCreate();
        }}
      >
        <Input
          bind:value={nameDraft}
          placeholder="Project name"
          aria-label="New project name"
          onkeydown={(e) => {
            if (e.key === "Escape") {
              creating = false;
              nameDraft = "";
            }
          }}
          onblur={commitCreate}
        />
      </form>
    {/if}
    {#if createError}
      <p class="mt-2 text-sm text-destructive">{createError}</p>
    {/if}

    <div class="mt-6 grid gap-3 sm:grid-cols-2">
      {#each data.projects as project (project.id)}
        <a
          href={`/projects/${project.id}`}
          class="flex flex-col gap-3 rounded-xl border bg-card p-5 hover:border-foreground/20"
        >
          <FolderIcon size={18} class="text-muted-foreground" />
          <div>
            <p class="truncate font-medium text-foreground">{project.name}</p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              {chatCount(project.id)}
              {chatCount(project.id) === 1 ? "chat" : "chats"} · updated {relativeTime(
                project.updated_at,
              )}
            </p>
          </div>
        </a>
      {:else}
        {#if !creating}
          <p class="col-span-full py-12 text-center text-sm text-muted-foreground">
            No projects yet. Projects group conversations with shared instructions, skills, and
            connectors.
          </p>
        {/if}
      {/each}
    </div>
  </div>
</div>
