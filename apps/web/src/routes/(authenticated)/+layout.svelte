<script lang="ts">
  import { goto } from "$app/navigation";
  import { authClient } from "$lib/auth-client";

  const sessionQuery = authClient.useSession();
  const { children } = $props();

  $effect(() => {
    if (!$sessionQuery.isPending && !$sessionQuery.data) {
      goto("/login");
    }
  });
</script>

{#if $sessionQuery.isPending}
  <div>Loading...</div>
{:else if !$sessionQuery.data}
  <div>Redirecting...</div>
{:else}
  {@render children()}
{/if}
