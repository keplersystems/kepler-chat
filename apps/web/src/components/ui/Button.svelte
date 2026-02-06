<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
    variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost';
    size?: 'default' | 'sm' | 'lg' | 'icon';
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    onclick?: () => void;
    class?: string;
  }

  let {
    children,
    variant = 'default',
    size = 'default',
    type = 'button',
    disabled = false,
    onclick,
    class: className = ''
  }: Props = $props();

  const baseStyles = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';

  const variants = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground'
  };

  const sizes = {
    default: 'h-10 px-4 py-2',
    sm: 'h-9 rounded-md px-3',
    lg: 'h-11 rounded-md px-8',
    icon: 'h-10 w-10'
  };
</script>

<button
  {type}
  {disabled}
  onclick={onclick}
  class="{baseStyles} {variants[variant]} {sizes[size]} {className}"
>
  {@render children()}
</button>
