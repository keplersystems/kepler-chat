<script lang="ts">
  import { Select as SelectPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { cn } from "$lib/utils";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";

  let {
    class: className,
    children,
    ...rest
  }: ComponentProps<typeof SelectPrimitive.Trigger> = $props();
</script>

<SelectPrimitive.Trigger
  {...rest}
  class={cn(
    "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground [&>span]:truncate",
    className,
  )}
>
  {@render children?.()}
  <ChevronDownIcon class="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
</SelectPrimitive.Trigger>
