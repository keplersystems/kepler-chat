<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  onMount(() => {
    goto('/settings/providers');
  });
</script>

<div class="flex h-full items-center justify-center text-muted-foreground">
  Redirecting...
</div>
