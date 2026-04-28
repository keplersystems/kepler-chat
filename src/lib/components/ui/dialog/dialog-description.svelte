<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { cn } from "$lib/utils";

  let {
    class: className,
    ...rest
  }: ComponentProps<typeof DialogPrimitive.Description> = $props();
</script>

<DialogPrimitive.Description
  {...rest}
  class={cn("text-sm text-muted-foreground", className)}
/>
