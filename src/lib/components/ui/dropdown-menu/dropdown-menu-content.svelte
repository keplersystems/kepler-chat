<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { cn } from "$lib/utils";

  let {
    class: className,
    sideOffset = 6,
    ...rest
  }: ComponentProps<typeof DropdownMenuPrimitive.Content> = $props();
</script>

<DropdownMenuPrimitive.Portal>
  <DropdownMenuPrimitive.Content
    {sideOffset}
    {...rest}
    class={cn(
      "t-pop z-50 min-w-[10rem] overflow-hidden rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-md outline-none",
      "origin-[var(--bits-menu-content-transform-origin)]",
      className,
    )}
  />
</DropdownMenuPrimitive.Portal>
