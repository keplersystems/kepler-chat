<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button } from "$lib/components/ui/button";
  import { theme, type Theme } from "$lib/state/theme.svelte";
  import { settings, type MotionPreference } from "$lib/state/settings.svelte";
  import { Toggle } from "$lib/components/ui/toggle";
  import MonitorIcon from "@lucide/svelte/icons/monitor";
  import MoonIcon from "@lucide/svelte/icons/moon";
  import SunIcon from "@lucide/svelte/icons/sun";

  const appearances: Array<{ value: Theme; label: string; icon: typeof SunIcon }> = [
    { value: "system", label: "System theme", icon: MonitorIcon },
    { value: "light", label: "Light theme", icon: SunIcon },
    { value: "dark", label: "Dark theme", icon: MoonIcon },
  ];

  const motions: Array<{ value: MotionPreference; label: string }> = [
    { value: "system", label: "System" },
    { value: "reduced", label: "Reduced" },
  ];
</script>

<div class="max-w-2xl">
  <h2 class="font-medium text-foreground">Preferences</h2>
  <div class="divide-y divide-border">
    <div class="flex items-center justify-between gap-4 py-4">
      <p class="text-sm text-foreground">Appearance</p>
      <div class="flex items-center gap-0.5 rounded-lg bg-secondary p-0.5">
        {#each appearances as option (option.value)}
          <button
            type="button"
            onclick={() => theme.set(option.value)}
            aria-label={option.label}
            aria-pressed={theme.theme === option.value}
            class="rounded-md p-1.5 {theme.theme === option.value
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'}"
          >
            <option.icon size={15} />
          </button>
        {/each}
      </div>
    </div>

    <div class="flex items-center justify-between gap-4 py-4">
      <div>
        <p class="text-sm text-foreground">Motion</p>
        <p class="mt-0.5 text-sm text-muted-foreground">
          Reduce animation in streaming responses and other interface elements.
        </p>
      </div>
      <div class="flex items-center gap-0.5 rounded-lg bg-secondary p-0.5">
        {#each motions as option (option.value)}
          <button
            type="button"
            onclick={() => settings.setMotion(option.value)}
            aria-pressed={settings.motion === option.value}
            class="rounded-md px-3 py-1 text-sm {settings.motion === option.value
              ? 'bg-background font-medium text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'}"
          >
            {option.label}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <h2 class="mt-8 font-medium text-foreground">Notifications</h2>
  <div class="divide-y divide-border">
    <div class="flex items-center justify-between gap-4 py-4">
      <div>
        <p class="text-sm text-foreground">Response completions</p>
        <p class="mt-0.5 text-sm text-muted-foreground">
          Get notified when a run finishes while the tab is in the background.
        </p>
      </div>
      <Toggle
        checked={settings.notifyCompletions}
        onCheckedChange={(value) => settings.setNotifyCompletions(value)}
        aria-label="Response completion notifications"
      />
    </div>
  </div>

  <h2 class="mt-8 font-medium text-foreground">Account</h2>
  <div class="flex items-center justify-between gap-4 py-4">
    <div>
      <p class="text-sm text-foreground">Sign out</p>
      <p class="mt-0.5 text-sm text-muted-foreground">End this session on this device.</p>
    </div>
    <form method="POST" action="/chat?/logout" use:enhance>
      <Button type="submit" variant="outline" size="sm">Sign out</Button>
    </form>
  </div>
</div>
