<script lang="ts">
  import { getProviderIconSvg, providerIdForModelValue } from "$lib/providerIcons";

  interface Props {
    providerId?: string;
    /** Agent-reported model value ("provider/model" or a bare model id). */
    modelValue?: string;
    size?: number;
    class?: string;
  }

  let { providerId, modelValue, size = 14, class: className = "" }: Props = $props();

  const resolved = $derived(providerId ?? (modelValue ? providerIdForModelValue(modelValue) : null));
  let svg = $derived(resolved ? getProviderIconSvg(resolved) : null);
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
