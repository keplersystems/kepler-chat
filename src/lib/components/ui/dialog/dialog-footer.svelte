<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "$lib/utils";

  let { class: className, children, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div {...rest} class={cn("flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end", className)}>
  {@render children?.()}
</div>
