<script lang="ts">
  import type { PartView, ToolStatus } from "$lib/contracts";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { ThinkingOrb } from "$lib/components/ui/orb";
  import CheckIcon from "@lucide/svelte/icons/check";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import CircleDashedIcon from "@lucide/svelte/icons/circle-dashed";
  import XIcon from "@lucide/svelte/icons/x";
  import DiffView from "./DiffView.svelte";

  interface Props {
    part: Extract<PartView, { type: "tool" }>;
  }

  const { part }: Props = $props();

  const status = $derived(part.status);
  const input = $derived(
    part.rawInput === undefined ? null : JSON.stringify(part.rawInput, null, 2),
  );
  const textContent = $derived(
    part.content
      .filter((item): item is Extract<typeof item, { type: "text" }> => item.type === "text")
      .map((item) => item.text)
      .join("\n"),
  );
  const diffs = $derived(
    part.content.filter((item): item is Extract<typeof item, { type: "diff" }> => item.type === "diff"),
  );

  // Open while active or failed; auto-close on completion unless the user
  // has taken over the toggle.
  let open = $state(false);
  let userToggled = $state(false);
  $effect(() => {
    if (userToggled) return;
    open = status === "in_progress" || status === "failed";
  });

  const railClass: Record<ToolStatus, string> = {
    pending: "border-l-border",
    in_progress: "border-l-activity",
    completed: "border-l-border",
    failed: "border-l-destructive",
  };

  const statusLabel: Record<ToolStatus, string> = {
    pending: "pending",
    in_progress: "running",
    completed: "done",
    failed: "failed",
  };
</script>

<Collapsible.Root
  bind:open
  onOpenChange={() => (userToggled = true)}
  class="overflow-hidden rounded-xl border border-l-2 bg-card/40 {railClass[status]}"
>
  <Collapsible.Trigger
    class="group flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
  >
    <span class="shrink-0 text-muted-foreground" aria-hidden="true">
      {#if status === "in_progress"}
        <ThinkingOrb size={20} state={part.kind === "fetch" || part.kind === "read" ? "searching" : "working"} />
      {:else if status === "completed"}
        <CheckIcon size={13} strokeWidth={2.5} class="opacity-70" />
      {:else if status === "failed"}
        <XIcon size={13} strokeWidth={2.5} class="text-destructive" />
      {:else}
        <CircleDashedIcon size={13} class="opacity-60" />
      {/if}
    </span>
    <span class="min-w-0 flex-1 truncate font-medium text-foreground/90">{part.title}</span>
    <span class="ml-auto shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground/70">
      {statusLabel[status]}
    </span>
    <ChevronRightIcon
      size={12}
      class="shrink-0 text-muted-foreground/70 transition-transform group-data-[state=open]:rotate-90"
    />
  </Collapsible.Trigger>
  <Collapsible.Content
    class="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden"
  >
    <div class="space-y-2 border-t border-border/60 px-3 py-2.5 text-xs">
      {#if part.locations.length > 0}
        <ul class="flex flex-wrap gap-1.5">
          {#each part.locations as location, index (index)}
            <li class="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px]">
              {location.path}{location.line != null ? `:${location.line}` : ""}
            </li>
          {/each}
        </ul>
      {/if}
      {#if input}
        <div>
          <div class="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Input
          </div>
          <pre class="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-relaxed">{input}</pre>
        </div>
      {/if}
      {#each diffs as diff, index (index)}
        <DiffView {diff} />
      {/each}
      {#if textContent}
        <div>
          <div class="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Output
          </div>
          <pre
            class="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md p-2 font-mono text-[11px] leading-relaxed {status ===
            'failed'
              ? 'bg-destructive/10 text-destructive'
              : 'bg-muted/60'}">{textContent}</pre>
        </div>
      {/if}
    </div>
  </Collapsible.Content>
</Collapsible.Root>
