<script lang="ts">
  import { goto } from '$app/navigation';
  import Button from '../ui/Button.svelte';
  import { authClient } from '$lib/auth-client';

  let name = $state('');
  let email = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleSubmit(event: Event) {
    event.preventDefault();
    error = '';

    if (password !== confirmPassword) {
      error = 'Passwords do not match';
      return;
    }

    loading = true;

    try {
      const result = await authClient.signUp.email({
        name,
        email,
        password
      });

      if (result.error) {
        error = result.error.message || 'Failed to create account';
      } else {
        goto('/chat');
      }
    } catch (err) {
      error = 'An unexpected error occurred';
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex min-h-screen items-center justify-center bg-background px-4">
  <div class="w-full max-w-sm space-y-6">
    <div class="space-y-2 text-center">
      <h1 class="text-2xl font-semibold tracking-tight">Create an account</h1>
      <p class="text-sm text-muted-foreground">Enter your details to get started</p>
    </div>

    <form onsubmit={handleSubmit} class="space-y-4">
      {#if error}
        <div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      {/if}

      <div class="space-y-2">
        <label for="name" class="text-sm font-medium">Name</label>
        <input
          id="name"
          type="text"
          bind:value={name}
          placeholder="Enter your name"
          required
          class="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div class="space-y-2">
        <label for="email" class="text-sm font-medium">Email</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          placeholder="name@example.com"
          required
          class="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div class="space-y-2">
        <label for="password" class="text-sm font-medium">Password</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          placeholder="Create a password"
          required
          minlength="8"
          class="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div class="space-y-2">
        <label for="confirmPassword" class="text-sm font-medium">Confirm Password</label>
        <input
          id="confirmPassword"
          type="password"
          bind:value={confirmPassword}
          placeholder="Confirm your password"
          required
          class="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <Button type="submit" disabled={loading} class="w-full">
        {loading ? 'Creating account...' : 'Create account'}
      </Button>
    </form>

    <div class="text-center text-sm">
      <span class="text-muted-foreground">Already have an account?</span>
      <a href="/login" class="ml-1 font-medium text-primary hover:underline">Sign in</a>
    </div>
  </div>
</div>
