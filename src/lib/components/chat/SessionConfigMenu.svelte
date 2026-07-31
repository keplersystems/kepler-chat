<script lang="ts">
  import * as Select from "$lib/components/ui/select";
  import ProviderLogo from "$lib/components/ui/ProviderLogo.svelte";
  import type { ModelInfo, SessionConfigDTO, SessionConfigOption } from "$lib/contracts";
  import { isModelOption } from "$lib/contracts";
  import { flattenSelectValues, type FlatConfigValue } from "$lib/state/session-config.svelte";
  import { modelPrefs } from "$lib/state/model-prefs.svelte";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import AtomIcon from "@lucide/svelte/icons/atom";
  import AudioLinesIcon from "@lucide/svelte/icons/audio-lines";
  import CheckIcon from "@lucide/svelte/icons/check";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import EyeIcon from "@lucide/svelte/icons/eye";
  import ImageIcon from "@lucide/svelte/icons/image";
  import PaperclipIcon from "@lucide/svelte/icons/paperclip";
  import SearchIcon from "@lucide/svelte/icons/search";
  import StarIcon from "@lucide/svelte/icons/star";
  import VideoIcon from "@lucide/svelte/icons/video";
  import WrenchIcon from "@lucide/svelte/icons/wrench";

  interface Props {
    config: SessionConfigDTO | null;
    modelInfo?: Record<string, ModelInfo>;
    disabled?: boolean;
    onConfigChange?: (configId: string, value: string) => void;
  }

  const { config, modelInfo = {}, disabled = false, onConfigChange }: Props =
    $props();

  /** Modes are a separate ACP concept but belong with the rest of the controls. */
  interface Panel {
    id: string;
    label: string;
    values: FlatConfigValue[];
    currentValue: string;
    apply: (value: string) => void;
  }

  const selectPanels = $derived.by((): Panel[] => {
    const panels = (config?.configOptions ?? [])
      .filter((option): option is Extract<SessionConfigOption, { type: "select" }> =>
        option.type === "select",
      )
      .map((option) => ({
        id: option.id,
        label: option.name,
        values: flattenSelectValues(option),
        currentValue: option.currentValue,
        apply: (value: string) => onConfigChange?.(option.id, value),
      }));
    return panels;
  });

  const modelPanel = $derived(
    selectPanels.find((panel) => {
      const option = config?.configOptions.find((entry) => entry.id === panel.id);
      return option ? isModelOption(option) : false;
    }) ?? null,
  );
  const otherPanels = $derived(selectPanels.filter((panel) => panel !== modelPanel));

  // Only reasoning effort rides along in the trigger; the rest would turn it
  // into a wall of values. Everything stays reachable from the footer rows.
  const secondaryPanel = $derived(
    otherPanels.find((panel) => {
      const option = config?.configOptions.find((entry) => entry.id === panel.id);
      return option?.category === "thought_level";
    }) ?? null,
  );

  const nameOf = (panel: Panel) =>
    panel.values.find((value) => value.id === panel.currentValue)?.name ?? panel.currentValue;

  let open = $state(false);
  let activeId = $state<string | null>(null);
  let search = $state("");
  let searchInput: HTMLInputElement | null = $state(null);

  const active = $derived(
    activeId ? (selectPanels.find((panel) => panel.id === activeId) ?? null) : modelPanel,
  );
  const isModelPanel = $derived(active !== null && active === modelPanel);

  const filtered = $derived.by(() => {
    if (!active) return [];
    const query = search.trim().toLowerCase();
    if (!query) return active.values;
    return active.values.filter((value) =>
      `${value.name} ${value.id}`.toLowerCase().includes(query),
    );
  });

  const favorites = $derived(
    isModelPanel && !search.trim()
      ? filtered.filter((value) => modelPrefs.isFavorite(value.id))
      : [],
  );
  const rest = $derived(
    favorites.length > 0
      ? filtered.filter((value) => !modelPrefs.isFavorite(value.id))
      : filtered,
  );

  // Long catalogues would block the popover open; cap and let search narrow.
  const VISIBLE_LIMIT = 80;
  const visible = $derived(rest.slice(0, Math.max(VISIBLE_LIMIT - favorites.length, 0)));
  const hiddenCount = $derived(rest.length - visible.length);

  function selectValue(valueId: string) {
    active?.apply(valueId);
    open = false;
  }

  function openPanel(panelId: string) {
    activeId = panelId;
    search = "";
  }

  function capabilityBadges(info: ModelInfo) {
    return [
      { show: info.input.includes("image"), label: "Vision", icon: EyeIcon },
      { show: info.input.includes("audio"), label: "Audio input", icon: AudioLinesIcon },
      { show: info.input.includes("pdf"), label: "PDF input", icon: PaperclipIcon },
      { show: info.input.includes("video"), label: "Video input", icon: VideoIcon },
      { show: info.output.includes("image"), label: "Image generation", icon: ImageIcon },
      { show: info.reasoning, label: "Reasoning", icon: AtomIcon },
      { show: info.toolCall, label: "Tool calling", icon: WrenchIcon },
    ].filter((badge) => badge.show);
  }

  function formatContext(limit: number | null): string {
    if (!limit) return "";
    return limit >= 1_000_000
      ? `${(limit / 1_000_000).toFixed(limit % 1_000_000 === 0 ? 0 : 1)}M`
      : `${Math.round(limit / 1000)}K`;
  }
