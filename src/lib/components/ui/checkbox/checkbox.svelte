<script lang="ts">
  interface Props {
    checked: boolean;
    onCheckedChange?: (checked: boolean) => void;
    "aria-label": string;
  }

  const { checked, onCheckedChange, "aria-label": ariaLabel }: Props = $props();
</script>

<button
  type="button"
  role="checkbox"
  aria-checked={checked}
  aria-label={ariaLabel}
  onclick={(e) => {
    e.stopPropagation();
    onCheckedChange?.(!checked);
  }}
  class="t-check flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border {checked
    ? 'border-primary bg-primary'
    : 'border-foreground/25 bg-transparent hover:border-foreground/45'}"
>
  <svg viewBox="0 0 10.1668 10.1668" class="h-2.5 w-2.5 overflow-visible" aria-hidden="true">
    <path
      d="M1 5.52L3.92 9.17L9.17 1"
      fill="none"
      stroke="var(--primary-foreground)"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</button>
