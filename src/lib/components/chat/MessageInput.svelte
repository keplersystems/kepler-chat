<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import * as Select from '$lib/components/ui/select';
  import ProviderLogo from '$lib/components/ui/ProviderLogo.svelte';
  import type { Provider, ProviderModel, ModelSelection, AttachmentModality } from '$lib/types';
  import AtomIcon from '@lucide/svelte/icons/atom';
  import AudioLinesIcon from '@lucide/svelte/icons/audio-lines';
  import CircleFadingArrowUp from '@lucide/svelte/icons/circle-fading-arrow-up';
  import EyeIcon from '@lucide/svelte/icons/eye';
  import ImageIcon from '@lucide/svelte/icons/image';
  import CheckIcon from '@lucide/svelte/icons/check';
  import PaperclipIcon from '@lucide/svelte/icons/paperclip';
  import SearchIcon from '@lucide/svelte/icons/search';
  import SendIcon from '@lucide/svelte/icons/send';
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
    onSubmit: (text: string, model: ModelSelection, files?: File[]) => Promise<boolean>;
    disabled?: boolean;
    placeholder?: string;
    providers?: Provider[];
    connectedProviders?: string[];
    selectedModel?: ModelSelection | null;
    onModelChange?: (model: ModelSelection) => void;
  }

  let {
    onSubmit,
    disabled = false,
    placeholder = 'Message...',
    providers = [],
    connectedProviders = [],
    selectedModel = null,
    onModelChange,
  }: Props = $props();

  let text = $state('');
  let files: File[] = $state([]);
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

  const selectedValue = $derived.by(() => {
    if (!selectedModel) return '';
    return `${selectedModel.providerID}:${selectedModel.modelID}`;
  });

  const selectedOption = $derived.by(() =>
    allOptions.find((option) => option.value === selectedValue) ?? null,
  );

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

  async function submit() {
    if (!text.trim() && files.length === 0) return;
    if (!selectedModel) return;

    const succeeded = await onSubmit(
      text.trim(),
      selectedModel,
      files.length > 0 ? files : undefined,
    );
    if (!succeeded) return;
    text = '';
    files = [];
    adjustHeight();
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
    if (modelPickerOpen) {
      // Focus the search input once Select.Content has mounted.
      queueMicrotask(() => searchInput?.focus());
    } else {
      modelSearch = '';
    }
  });
</script>

