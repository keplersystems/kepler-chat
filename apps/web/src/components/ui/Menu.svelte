<script lang="ts">
  import { Menu } from '@ark-ui/svelte';
  import type { Snippet } from 'svelte';

  interface MenuItem {
    id: string;
    label: string;
    icon?: Snippet;
    disabled?: boolean;
    separator?: boolean;
  }

  interface Props {
    items: MenuItem[];
    trigger: Snippet<[any]>;
    onSelect?: (id: string) => void;
  }

  let { items, trigger, onSelect }: Props = $props();
</script>

<Menu.Root>
  <Menu.Trigger>
    {#snippet asChild(props)}
      {@render trigger(props)}
    {/snippet}
  </Menu.Trigger>
  <Menu.Positioner>
    <Menu.Content class="z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-2">
      {#each items as item (item.id)}
        {#if item.separator}
          <Menu.Separator class="-mx-1 my-1 h-px bg-muted" />
        {:else}
          <Menu.Item
            value={item.id}
            disabled={item.disabled}
            onSelect={() => onSelect?.(item.id)}
            class="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
          >
            {#if item.icon}
              <span class="mr-2">{@render item.icon()}</span>
            {/if}
            {item.label}
          </Menu.Item>
        {/if}
      {/each}
    </Menu.Content>
  </Menu.Positioner>
</Menu.Root>
