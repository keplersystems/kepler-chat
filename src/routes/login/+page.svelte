<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { ThinkingOrb } from "$lib/components/ui/orb";

  let { form } = $props();

  let inputEl: HTMLElement | null = $state(null);
  let shaking = $state(false);

  $effect(() => {
    if (!form?.error || !inputEl) return;
    shaking = false;
    void inputEl.offsetWidth;
    shaking = true;
  });
</script>

<div class="flex min-h-screen items-center justify-center bg-background px-4">
  <div class="w-full max-w-sm space-y-8">
    <div class="flex flex-col items-center gap-4 text-center">
      <ThinkingOrb size={64} state="searching" speed={0.7} />
      <div class="space-y-1.5">
        <h1 class="font-mono text-sm font-semibold uppercase tracking-[0.3em] text-foreground">Kepler</h1>
        <p class="text-sm text-muted-foreground">Enter your passcode to continue.</p>
      </div>
    </div>

    <form method="POST" use:enhance class="space-y-4">
      <div class="space-y-2" bind:this={inputEl}>
        <label for="passcode" class="text-sm font-medium">Passcode</label>
        <Input
          id="passcode"
          name="passcode"
          type="password"
          minlength={4}
          autocomplete="current-password"
          required
          aria-invalid={form?.error ? true : undefined}
          class={shaking ? "is-shaking border-destructive/60" : ""}
        />
        {#if form?.error}
          <p class="text-sm text-destructive" role="alert">{form.error}</p>
        {/if}
      </div>

      <Button type="submit" class="w-full">Sign in</Button>
    </form>
  </div>
</div>
