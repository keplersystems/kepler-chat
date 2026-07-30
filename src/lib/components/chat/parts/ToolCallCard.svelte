<script lang="ts">
  import type { PartView } from "$lib/messages";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { ThinkingOrb } from "$lib/components/ui/orb";
  import CheckIcon from "@lucide/svelte/icons/check";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import CircleDashedIcon from "@lucide/svelte/icons/circle-dashed";
  import XIcon from "@lucide/svelte/icons/x";

  interface Props {
    part: Extract<PartView, { type: "tool" }>;
  }

  const { part }: Props = $props();

  const status = $derived(part.state.status);
  const title = $derived(
    part.state.status === "running" || part.state.status === "completed"
      ? part.state.title
      : undefined,
  );
  const input = $derived(JSON.stringify(part.state.input, null, 2));
  const output = $derived(part.state.status === "completed" ? part.state.output : undefined);
  const errorText = $derived(part.state.status === "error" ? part.state.error : undefined);

  // Open while active or failed; auto-close on completion unless the user
  // has taken over the toggle.
  let open = $state(false);
  let userToggled = $state(false);
  $effect(() => {
    if (userToggled) return;
    open = status === "running" || status === "error";
  });

  const railClass: Record<typeof status, string> = {
    pending: "border-l-border",
    running: "border-l-activity",
    completed: "border-l-border",
    error: "border-l-destructive",
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
      {#if status === "running"}
        <ThinkingOrb size={20} state="working" />
      {:else if status === "completed"}
        <CheckIcon size={13} strokeWidth={2.5} class="opacity-70" />
      {:else if status === "error"}
        <XIcon size={13} strokeWidth={2.5} class="text-destructive" />
      {:else}
        <CircleDashedIcon size={13} class="opacity-60" />
      {/if}
    </span>
    <span class="shrink-0 font-mono font-medium text-foreground/90">{part.name}</span>
    {#if title}
      <span class="min-w-0 truncate text-muted-foreground">{title}</span>
    {/if}
    <span class="ml-auto shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground/70">
      {status}
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
      <div>
        <div class="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          Input
        </div>
        <pre class="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-relaxed">{input}</pre>
      </div>
      {#if output}
        <div>
          <div class="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Output
          </div>
          <pre class="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-relaxed">{output}</pre>
        </div>
      {/if}
      {#if errorText}
        <div>
          <div class="mb-1 text-[11px] font-medium uppercase tracking-wider text-destructive">
            Error
          </div>
          <pre class="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-destructive/10 p-2 font-mono text-[11px] leading-relaxed text-destructive">{errorText}</pre>
        </div>
      {/if}
    </div>
  </Collapsible.Content>
</Collapsible.Root>
