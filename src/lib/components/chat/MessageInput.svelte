<script lang="ts">
  import { fly, scale, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import MediaPickerDialog from './MediaPickerDialog.svelte';
  import ModelPicker from './ModelPicker.svelte';
  import * as Select from '$lib/components/ui/select';
  import type { Provider, ModelSelection, AttachmentModality } from '$lib/types';
  import type { MediaDTO } from '$lib/contracts';
  import {
    buildProviderGroups,
    fileToModality,
    findModelOption,
    getInputModalities,
  } from './model-options';
  import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
  import AtomIcon from '@lucide/svelte/icons/atom';
  import ImagesIcon from '@lucide/svelte/icons/images';
  import UploadIcon from '@lucide/svelte/icons/upload';
  import PaperclipIcon from '@lucide/svelte/icons/paperclip';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import SquareIcon from '@lucide/svelte/icons/square';
  import XIcon from '@lucide/svelte/icons/x';

  interface Props {
    onSubmit: (
      text: string,
      model: ModelSelection,
      files?: File[],
      mediaIds?: string[],
      variant?: string,
    ) => Promise<boolean>;
    disabled?: boolean;
    isStreaming?: boolean;
    onStop?: () => void;
    placeholder?: string;
    providers?: Provider[];
    connectedProviders?: string[];
    selectedModel?: ModelSelection | null;
    onModelChange?: (model: ModelSelection) => void;
    text?: string;
    contextTokens?: number;
    onCompact?: () => Promise<void>;
  }

  let {
    onSubmit,
    disabled = false,
    isStreaming = false,
    onStop,
    placeholder = 'Message...',
    providers = [],
    connectedProviders = [],
    selectedModel = null,
    onModelChange,
    text = $bindable(''),
    contextTokens = 0,
    onCompact,
  }: Props = $props();

  const MAX_TEXTAREA_HEIGHT = 240;

  let files: File[] = $state([]);
  let libraryItems: MediaDTO[] = $state([]);
  let libraryOpen = $state(false);
  let variant = $state('');
  let compacting = $state(false);
  let queued = $state<{
    text: string;
    files: File[];
    libraryItems: MediaDTO[];
    variant: string;
  } | null>(null);
  let textarea: HTMLTextAreaElement | null = $state(null);
  let fileInput: HTMLInputElement | null = $state(null);
  let isDragging = $state(false);

  const selectedOption = $derived(
    findModelOption(buildProviderGroups(providers, connectedProviders), selectedModel),
  );

  const variantOptions = $derived(Object.keys(selectedOption?.model.variants ?? {}));

  const contextLimit = $derived(selectedOption?.model.limit.context ?? 0);
  const contextPct = $derived(
    contextLimit > 0 && contextTokens > 0
      ? Math.min(100, Math.round((contextTokens / contextLimit) * 100))
      : 0,
  );

  const compatibilityWarning = $derived.by(() => {
    if (!selectedOption || files.length === 0) return null;
    const model = selectedOption.model;

    const supported = getInputModalities(model);
    const explicitlyNoAttachment = model.capabilities.attachment === false;

    const unsupportedFiles = files
      .map((file) => ({ file, modality: fileToModality(file) }))
      .filter(
        (entry): entry is { file: File; modality: AttachmentModality } =>
          entry.modality !== null,
      )
      .filter((entry) => explicitlyNoAttachment || !supported.has(entry.modality));

    if (unsupportedFiles.length === 0) return null;

    return {
      unsupportedModalities: Array.from(
        new Set(unsupportedFiles.map((e) => e.modality)),
      ),
    };
  });

  /** Exposed so the page's error banner can re-fire the restored draft. */
  export function requestSubmit() {
    void submit();
  }

  async function compact() {
    if (!onCompact || compacting) return;
    compacting = true;
    try {
      await onCompact();
    } finally {
      compacting = false;
    }
  }

  $effect(() => {
    if (variant && !variantOptions.includes(variant)) variant = '';
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  function handlePaste(event: ClipboardEvent) {
    const pasted = Array.from(event.clipboardData?.files ?? []);
    if (pasted.length === 0) return;
    event.preventDefault();
    files = [...files, ...pasted];
  }

  function setDraft(draft: { text: string; files: File[]; libraryItems: MediaDTO[]; variant: string }) {
    text = draft.text;
    files = draft.files;
    libraryItems = draft.libraryItems;
    variant = draft.variant;
    adjustHeight();
  }

  async function submit() {
    if (!text.trim() && files.length === 0 && libraryItems.length === 0) return;
    if (!selectedModel) return;
    if (isStreaming) {
      queued = { text: text.trim(), files, libraryItems, variant };
      setDraft({ text: '', files: [], libraryItems: [], variant });
      return;
    }

    // Clear immediately so the composer is ready while the reply streams;
    // restore the draft if the send fails.
    const sent = { text: text.trim(), files, libraryItems, variant };
    setDraft({ text: '', files: [], libraryItems: [], variant });

    const succeeded = await onSubmit(
      sent.text,
      selectedModel,
      sent.files.length > 0 ? sent.files : undefined,
      sent.libraryItems.length > 0 ? sent.libraryItems.map((m) => m.id) : undefined,
      sent.variant || undefined,
    );
    if (!succeeded) {
      setDraft(sent);
    }
  }

  function adjustHeight() {
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT) + 'px';
    }
  }

  function handleFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      files = [...files, ...Array.from(input.files)];
    }
    input.value = '';
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
    if (event.dataTransfer?.files) {
      files = [...files, ...Array.from(event.dataTransfer.files)];
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragging = true;
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
  }

  function dequeue() {
    const next = queued;
    queued = null;
    if (next) setDraft(next);
  }

  $effect(() => {
    if (isStreaming || !queued) return;
    dequeue();
    void submit();
  });
