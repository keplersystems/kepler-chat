<script lang="ts" module>
  export type OrbState = "working" | "searching" | "solving" | "listening" | "composing" | "shaping";
  export type OrbSize = 64 | 20;

  const LABELS: Record<OrbState, string> = {
    working: "Working…",
    searching: "Searching…",
    solving: "Solving…",
    listening: "Listening…",
    composing: "Composing…",
    shaping: "Shaping…",
  };
</script>

<script lang="ts">
  import { MODE_DRAWS } from "./engine/registry";
  import { resolvePreset } from "./presets";
  import { theme } from "$lib/state/theme.svelte";

  interface Props {
    state?: OrbState;
    size?: OrbSize;
    speed?: number;
    class?: string;
    "aria-label"?: string;
  }

  const {
    state: orbState = "working",
    size = 64,
    speed = 1,
    class: className,
    "aria-label": ariaLabel,
  }: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();

  $effect(() => {
    if (!canvas) return;
    const dark = theme.isDark;
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { mode, speed: baseSpeed, opts } = resolvePreset(orbState, size);
    const draw = MODE_DRAWS[mode];
    const effSpeed = baseSpeed * speed;

    const frame = (tSec: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      draw(ctx, size, tSec, dark, opts);
    };

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      frame(0.6);
      return;
    }

    let raf = 0;
    let running = false;
    const loop = () => {
      frame((performance.now() / 1000) * effSpeed);
      if (running) raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    frame((performance.now() / 1000) * effSpeed);

    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && document.visibilityState !== "hidden") start();
      else stop();
    });
    io.observe(canvas);
    const onVis = () => {
      if (document.visibilityState === "hidden") stop();
      else if (visible) start();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  });
</script>

<canvas
  bind:this={canvas}
  aria-label={ariaLabel ?? LABELS[orbState]}
  class={className}
  style="width: {size}px; height: {size}px; display: block;"
></canvas>
