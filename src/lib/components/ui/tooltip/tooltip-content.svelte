<script lang="ts">
  import { Tooltip as TooltipPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { cn } from "$lib/utils";

  let {
    class: className,
    sideOffset = 6,
    ...rest
  }: ComponentProps<typeof TooltipPrimitive.Content> = $props();
</script>

<TooltipPrimitive.Portal>
  <TooltipPrimitive.Content
    {sideOffset}
    {...rest}
    class={cn(
      "t-tt z-50 overflow-hidden rounded-lg bg-(--tt-bg) px-2.5 py-1.5 text-xs font-medium text-(--tt-fg) shadow-md outline-none",
      "origin-[var(--bits-tooltip-content-transform-origin)]",
      className,
    )}
  />
</TooltipPrimitive.Portal>
