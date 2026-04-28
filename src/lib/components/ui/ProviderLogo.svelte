<script lang="ts">
  import { getProviderIconSvg } from "$lib/providerIcons";

  interface Props {
    providerId: string;
    size?: number;
    class?: string;
  }

  let { providerId, size = 14, class: className = "" }: Props = $props();

  let svg = $derived(getProviderIconSvg(providerId));
</script>

{#if svg}
  <span
    class="inline-flex shrink-0 items-center justify-center align-[-0.125em] {className}"
    style="width: {size}px; height: {size}px;"
    aria-hidden="true"
  >
    {@html svg}
  </span>
{/if}
