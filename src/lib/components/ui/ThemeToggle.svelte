<script lang="ts">
  import { theme } from "$lib/state/theme.svelte";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import MoonIcon from "@lucide/svelte/icons/moon";
  import SunIcon from "@lucide/svelte/icons/sun";

  function toggle() {
    theme.set(theme.isDark ? "light" : "dark");
  }
</script>

<Tooltip.Root>
  <Tooltip.Trigger
    onclick={toggle}
    class="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
    aria-label={theme.isDark ? "Switch to light theme" : "Switch to dark theme"}
  >
    <span class="t-icon-swap" data-state={theme.isDark ? "a" : "b"}>
      <span class="t-icon" data-icon="a"><SunIcon size={16} /></span>
      <span class="t-icon" data-icon="b"><MoonIcon size={16} /></span>
    </span>
  </Tooltip.Trigger>
  <Tooltip.Content>{theme.isDark ? "Light theme" : "Dark theme"}</Tooltip.Content>
</Tooltip.Root>
