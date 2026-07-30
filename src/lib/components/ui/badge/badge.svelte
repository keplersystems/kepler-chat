<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    children: Snippet;
  }

  const { children }: Props = $props();
</script>

<span
  class="inline-flex shrink-0 items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
>
  {@render children()}
</span>
