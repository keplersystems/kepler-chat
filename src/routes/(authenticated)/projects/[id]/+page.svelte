<script lang="ts">
  import { untrack } from "svelte";
  import { fade } from "svelte/transition";
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { ConversationDTO, ProjectDTO } from "$lib/contracts";
  import { focusInput, relativeTime } from "$lib/utils";
  import { modelCatalog } from "$lib/state/providers.svelte";
  import { startChat } from "$lib/state/start-chat";
  import type { ModelSelection } from "$lib/types";
  import MessageInput from "$lib/components/chat/MessageInput.svelte";
  import McpServerManager from "$lib/components/mcp/McpServerManager.svelte";
  import SkillManager from "$lib/components/skills/SkillManager.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input, Textarea } from "$lib/components/ui/input";
  import { IconButton } from "$lib/components/ui/icon-button";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import MessageSquareIcon from "@lucide/svelte/icons/message-square";
  import MoreHorizontalIcon from "@lucide/svelte/icons/more-horizontal";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";

  interface Props {
    data: {
      conversations: ConversationDTO[];
      projects: ProjectDTO[];
      project: ProjectDTO & { instructions: string };
    };
  }

  const { data }: Props = $props();

  const projectConversations = $derived(
    data.conversations.filter((c) => c.project_id === data.project.id),
  );

  let editingName = $state(false);
  let nameDraft = $state("");
  let deleteOpen = $state(false);
  let instructionsOpen = $state(false);
  let mcpOpen = $state(false);
  let skillsOpen = $state(false);
  let instructions = $derived(data.project.instructions);
  let savingInstructions = $state(false);
  let instructionsSaved = $state(false);
  let savedTimer: ReturnType<typeof setTimeout>;

  const instructionsDirty = $derived(instructions !== data.project.instructions);

  let selectedModel = $state<ModelSelection | null>(null);

  $effect(() => {
    modelCatalog.load().then(() => {
      if (!selectedModel) selectedModel = modelCatalog.defaultModel();
    });
  });

  $effect(() => {
    void data.project.id;
    untrack(() => {
      editingName = false;
      instructionsSaved = false;
    });
  });

  function handleModelChange(model: ModelSelection) {
    selectedModel = model;
    modelCatalog.remember(model);
  }

  const handleSend = (
    text: string,
    model: ModelSelection,
    files?: File[],
    mediaIds?: string[],
    variant?: string,
  ) => startChat(text, model, files, data.project.id, mediaIds, variant);

  function startRename() {
    nameDraft = data.project.name;
    editingName = true;
  }

  const renameEnhance: SubmitFunction = () => {
    return async ({ result, update }) => {
      await update({ reset: false });
      if (result.type === "success") editingName = false;
    };
  };

  const saveInstructionsEnhance: SubmitFunction = () => {
    savingInstructions = true;
    return async ({ result, update }) => {
      await update({ reset: false });
      savingInstructions = false;
      if (result.type === "success") {
        instructionsSaved = true;
        instructionsOpen = false;
        clearTimeout(savedTimer);
        savedTimer = setTimeout(() => (instructionsSaved = false), 2000);
      }
    };
  };
</script>

