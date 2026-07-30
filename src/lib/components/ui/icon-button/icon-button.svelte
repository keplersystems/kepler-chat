<script lang="ts" module>
  import { type VariantProps, tv } from "tailwind-variants";

  export const iconButtonVariants = tv({
    base: "inline-flex shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
    variants: {
      size: {
        default: "h-8 w-8",
        sm: "h-6 w-6",
        lg: "h-10 w-10",
      },
    },
    defaultVariants: { size: "default" },
  });

  export type IconButtonSize = VariantProps<typeof iconButtonVariants>["size"];
</script>

<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { cn } from "$lib/utils";

  type Props = HTMLButtonAttributes & { size?: IconButtonSize };

  let { class: className, size = "default", type = "button", children, ...rest }: Props = $props();
</script>

<button {type} class={cn(iconButtonVariants({ size }), className)} {...rest}>
  {@render children?.()}
</button>
