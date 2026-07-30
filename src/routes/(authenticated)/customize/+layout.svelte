<script lang="ts">
  import type { Snippet } from "svelte";
  import SectionShell from "$lib/components/layout/SectionShell.svelte";

  const { children }: { children: Snippet } = $props();

  const sections = [
    { label: "Skills", href: "/customize/skills" },
    { label: "Connectors", href: "/customize/connectors" },
    { label: "Permissions", href: "/customize/permissions" },
  ];
</script>

<SectionShell title="Customize" {sections}>
  {@render children()}
</SectionShell>
