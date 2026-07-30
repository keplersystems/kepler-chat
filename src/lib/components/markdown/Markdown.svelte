<script lang="ts">
  import { lexMarkdown } from "$lib/markdown/lex";
  import MarkdownTokens from "./MarkdownTokens.svelte";

  let { source }: { source: string } = $props();

  const tokens = $derived(lexMarkdown(source));
</script>

<div class="kepler-prose">
  <MarkdownTokens {tokens} />
</div>
