<script lang="ts">
  import type { Snippet } from "svelte";
  import SectionShell from "$lib/components/layout/SectionShell.svelte";

  const { children }: { children: Snippet } = $props();
</script>

<SectionShell
  title="Settings"
  sections={[
    { label: "General", href: "/settings/general" },
    { label: "Agents", href: "/settings/agents" },
    { label: "Instructions", href: "/settings/instructions" },
    { label: "Sharing", href: "/settings/sharing" },
    { label: "Usage", href: "/settings/usage" },
  ]}
>
  {@render children()}
</SectionShell>