</script>

{#if modelPanel || otherPanels.length > 0}
  <Select.Root
    type="single"
    value={active?.currentValue ?? ""}
    onValueChange={(value) => value && selectValue(value)}
    bind:open
    {disabled}
    onOpenChange={(isOpen) => {
      if (isOpen) queueMicrotask(() => searchInput?.focus());
      else {
        search = "";
        activeId = null;
      }
    }}
  >
    <Select.Trigger
      class="h-8 gap-1.5 border-0 bg-transparent px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
      aria-label="Model and session options"
    >
      {#if modelPanel}
        <ProviderLogo modelValue={modelPanel.currentValue} size={13} />
        <span class="max-w-[14ch] truncate sm:max-w-[20ch]">{nameOf(modelPanel)}</span>
      {/if}
      {#if secondaryPanel}
        <span class="max-w-[10ch] truncate text-muted-foreground/60">
          {nameOf(secondaryPanel)}
        </span>
      {/if}
    </Select.Trigger>

    <Select.Content
      class="max-h-[min(28rem,var(--bits-select-content-available-height,60vh))] w-[min(22rem,calc(100vw-2rem))]"
    >
      {#snippet header()}
        {#if !isModelPanel && active}
          <button
            type="button"
            class="flex w-full items-center gap-2 border-b px-2.5 py-2 text-sm hover:bg-accent"
            onclick={() => (activeId = null)}
          >
            <ArrowLeftIcon size={13} class="text-muted-foreground" />
            <span class="font-medium">{active.label}</span>
          </button>
        {:else if active && active.values.length > 8}
          <div class="flex items-center gap-2 border-b px-2.5 py-2">
            <SearchIcon size={13} class="shrink-0 text-muted-foreground" />
            <input
              bind:this={searchInput}
              bind:value={search}
              placeholder="Search models..."
              class="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              onkeydown={(event) => {
                if (!["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"].includes(event.key)) {
                  event.stopPropagation();
                }
              }}
            />
          </div>
        {/if}
      {/snippet}

      {#if favorites.length > 0}
        <Select.Group>
          <Select.GroupHeading
            class="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
          >
            Favorites
          </Select.GroupHeading>
          {#each favorites as value (value.id)}
            {@render valueRow(value)}
          {/each}
        </Select.Group>
      {/if}

      <Select.Group>
        {#each visible as value (value.id)}
          {@render valueRow(value)}
        {/each}
      </Select.Group>

      {#if filtered.length === 0}
        <p class="px-3 py-6 text-center text-sm text-muted-foreground">No matches</p>
      {:else if hiddenCount > 0}
        <p class="px-3 py-2 text-center text-xs text-muted-foreground">
          Showing {visible.length + favorites.length} of {filtered.length} — search to narrow
        </p>
      {/if}

      {#snippet footer()}
        {#if isModelPanel && otherPanels.length > 0}
          <div class="border-t p-1">
            {#each otherPanels as panel (panel.id)}
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-accent"
                onclick={() => openPanel(panel.id)}
              >
                <span class="flex-1 text-left">{panel.label}</span>
                <span class="max-w-[12ch] truncate text-xs text-muted-foreground">
                  {nameOf(panel)}
                </span>
                <ChevronRightIcon size={13} class="shrink-0 text-muted-foreground" />
              </button>
            {/each}
          </div>
        {/if}
      {/snippet}
    </Select.Content>
  </Select.Root>
{/if}

{#snippet valueRow(value: FlatConfigValue)}
  {@const info = modelInfo[value.id]}
  {@const favorite = modelPrefs.isFavorite(value.id)}
  <Select.Item value={value.id} class="gap-2">
    {#if isModelPanel}
      <ProviderLogo modelValue={value.id} size={14} />
    {/if}
    <span class="flex min-w-0 flex-1 flex-col">
      <span class="truncate">{value.name}</span>
      {#if value.description}
        <span class="truncate text-[11px] text-muted-foreground">{value.description}</span>
      {/if}
    </span>
    {#if info}
      <span class="flex shrink-0 items-center gap-0.5 text-muted-foreground/70">
        {#each capabilityBadges(info) as badge (badge.label)}
          <span title={badge.label} aria-label={badge.label}><badge.icon size={11} /></span>
        {/each}
        {#if info.contextLimit}
          <span class="ml-0.5 text-[10px] tabular-nums">{formatContext(info.contextLimit)}</span>
        {/if}
      </span>
    {/if}
    {#if isModelPanel}
      <button
        type="button"
        class="shrink-0 rounded-sm p-0.5 {favorite
          ? 'text-primary'
          : 'text-muted-foreground/40 hover:text-muted-foreground'}"
        aria-label={favorite ? `Unfavorite ${value.name}` : `Favorite ${value.name}`}
        onpointerup={(event) => event.preventDefault()}
        onclick={() => modelPrefs.toggleFavorite(value.id)}
      >
        <StarIcon size={12} fill={favorite ? "currentColor" : "none"} />
      </button>
    {/if}
    {#if value.id === active?.currentValue}
      <CheckIcon size={13} class="shrink-0" />
    {/if}
  </Select.Item>
{/snippet}
