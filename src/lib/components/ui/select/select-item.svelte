<script lang="ts">
  import { Select as SelectPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { cn } from "$lib/utils";
  import CheckIcon from "@lucide/svelte/icons/check";

  let {
    class: className,
    children,
    label,
    value,
    ...rest
  }: ComponentProps<typeof SelectPrimitive.Item> = $props();
</script>

<SelectPrimitive.Item
  {value}
  {label}
  {...rest}
  class={cn(
    "relative flex w-full cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
    className,
  )}
>
  {#snippet children(snippetProps)}
    {#if children}
      {@render children(snippetProps)}
    {:else}
      <span class="flex-1 truncate">{label ?? value}</span>
      {#if snippetProps.selected}
        <CheckIcon size={14} strokeWidth={2.5} class="opacity-80" aria-hidden="true" />
      {/if}
    {/if}
  {/snippet}
</SelectPrimitive.Item>