</script>

{#snippet attachmentChip(label: string, Icon: typeof PaperclipIcon, onRemove: () => void)}
  <div
    class="flex items-center gap-2 rounded-lg border bg-secondary px-2.5 py-1 text-xs"
    in:fly={{ y: 4, duration: 220, easing: cubicOut }}
    out:scale={{ start: 0.85, duration: 160, opacity: 0 }}
  >
    <Icon size={12} />
    <span class="max-w-[150px] truncate">{label}</span>
    <button onclick={onRemove} class="rounded-sm opacity-60 hover:opacity-100" aria-label="Remove attachment">
      <XIcon size={12} />
    </button>
  </div>
{/snippet}

<div
  class="kepler-composer rounded-xl border bg-card shadow-sm {isDragging ? 'is-dragging' : ''}"
    ondrop={handleDrop}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    role="region"
    aria-label="Message composer"
  >
    {#if files.length > 0 || libraryItems.length > 0}
      <div class="flex flex-wrap gap-2 px-3 pt-3" transition:slide={{ duration: 220, easing: cubicOut }}>
        {#each libraryItems as item (item.id)}
          {@render attachmentChip(item.filename, ImagesIcon, () =>
            (libraryItems = libraryItems.filter((m) => m.id !== item.id)),
          )}
        {/each}
        {#each files as file, index (file.name + index)}
          {@render attachmentChip(file.name, PaperclipIcon, () =>
            (files = files.filter((_, i) => i !== index)),
          )}
        {/each}
      </div>
    {/if}

    {#if compatibilityWarning}
      <div
        class="mx-3 mt-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs"
        transition:slide={{ duration: 240, easing: cubicOut }}
      >
        Selected model may not natively support: {compatibilityWarning.unsupportedModalities.join(', ')}.
        Tools may still handle these files.
      </div>
    {/if}

    <input
      bind:this={fileInput}
      type="file"
      multiple
      accept="*/*"
      onchange={handleFilesSelected}
      class="hidden"
    />

    <textarea
      bind:this={textarea}
      bind:value={text}
      onkeydown={handleKeydown}
      onpaste={handlePaste}
      oninput={adjustHeight}
      {placeholder}
      disabled={disabled || !selectedModel}
      rows="1"
      class="block w-full resize-none border-0 bg-transparent px-5 pb-2 pt-4 text-[15px] placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      style="min-height: 64px; max-height: {MAX_TEXTAREA_HEIGHT}px;"
    ></textarea>

    {#if queued}
      <div class="mx-3 mb-1 flex w-fit items-center gap-2 rounded-lg border bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
        <span class="max-w-[240px] truncate">Queued: {queued.text || "attachments"}</span>
        <button
          onclick={dequeue}
          class="rounded-sm opacity-60 hover:opacity-100"
          aria-label="Cancel queued message"
        >
          <XIcon size={12} />
        </button>
      </div>
    {/if}
    <div class="flex items-center justify-between gap-2 px-3 pb-3">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Add files"
        >
          <PlusIcon size={17} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="start">
          <DropdownMenu.Item onSelect={() => fileInput?.click()}>
            <UploadIcon size={14} class="opacity-70" />
            Upload files
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => (libraryOpen = true)}>
            <ImagesIcon size={14} class="opacity-70" />
            Add from library
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      <div class="flex min-w-0 items-center gap-1.5">
        {#if compacting}
          <span class="t-shimmer shrink-0 font-mono text-[10px]" data-text="compacting…">
            compacting…
          </span>
        {:else if contextPct > 0}
          {#if onCompact}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                class="shrink-0 rounded-md px-1 py-0.5 font-mono text-[10px] tabular-nums {contextPct >= 85
                  ? 'text-destructive'
                  : 'text-muted-foreground/70'} hover:bg-accent hover:text-foreground"
                aria-label="Context usage"
              >
                {contextPct}% ctx
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end" class="min-w-[13rem]">
                <p class="px-2.5 py-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                  ~{contextTokens.toLocaleString()} / {contextLimit.toLocaleString()} tokens
                </p>
                <DropdownMenu.Separator />
                <DropdownMenu.Item disabled={isStreaming} onSelect={compact}>
                  Compact conversation
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          {:else}
            <span
              class="shrink-0 font-mono text-[10px] tabular-nums {contextPct >= 85
                ? 'text-destructive'
                : 'text-muted-foreground/70'}"
              title={`Context used: ~${contextTokens.toLocaleString()} of ${contextLimit.toLocaleString()} tokens`}
            >
              {contextPct}% ctx
            </span>
          {/if}
        {/if}
        {#if variantOptions.length > 0}
          <Select.Root type="single" bind:value={variant}>
            <Select.Trigger
              class="h-8 w-fit border-0 bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-accent hover:text-foreground"
              aria-label="Reasoning effort"
            >
              <AtomIcon size={13} class="opacity-70" />
              <span class="capitalize">{variant || "default"}</span>
            </Select.Trigger>
            <Select.Content class="min-w-[8rem]">
              <Select.Item value="" label="default">
                <span class="flex-1 capitalize">default</span>
              </Select.Item>
              {#each variantOptions as option (option)}
                <Select.Item value={option} label={option}>
                  <span class="flex-1 capitalize">{option}</span>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        {/if}

        <ModelPicker {providers} {connectedProviders} {selectedModel} {onModelChange} {disabled} />

        <Button
          onclick={() => (isStreaming && onStop ? onStop() : submit())}
          disabled={!isStreaming &&
            (disabled ||
              !selectedModel ||
              (!text.trim() && files.length === 0 && libraryItems.length === 0))}
          size="icon"
          class="h-9 w-9 shrink-0 rounded-xl"
          aria-label={isStreaming && onStop ? "Stop generating" : "Send message"}
        >
          <span class="t-icon-swap" data-state={isStreaming && onStop ? "b" : "a"}>
            <span class="t-icon" data-icon="a"><ArrowUpIcon size={16} strokeWidth={2.25} /></span>
            <span class="t-icon" data-icon="b"><SquareIcon size={13} fill="currentColor" /></span>
          </span>
        </Button>
      </div>
    </div>
</div>

<MediaPickerDialog
  bind:open={libraryOpen}
  onAttach={(items) => (libraryItems = [...libraryItems, ...items.filter((i) => !libraryItems.some((l) => l.id === i.id))])}
/>

<style>
  .kepler-composer {
    transition:
      box-shadow var(--duration-fast) var(--ease-smooth-out),
      border-color var(--duration-fast) var(--ease-smooth-out),
      transform var(--duration-fast) var(--ease-smooth-out);
  }
  .kepler-composer:focus-within {
    border-color: color-mix(in oklch, var(--ring) 55%, transparent);
    box-shadow: 0 0 0 3px color-mix(in oklch, var(--ring) 16%, transparent);
  }
  .kepler-composer.is-dragging {
    border-color: var(--ring);
    box-shadow: 0 0 0 4px color-mix(in oklch, var(--ring) 22%, transparent);
    transform: translateY(-1px);
  }
</style>