{#snippet capabilityBadges(model: ProviderModel)}
  {@const caps = model.capabilities}
  {@const inputModalities = getInputModalities(model)}
  {@const hasImageOutput = caps?.output?.image === true}
  {@const isPreview = model.status === 'alpha' || model.status === 'beta'}
  <div class="flex items-center gap-1">
    {#if inputModalities.has('image')}
      <Tooltip.Root>
        <Tooltip.Trigger
          class="rounded-sm bg-emerald-500/15 p-0.5 text-emerald-700 dark:text-emerald-300"
          aria-label="Vision"
        >
          <EyeIcon size={13} />
        </Tooltip.Trigger>
        <Tooltip.Content>Vision</Tooltip.Content>
      </Tooltip.Root>
    {/if}
    {#if inputModalities.has('audio')}
      <Tooltip.Root>
        <Tooltip.Trigger
          class="rounded-sm bg-sky-500/15 p-0.5 text-sky-700 dark:text-sky-300"
          aria-label="Audio input"
        >
          <AudioLinesIcon size={13} />
        </Tooltip.Trigger>
        <Tooltip.Content>Audio input</Tooltip.Content>
      </Tooltip.Root>
    {/if}
    {#if inputModalities.has('pdf')}
      <Tooltip.Root>
        <Tooltip.Trigger
          class="rounded-sm bg-rose-500/15 p-0.5 text-rose-700 dark:text-rose-300"
          aria-label="PDF input"
        >
          <PaperclipIcon size={13} />
        </Tooltip.Trigger>
        <Tooltip.Content>PDF input</Tooltip.Content>
      </Tooltip.Root>
    {/if}
    {#if inputModalities.has('video')}
      <Tooltip.Root>
        <Tooltip.Trigger
          class="rounded-sm bg-purple-500/15 p-0.5 text-purple-700 dark:text-purple-300"
          aria-label="Video input"
        >
          <VideoIcon size={13} />
        </Tooltip.Trigger>
        <Tooltip.Content>Video input</Tooltip.Content>
      </Tooltip.Root>
    {/if}
    {#if hasImageOutput}
      <Tooltip.Root>
        <Tooltip.Trigger
          class="rounded-sm bg-fuchsia-500/15 p-0.5 text-fuchsia-700 dark:text-fuchsia-300"
          aria-label="Image generation"
        >
          <ImageIcon size={13} />
        </Tooltip.Trigger>
        <Tooltip.Content>Image generation</Tooltip.Content>
      </Tooltip.Root>
    {/if}
    {#if caps?.reasoning}
      <Tooltip.Root>
        <Tooltip.Trigger
          class="rounded-sm bg-amber-500/15 p-0.5 text-amber-700 dark:text-amber-300"
          aria-label="Reasoning"
        >
          <AtomIcon size={13} />
        </Tooltip.Trigger>
        <Tooltip.Content>Reasoning</Tooltip.Content>
      </Tooltip.Root>
    {/if}
    {#if caps?.toolcall}
      <Tooltip.Root>
        <Tooltip.Trigger
          class="rounded-sm bg-indigo-500/15 p-0.5 text-indigo-700 dark:text-indigo-300"
          aria-label="Tool calling"
        >
          <WrenchIcon size={13} />
        </Tooltip.Trigger>
        <Tooltip.Content>Tool calling</Tooltip.Content>
      </Tooltip.Root>
    {/if}
    {#if isPreview}
      <Tooltip.Root>
        <Tooltip.Trigger
          class="rounded-sm bg-cyan-500/15 p-0.5 text-cyan-700 dark:text-cyan-300"
          aria-label={model.status}
        >
          <CircleFadingArrowUp size={13} />
        </Tooltip.Trigger>
        <Tooltip.Content>{model.status}</Tooltip.Content>
      </Tooltip.Root>
    {/if}
  </div>
{/snippet}

<div class="border-t bg-background px-4 py-4">
  <div
    class="rounded-2xl border bg-card shadow-sm transition-shadow {isDragging ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : ''}"
    ondrop={handleDrop}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    role="region"
    aria-label="Message composer"
  >
    {#if files.length > 0}
      <div class="flex flex-wrap gap-2 px-3 pt-3">
        {#each files as file, index (file.name + index)}
          <div class="flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-xs">
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
      <div class="mx-3 mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
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
      oninput={adjustHeight}
      {placeholder}
      disabled={disabled || !selectedModel}
      rows="1"
      class="block w-full resize-none border-0 bg-transparent px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      style="min-height: 48px; max-height: 200px;"
    ></textarea>

    <div class="flex items-center justify-between gap-2 px-2 pb-2">
      <div class="flex items-center gap-1">
        <Tooltip.Root>
          <Tooltip.Trigger
            onclick={openFilePicker}
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="Add files"
          >
            <PaperclipIcon size={18} />
          </Tooltip.Trigger>
          <Tooltip.Content>Add files</Tooltip.Content>
        </Tooltip.Root>

        <Select.Root
          type="single"
          value={selectedValue}
          onValueChange={handleModelChange}
          disabled={disabled || allOptions.length === 0}
          items={allOptions}
          bind:open={modelPickerOpen}
        >
          <Select.Trigger class="h-8 w-fit max-w-[320px] border-0 bg-transparent px-2 text-xs shadow-none hover:bg-accent">
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
            {#each filteredGroups as group (group.providerId)}
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
                      {#if selected}
                        <CheckIcon size={12} strokeWidth={2.5} class="opacity-80" />
                      {/if}
                    {/snippet}
                  </Select.Item>
                {/each}
              </Select.Group>
            {/each}
            {#if filteredGroups.length === 0}
              <div class="px-3 py-6 text-center text-xs text-muted-foreground">
                No models match "{modelSearch}"
              </div>
            {/if}
          </Select.Content>
        </Select.Root>
      </div>

      <Button
        onclick={submit}
        disabled={disabled || !selectedModel || (!text.trim() && files.length === 0)}
        size="icon"
        class="h-9 w-9"
        aria-label="Send message"
      >
        <SendIcon size={16} />
      </Button>
    </div>
  </div>

  <div class="mt-2 text-center text-xs text-muted-foreground">
    Shift + Enter for new line • Drag and drop files anywhere
  </div>
</div>
