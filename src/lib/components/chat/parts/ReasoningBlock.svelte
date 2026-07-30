<script lang="ts">
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { ThinkingOrb } from "$lib/components/ui/orb";
  import AtomIcon from "@lucide/svelte/icons/atom";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";

  interface Props {
    text: string;
    /** True while this reasoning is still being produced. */
    live?: boolean;
  }

  const { text, live = false }: Props = $props();

  // Follow the stream while live; collapse when it ends unless the user
  // has taken over the toggle.
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
      <ThinkingOrb size={20} state="solving" />
      <span class="font-medium">Reasoning…</span>
    {:else}
      <AtomIcon size={13} class="opacity-70" />
      <span class="font-medium">Reasoning</span>
    {/if}
    <ChevronRightIcon
      size={12}
      class="opacity-60 transition-transform group-data-[state=open]:rotate-90"
    />
  </Collapsible.Trigger>
  <Collapsible.Content
    class="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden"
  >
    <div
      class="mt-1.5 max-h-[40vh] overflow-y-auto whitespace-pre-wrap border-l-2 border-border/70 pl-3 text-[13px] leading-relaxed text-muted-foreground/85"
    >
      {text}
    </div>
  </Collapsible.Content>
</Collapsible.Root>
