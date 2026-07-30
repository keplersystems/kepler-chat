<script lang="ts">
  import { fade, fly, scale, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { modelCatalog } from '$lib/state/providers.svelte';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import MediaPickerDialog from './MediaPickerDialog.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import * as Select from '$lib/components/ui/select';
  import ProviderLogo from '$lib/components/ui/ProviderLogo.svelte';
  import type { Provider, ProviderModel, ModelSelection, AttachmentModality } from '$lib/types';
  import type { MediaDTO } from '$lib/contracts';
  import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
  import AtomIcon from '@lucide/svelte/icons/atom';
  import AudioLinesIcon from '@lucide/svelte/icons/audio-lines';
  import CircleFadingArrowUp from '@lucide/svelte/icons/circle-fading-arrow-up';
  import EyeIcon from '@lucide/svelte/icons/eye';
  import ImageIcon from '@lucide/svelte/icons/image';
  import ImagesIcon from '@lucide/svelte/icons/images';
  import UploadIcon from '@lucide/svelte/icons/upload';
  import CheckIcon from '@lucide/svelte/icons/check';
  import PaperclipIcon from '@lucide/svelte/icons/paperclip';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import SearchIcon from '@lucide/svelte/icons/search';
  import SquareIcon from '@lucide/svelte/icons/square';
  import StarIcon from '@lucide/svelte/icons/star';
  import VideoIcon from '@lucide/svelte/icons/video';
  import WrenchIcon from '@lucide/svelte/icons/wrench';
  import XIcon from '@lucide/svelte/icons/x';

  interface ModelOption {
    value: string;
    label: string;
    providerId: string;
    providerName: string;
    modelId: string;
    model: ProviderModel;
  }

  interface ProviderGroup {
    providerId: string;
    providerName: string;
    options: ModelOption[];
  }

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

  let files: File[] = $state([]);
  let libraryItems: MediaDTO[] = $state([]);
  let libraryOpen = $state(false);
  let variant = $state('');
  let compacting = $state(false);

  async function compact() {
    if (!onCompact || compacting) return;
    compacting = true;
    try {
      await onCompact();
    } finally {
      compacting = false;
    }
  }
  let queued = $state<{
    text: string;
    files: File[];
    libraryItems: MediaDTO[];
    variant: string;
  } | null>(null);
  let textarea: HTMLTextAreaElement | null = $state(null);
  let fileInput: HTMLInputElement | null = $state(null);
  let isDragging = $state(false);
  let modelSearch = $state('');
  let modelPickerOpen = $state(false);
  let searchInput: HTMLInputElement | null = $state(null);

  const providerGroups = $derived.by<ProviderGroup[]>(() => {
    const groups: ProviderGroup[] = [];
    for (const provider of providers) {
      if (!connectedProviders.includes(provider.id)) continue;
      if (!provider.models) continue;

      const options: ModelOption[] = [];
      for (const [modelId, model] of Object.entries(provider.models)) {
        const id = model.id || modelId;
        const name = model.name || id;
        options.push({
          value: `${provider.id}:${id}`,
          label: name,
          providerId: provider.id,
          providerName: provider.name || provider.id,
          modelId: id,
          model,
        });
      }
      if (options.length === 0) continue;
      groups.push({
        providerId: provider.id,
        providerName: provider.name || provider.id,
        options,
      });
    }
    return groups;
  });

  const allOptions = $derived.by<ModelOption[]>(() =>
    providerGroups.flatMap((g) => g.options),
  );

  const filteredGroups = $derived.by<ProviderGroup[]>(() => {
    const q = modelSearch.trim().toLowerCase();
    if (!q) return providerGroups;
    return providerGroups
      .map((group) => ({
        ...group,
        options: group.options.filter((opt) => {
          const haystack = `${opt.label} ${opt.modelId} ${group.providerName}`.toLowerCase();
          return haystack.includes(q);
        }),
      }))
      .filter((group) => group.options.length > 0);
  });

  // Rendering every model makes opening the picker block for seconds with
  // hundreds of catalog entries; cap the visible window and let search narrow.
  const VISIBLE_LIMIT = 80;
  const visibleGroups = $derived.by<ProviderGroup[]>(() => {
    const groups: ProviderGroup[] = [];
    let used = 0;
    if (!modelSearch.trim() && modelCatalog.favorites.length > 0) {
      const options = allOptions.filter((o) => modelCatalog.favorites.includes(o.value));
      if (options.length > 0) {
        groups.push({ providerId: '★favorites', providerName: 'Favorites', options });
        used += options.length;
      }
    }
    for (const group of filteredGroups) {
      if (used >= VISIBLE_LIMIT) break;
      const slice = group.options.slice(0, VISIBLE_LIMIT - used);
      used += slice.length;
      groups.push(slice.length === group.options.length ? group : { ...group, options: slice });
    }
    return groups;
  });
  const hiddenCount = $derived(
    filteredGroups.reduce((n, g) => n + g.options.length, 0) -
      visibleGroups.reduce((n, g) => n + g.options.length, 0),
  );

  const selectedValue = $derived.by(() => {
    if (!selectedModel) return '';
    return `${selectedModel.providerID}:${selectedModel.modelID}`;
  });

  const selectedOption = $derived.by(() =>
    allOptions.find((option) => option.value === selectedValue) ?? null,
  );

  const variantOptions = $derived(Object.keys(selectedOption?.model.variants ?? {}));

  const contextLimit = $derived(selectedOption?.model.limit?.context ?? 0);
  const contextPct = $derived(
    contextLimit > 0 && contextTokens > 0
      ? Math.min(100, Math.round((contextTokens / contextLimit) * 100))
      : 0,
  );

  /** Exposed so the page's error banner can re-fire the restored draft. */
  export function requestSubmit() {
    void submit();
  }

  $effect(() => {
    if (variant && !variantOptions.includes(variant)) variant = '';
  });

  function handleModelChange(value: string) {
    const option = allOptions.find((o) => o.value === value);
    if (option) {
      onModelChange?.({
        providerID: option.providerId,
        modelID: option.modelId,
      });
    }
  }

  function fileToModality(file: File): AttachmentModality | null {
    const mime = file.type.toLowerCase();
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime === 'application/pdf') return 'pdf';
    return null;
  }

  function getInputModalities(model: ProviderModel): Set<AttachmentModality> {
    const set = new Set<AttachmentModality>();
    const input = model.capabilities?.input;
    if (!input) return set;
    if (input.audio) set.add('audio');
    if (input.image) set.add('image');
    if (input.video) set.add('video');
    if (input.pdf) set.add('pdf');
    return set;
  }

  function formatContext(value: number | undefined): string | null {
    if (typeof value !== 'number' || value <= 0) return null;
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
    if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
    return String(value);
  }

  const compatibilityWarning = $derived.by(() => {
    if (!selectedOption || files.length === 0) return null;
    const model = selectedOption.model;

    const supported = getInputModalities(model);
    const explicitlyNoAttachment = model.capabilities?.attachment === false;

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
      unsupportedFiles,
    };
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

  async function submit() {
    if (!text.trim() && files.length === 0 && libraryItems.length === 0) return;
    if (!selectedModel) return;
    if (isStreaming) {
      queued = { text: text.trim(), files, libraryItems, variant };
      text = '';
      files = [];
      libraryItems = [];
      adjustHeight();
      return;
    }

    // Clear immediately so the composer is ready while the reply streams;
    // restore the draft if the send fails.
    const sentText = text.trim();
    const sentFiles = files.length > 0 ? files : undefined;
    const sentMedia = libraryItems.length > 0 ? libraryItems : undefined;
    text = '';
    files = [];
    libraryItems = [];
    adjustHeight();

    const succeeded = await onSubmit(
      sentText,
      selectedModel,
      sentFiles,
      sentMedia?.map((m) => m.id),
      variant || undefined,
    );
    if (!succeeded) {
      text = sentText;
      files = sentFiles ?? [];
      libraryItems = sentMedia ?? [];
      adjustHeight();
    }
  }

  function adjustHeight() {
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }

  function handleFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      const newFiles = Array.from(input.files);
      files = [...files, ...newFiles];
    }
    input.value = '';
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
    if (event.dataTransfer?.files) {
      const newFiles = Array.from(event.dataTransfer.files);
      files = [...files, ...newFiles];
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

  function removeFile(index: number) {
    files = files.filter((_, i) => i !== index);
  }

  function openFilePicker() {
    fileInput?.click();
  }

  const triggerLabel = $derived.by(() => {
    if (selectedOption) return selectedOption.label;
    if (allOptions.length === 0) return 'No models available';
    return 'Select model...';
  });

  $effect(() => {
    if (isStreaming || !queued) return;
    const next = queued;
    queued = null;
    text = next.text;
    files = next.files;
    libraryItems = next.libraryItems;
    variant = next.variant;
    void submit();
  });

  $effect(() => {
    if (modelPickerOpen) {
      // Focus the search input once Select.Content has mounted.
      queueMicrotask(() => searchInput?.focus());
    } else {
      modelSearch = '';
    }
  });
</script>

{#snippet capabilityBadge(label: string, Icon: typeof EyeIcon)}
  <span class="rounded-sm p-0.5 text-muted-foreground/70" title={label} aria-label={label}>
    <Icon size={13} />
  </span>
{/snippet}

{#snippet capabilityBadges(model: ProviderModel)}
  {@const caps = model.capabilities}
  {@const inputModalities = getInputModalities(model)}
  <div class="flex items-center gap-0.5">
    {#if inputModalities.has('image')}{@render capabilityBadge('Vision', EyeIcon)}{/if}
    {#if inputModalities.has('audio')}{@render capabilityBadge('Audio input', AudioLinesIcon)}{/if}
    {#if inputModalities.has('pdf')}{@render capabilityBadge('PDF input', PaperclipIcon)}{/if}
    {#if inputModalities.has('video')}{@render capabilityBadge('Video input', VideoIcon)}{/if}
    {#if caps?.output?.image === true}{@render capabilityBadge('Image generation', ImageIcon)}{/if}
    {#if caps?.reasoning}{@render capabilityBadge('Reasoning', AtomIcon)}{/if}
    {#if caps?.toolcall}{@render capabilityBadge('Tool calling', WrenchIcon)}{/if}
    {#if model.status === 'alpha' || model.status === 'beta'}{@render capabilityBadge(model.status, CircleFadingArrowUp)}{/if}
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
          <div
            class="flex items-center gap-2 rounded-lg border bg-secondary px-2.5 py-1 text-xs"
            in:fly={{ y: 4, duration: 220, easing: cubicOut }}
            out:scale={{ start: 0.85, duration: 160, opacity: 0 }}
          >
            <ImagesIcon size={12} />
            <span class="max-w-[150px] truncate">{item.filename}</span>
            <button
              onclick={() => (libraryItems = libraryItems.filter((m) => m.id !== item.id))}
              class="rounded-sm opacity-60 hover:opacity-100"
              aria-label="Remove attachment"
            >
              <XIcon size={12} />
            </button>
          </div>
        {/each}
        {#each files as file, index (file.name + index)}
          <div
            class="flex items-center gap-2 rounded-lg border bg-secondary px-2.5 py-1 text-xs"
            in:fly={{ y: 4, duration: 220, easing: cubicOut }}
            out:scale={{ start: 0.85, duration: 160, opacity: 0 }}
          >
            <PaperclipIcon size={12} />
            <span class="max-w-[150px] truncate">{file.name}</span>
            <button
              onclick={() => removeFile(index)}
              class="rounded-sm opacity-60 hover:opacity-100"
              aria-label="Remove file"
            >
              <XIcon size={12} />
            </button>
          </div>
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
      style="min-height: 64px; max-height: 240px;"
    ></textarea>

    {#if queued}
      <div class="mx-3 mb-1 flex w-fit items-center gap-2 rounded-lg border bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
        <span class="max-w-[240px] truncate">Queued: {queued.text || "attachments"}</span>
        <button
          onclick={() => {
            const next = queued;
            queued = null;
            if (next) {
              text = next.text;
              files = next.files;
              libraryItems = next.libraryItems;
              variant = next.variant;
            }
          }}
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
          <DropdownMenu.Item onSelect={openFilePicker}>
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
        <Select.Root
          type="single"
          value={selectedValue}
          onValueChange={handleModelChange}
          disabled={disabled || allOptions.length === 0}
          items={allOptions}
          bind:open={modelPickerOpen}
        >
          <Select.Trigger class="h-8 w-fit max-w-[320px] border-0 bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-accent hover:text-foreground">
            {#if selectedOption}
              <ProviderLogo providerId={selectedOption.providerId} size={13} class="opacity-80" />
            {/if}
            <span class="truncate">{triggerLabel}</span>
          </Select.Trigger>
          <Select.Content class="w-[420px] max-h-[480px]">
            {#snippet header()}
              <div class="border-b p-1.5">
                <div class="flex items-center gap-1.5 rounded-md bg-muted/50 px-2">
                  <SearchIcon size={13} class="shrink-0 opacity-60" />
                  <input
                    bind:this={searchInput}
                    bind:value={modelSearch}
                    placeholder="Search models..."
                    class="w-full bg-transparent py-1.5 text-xs outline-none placeholder:text-muted-foreground"
                    onkeydown={(e) => {
                      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') return;
                      e.stopPropagation();
                    }}
                  />
                </div>
              </div>
            {/snippet}
            {#each visibleGroups as group (group.providerId)}
              <Select.Group>
                <Select.GroupHeading
                  class="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                >
                  {group.providerName}
                </Select.GroupHeading>
                {#each group.options as option (option.value)}
                  {@const ctx = formatContext(option.model.limit?.context)}
                  <Select.Item
                    value={option.value}
                    label={option.label}
                    class="relative flex w-full cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                  >
                    {#snippet children({ selected })}
                      <ProviderLogo providerId={option.providerId} size={13} class="opacity-80" />
                      <span class="flex-1 truncate">{option.label}</span>
                      {@render capabilityBadges(option.model)}
                      {#if ctx}
                        <span class="font-mono text-[10px] tabular-nums text-muted-foreground">{ctx}</span>
                      {/if}
                      <button
                        type="button"
                        onclick={(e) => {
                          e.stopPropagation();
                          modelCatalog.toggleFavorite(option.value);
                        }}
                        class="rounded-sm p-0.5 {modelCatalog.favorites.includes(option.value)
                          ? 'text-primary'
                          : 'text-muted-foreground/40 hover:text-muted-foreground'}"
                        aria-label={modelCatalog.favorites.includes(option.value)
                          ? `Unfavorite ${option.label}`
                          : `Favorite ${option.label}`}
                      >
                        <StarIcon
                          size={12}
                          fill={modelCatalog.favorites.includes(option.value) ? "currentColor" : "none"}
                        />
                      </button>
                      {#if selected}
                        <CheckIcon size={12} strokeWidth={2.5} class="opacity-80" />
                      {/if}
                    {/snippet}
                  </Select.Item>
                {/each}
              </Select.Group>
            {/each}
            {#if hiddenCount > 0}
              <div class="px-3 py-2 text-center text-xs text-muted-foreground">
                {hiddenCount} more — search to narrow
              </div>
            {/if}
            {#if filteredGroups.length === 0}
              <div class="px-3 py-6 text-center text-xs text-muted-foreground">
                No models match "{modelSearch}"
              </div>
            {/if}
          </Select.Content>
        </Select.Root>

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
