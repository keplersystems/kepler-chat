<script lang="ts">
  import { Select as SelectPrimitive } from "bits-ui";
  import type { ComponentProps, Snippet } from "svelte";
  import { cn } from "$lib/utils";

  type Props = ComponentProps<typeof SelectPrimitive.Content> & {
    header?: Snippet;
    viewportClass?: string;
  };

  let {
    class: className,
    sideOffset = 6,
    children,
    header,
    viewportClass,
    ...rest
  }: Props = $props();
</script>

<SelectPrimitive.Portal>
  <SelectPrimitive.Content
    {sideOffset}
    {...rest}
    class={cn(
      "z-50 flex max-h-[var(--bits-select-content-available-height,80vh)] min-w-[var(--bits-select-anchor-width)] flex-col overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-md outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
      className,
    )}
  >
    {@render header?.()}
    <SelectPrimitive.Viewport class={cn("flex-1 overflow-y-auto p-1", viewportClass)}>
      {@render children?.()}
    </SelectPrimitive.Viewport>
  </SelectPrimitive.Content>
</SelectPrimitive.Portal>
