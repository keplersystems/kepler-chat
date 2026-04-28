<script lang="ts">
  import { ScrollArea as ScrollAreaPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { cn } from "$lib/utils";

  type Props = ComponentProps<typeof ScrollAreaPrimitive.Root> & {
    orientation?: "vertical" | "horizontal" | "both";
    viewportClass?: string;
    viewportRef?: HTMLElement | null;
  };

  let {
    class: className,
    orientation = "vertical",
    viewportClass,
    viewportRef = $bindable(null),
    type = "hover",
    children,
    ...rest
  }: Props = $props();
</script>

<ScrollAreaPrimitive.Root
  {type}
  {...rest}
  class={cn("relative overflow-hidden", className)}
>
  <ScrollAreaPrimitive.Viewport bind:ref={viewportRef} class={cn("h-full w-full rounded-[inherit]", viewportClass)}>
    {@render children?.()}
  </ScrollAreaPrimitive.Viewport>
  {#if orientation === "vertical" || orientation === "both"}
    <ScrollAreaPrimitive.Scrollbar
      orientation="vertical"
      class="flex h-full w-2 touch-none select-none border-l border-l-transparent p-px transition-opacity duration-150 ease-out data-[state=hidden]:opacity-0"
    >
      <ScrollAreaPrimitive.Thumb class="relative flex-1 rounded-full bg-border transition-colors hover:bg-muted-foreground/60" />
    </ScrollAreaPrimitive.Scrollbar>
  {/if}
  {#if orientation === "horizontal" || orientation === "both"}
    <ScrollAreaPrimitive.Scrollbar
      orientation="horizontal"
      class="flex h-2 touch-none select-none flex-col border-t border-t-transparent p-px transition-opacity duration-150 ease-out data-[state=hidden]:opacity-0"
    >
      <ScrollAreaPrimitive.Thumb class="relative flex-1 rounded-full bg-border transition-colors hover:bg-muted-foreground/60" />
    </ScrollAreaPrimitive.Scrollbar>
  {/if}
  {#if orientation === "both"}
    <ScrollAreaPrimitive.Corner />
  {/if}
</ScrollAreaPrimitive.Root>
