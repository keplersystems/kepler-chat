<script lang="ts">
  import type { HTMLTextareaAttributes } from "svelte/elements";
  import { cn } from "$lib/utils";
  import { inputClass } from "./input.svelte";

  type Props = HTMLTextareaAttributes;

  let { class: className, value = $bindable(), ...rest }: Props = $props();
</script>

<textarea bind:value class={cn(inputClass, "h-auto min-h-20", className)} {...rest}
></textarea>
