<script lang="ts">
  import type { PartView } from "$lib/contracts";
  import { searchResults, type SearchResult } from "$lib/search-results";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { ThinkingOrb } from "$lib/components/ui/orb";
  import type { OrbState } from "$lib/components/ui/orb";
  import AtomIcon from "@lucide/svelte/icons/atom";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import GlobeIcon from "@lucide/svelte/icons/globe";
  import WrenchIcon from "@lucide/svelte/icons/wrench";
  import XIcon from "@lucide/svelte/icons/x";

  type ToolPart = Extract<PartView, { type: "tool" }>;

  interface Props {
    /** A run of consecutive reasoning and tool parts, in order. */
    parts: PartView[];
    /** True while this run is still being produced. */
    live?: boolean;
  }

  const { parts, live = false }: Props = $props();

  type Step =
    | { kind: "reasoning"; id: string; text: string }
    | { kind: "tool"; id: string; part: ToolPart; results: SearchResult[]; detail: string | null };

  /** rawInput is untyped wire data; these are the keys worth surfacing. */
  const DETAIL_KEYS = ["url", "query", "file_path", "path", "name", "command"];

  function detailOf(part: ToolPart): string | null {
    if (part.locations.length > 0) return part.locations[0].path;
    if (!part.rawInput || typeof part.rawInput !== "object") return null;
    const input = part.rawInput as Record<string, unknown>;
    for (const key of DETAIL_KEYS) {
      const value = input[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    return null;
  }

  function failureOf(part: ToolPart): string {
    return part.content
      .filter((item): item is Extract<typeof item, { type: "text" }> => item.type === "text")
      .map((item) => item.text)
      .join("\n")
      .trim();
  }

  const steps = $derived.by<Step[]>(() =>
    parts.flatMap((part): Step[] => {
      if (part.type === "reasoning") {
        const text = part.text.trim();
        return text ? [{ kind: "reasoning", id: part.id, text }] : [];
      }
      if (part.type !== "tool") return [];
      return [
        {
          kind: "tool",
          id: part.id,
          part,
          results: searchResults(part),
          detail: detailOf(part),
        },
      ];
    }),
  );

  const toolSteps = $derived(steps.filter((step) => step.kind === "tool"));
  const failed = $derived(toolSteps.some((step) => step.part.status === "failed"));

  /** Label and orb read the same signal, so the animation matches the words. */
  const running = $derived.by<{ label: string; orb: OrbState }>(() => {
    const last = steps.at(-1);
    if (!last) return { label: "Working…", orb: "working" };
    if (last.kind === "reasoning") return { label: "Reasoning…", orb: "solving" };
    if (last.results.length > 0 || last.part.kind === "fetch") {
      return { label: "Searching the web…", orb: "searching" };
    }
    if (last.part.kind === "read") return { label: "Reading…", orb: "searching" };
    return { label: `${last.part.title}…`, orb: "working" };
  });

  const summary = $derived.by(() => {
    if (live) return running.label;
    const phrases: string[] = [];
    const searched = toolSteps.filter((step) => step.results.length > 0).length;
    const read = toolSteps.filter((step) => step.part.kind === "read").length;
    const other = toolSteps.length - searched - read;
    if (searched) {
      phrases.push(searched === 1 ? "Searched the web" : `Searched the web ${searched} times`);
    }
    if (read) phrases.push(read === 1 ? "Read a file" : `Read ${read} files`);
    if (other) phrases.push(other === 1 ? "Used a tool" : `Used ${other} tools`);
    if (phrases.length === 0) return "Thought it through";
    return phrases.join(" · ");
  });

  /**
   * Result rows carry no favicon, so the domain seeds a stable hue: the same
   * source keeps the same chip colour across every message.
   */
  function monogramHue(domain: string): number {
    let hash = 0;
    for (const character of domain) hash = (hash * 31 + character.charCodeAt(0)) % 360;
    return hash;
  }

  // Follow the run while live; collapse when it ends unless the user has
  // taken over the toggle.
  let open = $state(false);
  let userToggled = $state(false);
  $effect(() => {
    if (userToggled) return;
    open = live;
  });
</script>

<Collapsible.Root bind:open onOpenChange={() => (userToggled = true)}>
  <Collapsible.Trigger
    class="group flex w-fit items-center gap-2 rounded-md py-0.5 pr-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    {#if live}
      <ThinkingOrb size={20} state={running.orb} />
    {:else if failed}
      <XIcon size={13} class="text-destructive" />
    {:else}
      <AtomIcon size={13} class="opacity-70" />
    {/if}
    <span class="font-medium">{summary}</span>
    <ChevronRightIcon
      size={12}
      class="opacity-60 transition-transform group-data-[state=open]:rotate-90"
    />
  </Collapsible.Trigger>

  <Collapsible.Content
    class="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden"
  >
    <ol class="mt-1.5">
      {#each steps as step, index (step.id)}
        <li class="flex gap-2.5">
          <div class="flex w-3.5 shrink-0 flex-col items-center pt-[3px]">
            <span class="text-muted-foreground/70" aria-hidden="true">
              {#if step.kind === "reasoning"}
                <AtomIcon size={13} />
              {:else if step.part.status === "failed"}
                <XIcon size={13} class="text-destructive" />
              {:else if step.results.length > 0 || step.part.kind === "fetch"}
                <GlobeIcon size={13} />
              {:else if step.part.kind === "read"}
                <FileTextIcon size={13} />
              {:else}
                <WrenchIcon size={13} />
              {/if}
            </span>
            {#if index < steps.length - 1 || !live}
              <span class="mt-1 w-px flex-1 bg-muted-foreground/25"></span>
            {/if}
          </div>

          <div class="min-w-0 flex-1 pb-3 text-[13px] leading-relaxed">
            {#if step.kind === "reasoning"}
              <p class="whitespace-pre-wrap text-muted-foreground/85">{step.text}</p>
            {:else}
              <div class="flex items-baseline gap-3">
                <span class="min-w-0 flex-1 truncate text-foreground/90">
                  {step.detail ?? step.part.title}
                </span>
                {#if step.results.length > 0}
                  <span class="shrink-0 text-xs text-muted-foreground">
                    {step.results.length} result{step.results.length === 1 ? "" : "s"}
                  </span>
                {/if}
              </div>

              {#if step.results.length > 0}
                <ul
                  class="mt-2 max-h-56 divide-y divide-border/50 overflow-y-auto rounded-lg border border-border/60 bg-card/40"
                >
                  {#each step.results as result (result.url)}
                    {@const hue = monogramHue(result.domain)}
                    <li>
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="flex items-center gap-2.5 px-3 py-2 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <span
                          aria-hidden="true"
                          class="grid size-4 shrink-0 place-items-center rounded-[4px] text-[9px] font-semibold uppercase"
                          style="background: oklch(0.65 0.14 {hue} / 0.2); color: oklch(0.58 0.14 {hue})"
                        >
                          {result.domain.replace(/^www\./, "").charAt(0)}
                        </span>
                        <span class="min-w-0 flex-1 truncate text-foreground/90">{result.title}</span>
                        <span class="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                          {result.domain}
                        </span>
                      </a>
                    </li>
                  {/each}
                </ul>
              {:else if step.part.status === "failed"}
                <p class="mt-1 whitespace-pre-wrap break-words text-xs text-destructive">
                  {failureOf(step.part)}
                </p>
              {/if}
            {/if}
          </div>
        </li>
      {/each}

      {#if !live}
        <li class="flex items-center gap-2.5 text-[13px] text-muted-foreground">
          <span class="flex w-3.5 shrink-0 justify-center" aria-hidden="true">
            <CircleCheckIcon size={13} />
          </span>
          <span>Done</span>
        </li>
      {/if}
    </ol>
  </Collapsible.Content>
</Collapsible.Root>
