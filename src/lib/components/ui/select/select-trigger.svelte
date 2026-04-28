<script lang="ts">
  import { Select as SelectPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { cn } from "$lib/utils";

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
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="h-4 w-4 shrink-0 opacity-60"
    aria-hidden="true"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
</SelectPrimitive.Trigger>
