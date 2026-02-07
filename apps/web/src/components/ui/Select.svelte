<script lang="ts">
  import { Select, createListCollection } from '@ark-ui/svelte';

  interface SelectItem {
    value: string;
    label: string;
    disabled?: boolean;
  }

  interface Props {
    items: SelectItem[];
    value?: string;
    placeholder?: string;
    disabled?: boolean;
    class?: string;
    triggerClass?: string;
    onChange?: (value: string) => void;
  }

  let {
    items,
    value = $bindable(''),
    placeholder = 'Select...',
    disabled = false,
    class: className = '',
    triggerClass = '',
    onChange
  }: Props = $props();

  const collection = $derived(createListCollection({
    items: items.map(item => item.value),
    itemToString: (value) => items.find(i => i.value === value)?.label ?? value,
  }));

  function handleValueChange(details: { value: string[] }) {
    const newValue = details.value[0] ?? '';
    value = newValue;
    onChange?.(newValue);
  }
</script>

<Select.Root
  {collection}
  value={value ? [value] : []}
  onValueChange={handleValueChange}
  {disabled}
  class={className}
>
  <Select.Trigger
    class="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 {triggerClass}"
  >
    <Select.ValueText {placeholder} class="truncate" />
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-4 w-4 opacity-50"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  </Select.Trigger>
  <Select.Positioner>
    <Select.Content class="z-50 min-w-[8rem] max-h-72 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-2">
      {#each items as item (item.value)}
        <Select.Item
          item={item.value}
          disabled={item.disabled}
          class="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
        >
          <Select.ItemText>{item.label}</Select.ItemText>
        </Select.Item>
      {/each}
    </Select.Content>
  </Select.Positioner>
  <Select.HiddenSelect />
</Select.Root>
