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
    "t-overlay fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]",
    className,
  )}
/>
