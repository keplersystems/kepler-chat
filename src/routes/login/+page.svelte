<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button } from "$lib/components/ui/button";

  let { form } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-background px-4">
  <div class="w-full max-w-sm space-y-6">
    <div class="space-y-2 text-center">
      <h1 class="text-2xl font-semibold tracking-tight">Kepler</h1>
      <p class="text-sm text-muted-foreground">Enter the passcode to continue</p>
    </div>

    <form method="POST" use:enhance class="space-y-4">
      {#if form?.error}
        <div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {form.error}
        </div>
      {/if}

      <div class="space-y-2">
        <label for="passcode" class="text-sm font-medium">Passcode</label>
        <input
          id="passcode"
          name="passcode"
          type="password"
          minlength="4"
          autocomplete="current-password"
          required
          class="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <Button type="submit" class="w-full">Sign in</Button>
    </form>
  </div>
</div>
