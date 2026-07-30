<script lang="ts">
  interface Props {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    "aria-label": string;
  }

  const { checked, onCheckedChange, "aria-label": ariaLabel }: Props = $props();

  let interacted = $state(false);
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={ariaLabel}
  data-on={checked}
  class="t-toggle {interacted ? 'is-init' : ''} relative h-[22px] w-[38px] shrink-0 rounded-full {checked
    ? 'bg-primary'
    : 'bg-foreground/20'}"
  onclick={() => {
    interacted = true;
    onCheckedChange(!checked);
  }}
>
  <span
    class="t-toggle-thumb absolute left-[3px] top-[3px] block h-4 w-4 rounded-full bg-background"
  ></span>
</button>
