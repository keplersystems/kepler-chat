<script lang="ts">
  import { modelCatalog } from '$lib/state/providers.svelte';
  import * as Select from '$lib/components/ui/select';
  import ProviderLogo from '$lib/components/ui/ProviderLogo.svelte';
  import type { Provider, ProviderModel, ModelSelection } from '$lib/types';
  import {
    buildProviderGroups,
    findModelOption,
    formatContext,
    getInputModalities,
    type ProviderGroup,
  } from './model-options';
  import AtomIcon from '@lucide/svelte/icons/atom';
  import AudioLinesIcon from '@lucide/svelte/icons/audio-lines';
  import CheckIcon from '@lucide/svelte/icons/check';
  import CircleFadingArrowUp from '@lucide/svelte/icons/circle-fading-arrow-up';
  import EyeIcon from '@lucide/svelte/icons/eye';
  import ImageIcon from '@lucide/svelte/icons/image';
  import PaperclipIcon from '@lucide/svelte/icons/paperclip';
  import SearchIcon from '@lucide/svelte/icons/search';
  import StarIcon from '@lucide/svelte/icons/star';
  import VideoIcon from '@lucide/svelte/icons/video';
  import WrenchIcon from '@lucide/svelte/icons/wrench';

  interface Props {
    providers?: Provider[];
    connectedProviders?: string[];
    selectedModel?: ModelSelection | null;
    onModelChange?: (model: ModelSelection) => void;
    disabled?: boolean;
  }

  const {
    providers = [],
    connectedProviders = [],
    selectedModel = null,
    onModelChange,
    disabled = false,
  }: Props = $props();

  let search = $state('');
  let open = $state(false);
  let searchInput: HTMLInputElement | null = $state(null);

  const providerGroups = $derived(buildProviderGroups(providers, connectedProviders));
  const allOptions = $derived(providerGroups.flatMap((g) => g.options));
  const selectedOption = $derived(findModelOption(providerGroups, selectedModel));
  const selectedValue = $derived(selectedOption?.value ?? '');

  const filteredGroups = $derived.by<ProviderGroup[]>(() => {
    const q = search.trim().toLowerCase();
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
    if (!search.trim() && modelCatalog.favorites.length > 0) {
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

  const triggerLabel = $derived.by(() => {
    if (selectedOption) return selectedOption.label;
    if (modelCatalog.error) return 'Models unavailable';
    if (allOptions.length === 0) return 'No models available';
    return 'Select model...';
  });

  function handleValueChange(value: string) {
    const option = allOptions.find((o) => o.value === value);
    if (option) {
      onModelChange?.({ providerID: option.providerId, modelID: option.modelId });
    }
  }

  $effect(() => {
    if (open) {
      // Focus the search input once Select.Content has mounted.
      queueMicrotask(() => searchInput?.focus());
    } else {
      search = '';
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
    {#if caps.output.image}{@render capabilityBadge('Image generation', ImageIcon)}{/if}
    {#if caps.reasoning}{@render capabilityBadge('Reasoning', AtomIcon)}{/if}
    {#if caps.toolcall}{@render capabilityBadge('Tool calling', WrenchIcon)}{/if}
    {#if model.status === 'alpha' || model.status === 'beta'}{@render capabilityBadge(model.status, CircleFadingArrowUp)}{/if}
  </div>
{/snippet}

<Select.Root
  type="single"
  value={selectedValue}
  onValueChange={handleValueChange}
  disabled={disabled || allOptions.length === 0}
  items={allOptions}
  bind:open
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
            bind:value={search}
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
          {@const ctx = formatContext(option.model.limit.context)}
          <Select.Item value={option.value} label={option.label} class="rounded-md px-2">
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
        No models match "{search}"
      </div>
    {/if}
  </Select.Content>
</Select.Root>
