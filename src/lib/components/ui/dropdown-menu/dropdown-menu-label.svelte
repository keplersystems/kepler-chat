<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { cn } from "$lib/utils";

  let {
    class: className,
    ...rest
  }: ComponentProps<typeof DropdownMenuPrimitive.GroupHeading> = $props();
</script>

<DropdownMenuPrimitive.GroupHeading
  {...rest}
  class={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)}
/>
