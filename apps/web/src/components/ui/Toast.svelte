<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Toast {
    id: string;
    title: string;
    description?: string;
    type?: 'success' | 'error' | 'info' | 'warning';
  }

  interface Props {
    toasts: Toast[];
    onRemove?: (id: string) => void;
  }

  let { toasts, onRemove }: Props = $props();

  const typeStyles = {
    success: 'border-green-500 bg-green-50 text-green-900',
    error: 'border-red-500 bg-red-50 text-red-900',
    info: 'border-blue-500 bg-blue-50 text-blue-900',
    warning: 'border-yellow-500 bg-yellow-50 text-yellow-900'
  };
</script>

<div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
  {#each toasts as toast (toast.id)}
    <div
      class="pointer-events-auto relative flex w-full max-w-sm items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all {typeStyles[toast.type || 'info']}"
    >
      <div class="grid gap-1">
        <div class="text-sm font-semibold">{toast.title}</div>
        {#if toast.description}
          <div class="text-sm opacity-90">{toast.description}</div>
        {/if}
      </div>
      <button
        onclick={() => onRemove?.(toast.id)}
        class="absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100"
        aria-label="Dismiss notification"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
  {/each}
</div>
