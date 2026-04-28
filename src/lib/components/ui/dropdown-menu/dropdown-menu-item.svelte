<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { cn } from "$lib/utils";

  type Props = ComponentProps<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
    variant?: "default" | "destructive";
  };

  let {
    class: className,
    inset = false,
    variant = "default",
    ...rest
  }: Props = $props();
</script>

<DropdownMenuPrimitive.Item
  {...rest}
  class={cn(
    "relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
    inset && "pl-8",
    variant === "destructive" && "text-destructive data-[highlighted]:bg-destructive data-[highlighted]:text-destructive-foreground",
    className,
  )}
/>
