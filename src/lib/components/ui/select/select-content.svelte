<script lang="ts">
  import { Select as SelectPrimitive } from "bits-ui";
  import type { ComponentProps, Snippet } from "svelte";
  import { cn } from "$lib/utils";

  type Props = ComponentProps<typeof SelectPrimitive.Content> & {
    header?: Snippet;
    footer?: Snippet;
    viewportClass?: string;
  };

  let {
    class: className,
    sideOffset = 6,
    children,
    header,
    footer,
    viewportClass,
    ...rest
  }: Props = $props();
</script>

<SelectPrimitive.Portal>
  <SelectPrimitive.Content
    {sideOffset}
    {...rest}
    class={cn(
      "t-pop z-50 flex max-h-[var(--bits-select-content-available-height,80vh)] min-w-[var(--bits-select-anchor-width)] flex-col overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-md outline-none",
      "origin-[var(--bits-select-content-transform-origin)]",
      className,
    )}
  >
    {@render header?.()}
    <SelectPrimitive.Viewport class={cn("min-h-0 flex-1 overflow-y-auto p-1", viewportClass)}>
      {@render children?.()}
    </SelectPrimitive.Viewport>
    {@render footer?.()}
  </SelectPrimitive.Content>
</SelectPrimitive.Portal>
