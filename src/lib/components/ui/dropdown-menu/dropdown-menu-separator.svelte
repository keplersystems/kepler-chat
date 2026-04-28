<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { cn } from "$lib/utils";

  let {
    class: className,
    ...rest
  }: ComponentProps<typeof DropdownMenuPrimitive.Separator> = $props();
</script>

<DropdownMenuPrimitive.Separator
  {...rest}
  class={cn("-mx-1 my-1 h-px bg-border", className)}
/>
