<script lang="ts">
  import { goto } from "$app/navigation";
  import Button from "../ui/Button.svelte";
  import { authClient } from "$lib/auth-client";

  let passcode = $state("");
  let error = $state("");
  let loading = $state(false);

  async function handleSubmit(event: Event) {
    event.preventDefault();
    error = "";
    loading = true;

    try {
      await authClient.login(passcode);
      goto("/chat");
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to sign in";
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex min-h-screen items-center justify-center bg-background px-4">
  <div class="w-full max-w-sm space-y-6">
    <div class="space-y-2 text-center">
      <h1 class="text-2xl font-semibold tracking-tight">Kepler</h1>
      <p class="text-sm text-muted-foreground">Enter the passcode to continue</p>
    </div>

    <form onsubmit={handleSubmit} class="space-y-4">
      {#if error}
        <div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      {/if}

      <div class="space-y-2">
        <label for="passcode" class="text-sm font-medium">Passcode</label>
        <input
          id="passcode"
          type="password"
          bind:value={passcode}
          minlength="4"
          autocomplete="current-password"
          required
          class="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <Button type="submit" disabled={loading || passcode.length < 4} class="w-full">
        {loading ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  </div>
</div>