<ScrollArea class="h-full">
  <div class="mx-auto w-full max-w-5xl px-6 py-8 md:px-8">
    <a
      href="/projects"
      class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground max-md:ml-10"
    >
      <ArrowLeftIcon size={15} />
      All projects
    </a>

    <div class="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
      {#if editingName}
        <form
          method="POST"
          action="?/rename"
          class="flex min-w-0 flex-1 items-center gap-2"
          use:enhance={renameEnhance}
          use:focusInput
        >
          <Input
            name="name"
            bind:value={nameDraft}
            required
            maxlength={255}
            class="h-10 flex-1 text-lg font-semibold"
            aria-label="Project name"
            onkeydown={(e) => {
              if (e.key === "Escape") editingName = false;
            }}
          />
          <Button type="submit" size="sm">Save</Button>
          <Button type="button" variant="ghost" size="sm" onclick={() => (editingName = false)}>
            Cancel
          </Button>
        </form>
      {:else}
        <h1 class="min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight text-foreground">
          {data.project.name}
        </h1>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Project actions"
          >
            <MoreHorizontalIcon size={16} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end">
            <DropdownMenu.Item onSelect={startRename}>
              <PencilIcon size={14} class="opacity-70" />
              Rename
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item variant="destructive" onSelect={() => (deleteOpen = true)}>
              <Trash2Icon size={14} class="opacity-70" />
              Delete project
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {/if}
        </div>

        <div class="mt-6">
          <MessageInput
          onSubmit={handleSend}
          disabled={modelCatalog.loading}
          placeholder="Start a chat in this project…"
          providers={modelCatalog.providers}
          connectedProviders={modelCatalog.connected}
          {selectedModel}
          onModelChange={handleModelChange}
        />
        </div>

        <ul class="mt-8 divide-y divide-border">
          {#each projectConversations as conversation (conversation.id)}
            <li class="group flex items-center" out:fade={{ duration: 140 }}>
              <a
                href={`/chat/${conversation.id}`}
                class="min-w-0 flex-1 rounded-lg px-2 py-3.5 hover:bg-accent"
              >
                <p class="truncate text-[15px] text-foreground">{conversation.title}</p>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  Last message {relativeTime(conversation.updated_at)}
                </p>
              </a>
              <form method="POST" action="?/deleteConversation" use:enhance>
                <input type="hidden" name="id" value={conversation.id} />
                <IconButton
                  type="submit"
                  size="sm"
                  class="opacity-0 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                  aria-label={`Delete ${conversation.title}`}
                >
                  <Trash2Icon size={14} />
                </IconButton>
              </form>
            </li>
          {:else}
            <li class="flex flex-col items-center gap-3 py-16 text-center">
              <MessageSquareIcon size={22} class="text-muted-foreground/50" />
              <p class="text-sm text-muted-foreground">
                Chats in this project share its instructions, connectors, and skills.
              </p>
            </li>
          {/each}
        </ul>
      </div>

      <aside class="flex min-w-0 flex-col gap-3">
        <section class="rounded-xl border bg-card p-4">
          <div class="flex items-start justify-between gap-2">
            <h2 class="text-sm font-medium text-foreground">Instructions</h2>
            <IconButton
              size="sm"
              aria-label={instructions ? "Edit instructions" : "Add instructions"}
              onclick={() => (instructionsOpen = true)}
            >
              {#if instructions}
                <PencilIcon size={13} />
              {:else}
                <PlusIcon size={14} />
              {/if}
            </IconButton>
          </div>
          {#if instructions}
            <p class="mt-1.5 line-clamp-4 whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">
              {instructions}
            </p>
          {:else}
            <p class="mt-1 text-sm text-muted-foreground">
              Tailor responses for every chat in this project.
            </p>
          {/if}
          {#if instructionsSaved}
            <p class="mt-1.5 text-xs text-muted-foreground" transition:fade={{ duration: 200 }}>
              Saved
            </p>
          {/if}
        </section>

        <section class="t-acc rounded-xl border bg-card" data-open={mcpOpen}>
          <button
            type="button"
            class="flex w-full items-center justify-between gap-2 p-4 text-left"
            aria-expanded={mcpOpen}
            onclick={() => (mcpOpen = !mcpOpen)}
          >
            <span class="text-sm font-medium text-foreground">MCP servers</span>
            <span class="t-acc-chevron text-muted-foreground"><ChevronDownIcon size={15} /></span>
          </button>
          <div class="t-acc-panel">
            <div class="t-acc-panel-inner">
              <div class="px-4 pb-4">
                <McpServerManager projectId={data.project.id} />
              </div>
            </div>
          </div>
        </section>

        <section class="t-acc rounded-xl border bg-card" data-open={skillsOpen}>
          <button
            type="button"
            class="flex w-full items-center justify-between gap-2 p-4 text-left"
            aria-expanded={skillsOpen}
            onclick={() => (skillsOpen = !skillsOpen)}
          >
            <span class="text-sm font-medium text-foreground">Skills</span>
            <span class="t-acc-chevron text-muted-foreground"><ChevronDownIcon size={15} /></span>
          </button>
          <div class="t-acc-panel">
            <div class="t-acc-panel-inner">
              <div class="px-4 pb-4">
                <SkillManager projectId={data.project.id} />
              </div>
            </div>
          </div>
        </section>
      </aside>
    </div>
  </div>
</ScrollArea>

<Dialog.Root bind:open={instructionsOpen}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Instructions</Dialog.Title>
      <Dialog.Description>
        Applied to every conversation in this project — written to AGENTS.md.
      </Dialog.Description>
    </Dialog.Header>
    <form method="POST" action="?/saveInstructions" use:enhance={saveInstructionsEnhance}>
      <Textarea
        name="content"
        bind:value={instructions}
        class="min-h-44 font-mono text-sm"
        maxlength={65536}
        placeholder="e.g. Always respond concisely. Prefer TypeScript for code examples."
        aria-label="Project instructions"
      />
      <Dialog.Footer class="mt-4">
        <Button type="button" variant="outline" onclick={() => (instructionsOpen = false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={!instructionsDirty || savingInstructions}>
          {savingInstructions ? "Saving…" : "Save"}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={deleteOpen}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Delete project</Dialog.Title>
      <Dialog.Description>
        This permanently deletes "{data.project.name}", its conversations, and all files. This
        cannot be undone.
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (deleteOpen = false)}>Cancel</Button>
      <form method="POST" action="?/deleteProject" use:enhance>
        <Button type="submit" variant="destructive">Delete project</Button>
      </form>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
