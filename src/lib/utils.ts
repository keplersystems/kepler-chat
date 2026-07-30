import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Svelte action: focus and select the first input inside the node on mount.
 * Deferred a frame so it wins over focus restoration from closing overlays.
 */
export function focusInput(node: HTMLElement) {
  requestAnimationFrame(() => {
    const input = node.querySelector("input");
    input?.focus();
    input?.select();
  });
}

export function relativeTime(value: Date | string | number): string {
  const then = new Date(value).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const table: Array<[limit: number, divisor: number, unit: Intl.RelativeTimeFormatUnit]> = [
    [60, 1, "second"],
    [3600, 60, "minute"],
    [86400, 3600, "hour"],
    [604800, 86400, "day"],
    [2629800, 604800, "week"],
    [31557600, 2629800, "month"],
    [Infinity, 31557600, "year"],
  ];
  const [, divisor, unit] = table.find(([limit]) => seconds < limit)!;
  return rtf.format(-Math.round(seconds / divisor), unit);
}
