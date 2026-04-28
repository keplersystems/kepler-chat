<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { cn } from "$lib/utils";

  let {
    class: className,
    ...rest
  }: ComponentProps<typeof DialogPrimitive.Title> = $props();
</script>

<DialogPrimitive.Title
  {...rest}
  class={cn("text-lg font-semibold leading-none tracking-tight", className)}
/>
