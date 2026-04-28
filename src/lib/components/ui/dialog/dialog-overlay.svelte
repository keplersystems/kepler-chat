<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { cn } from "$lib/utils";

  let {
    class: className,
    ...rest
  }: ComponentProps<typeof DialogPrimitive.Overlay> = $props();
</script>

<DialogPrimitive.Overlay
  {...rest}
  class={cn(
    "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
    className,
  )}
/>
