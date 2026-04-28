<script lang="ts">
  import { Select as SelectPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { cn } from "$lib/utils";

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
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="opacity-80"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      {/if}
    {/if}
  {/snippet}
</SelectPrimitive.Item>
