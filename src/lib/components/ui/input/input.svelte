<script lang="ts" module>
  export const inputClass =
    "t-input flex h-9 w-full rounded-lg border bg-input px-3 py-2 text-sm placeholder:text-muted-foreground hover:not-focus-visible:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";
</script>

<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import { cn } from "$lib/utils";

  type Props = HTMLInputAttributes;

  let { class: className, value = $bindable(), ...rest }: Props = $props();
</script>

<input bind:value class={cn(inputClass, className)} {...rest} />
