<script lang="ts" module>
  /**
   * Kepler-16, the circumbinary system NASA nicknamed Tatooine. A (0.69 M☉) and
   * B (0.20 M☉) circle their shared barycentre every 41 days, 0.22 AU apart;
   * Kepler-16b circles both every 229 days at 0.70 AU. Orbit radii below are
   * those distances to scale, including the mass-split that keeps the heavier
   * star on the tighter path. Only the bodies are enlarged, to stay visible.
   */
  const R_PLANET = 21;
  const SEPARATION = R_PLANET * (0.22 / 0.7048);
  const R_A = SEPARATION * (0.2 / (0.69 + 0.2));
  const R_B = SEPARATION - R_A;
  const PERIOD_RATIO = 229 / 41;

  const BOX = R_PLANET + 3;
  const VIEW_BOX = `${-BOX} ${-BOX} ${BOX * 2} ${BOX * 2}`;
  const SPIN = [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }];
  const CENTERED = "transform-box: view-box; transform-origin: 0 0;";
</script>

<script lang="ts">
  import * as Tooltip from "$lib/components/ui/tooltip";

  interface Props {
    size?: number;
    /** One full orbit of the planet, in ms. */
    period?: number;
    class?: string;
  }

  const { size = 104, period = 32000, class: className }: Props = $props();

  const FACTS = [
    "Kepler-16b circles two stars at once, 245 light-years away in Cygnus.",
    "Its suns eclipse each other every 41 days. The planet laps them every 229.",
    "NASA nicknamed it Tatooine, and the double sunset is real.",
    "Confirmed in 2011: the first planet found orbiting a binary pair.",
    "Saturn-sized, and far too cold for water. Two suns are not much help out there.",
  ];

  let fact = $state(0);
  let planet: SVGGElement | undefined = $state();
  let binary: SVGGElement | undefined = $state();

  $effect(() => {
    if (!planet || !binary || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const running = [
      planet.animate(SPIN, { duration: period, iterations: Infinity, easing: "linear" }),
      binary.animate(SPIN, {
        duration: period / PERIOD_RATIO,
        iterations: Infinity,
        easing: "linear",
      }),
    ];
    return () => running.forEach((animation) => animation.cancel());
  });
</script>

<Tooltip.Root onOpenChange={(open) => { if (!open) fact = (fact + 1) % FACTS.length; }}>
  <Tooltip.Trigger
    aria-label="About the Kepler-16 system"
    class="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <svg
      width={size}
      height={size}
      viewBox={VIEW_BOX}
      fill="none"
      aria-hidden="true"
      class={className}
    >
      <circle r={R_PLANET} stroke="currentColor" stroke-width="0.4" opacity="0.3" />
      <circle r={R_B} stroke="var(--primary)" stroke-width="0.4" opacity="0.4" />
      <circle r={R_A} stroke="var(--primary)" stroke-width="0.4" opacity="0.4" />
      <g bind:this={binary} style={CENTERED}>
        <circle cx={R_A} r="2" fill="var(--primary)" />
        <circle cx={-R_B} r="1.3" fill="currentColor" opacity="0.85" />
      </g>
      <g bind:this={planet} style={CENTERED}>
        <circle cx={R_PLANET} r="1.5" fill="currentColor" />
      </g>
    </svg>
  </Tooltip.Trigger>
  <Tooltip.Content side="bottom" class="max-w-64 text-center leading-relaxed">
    {FACTS[fact]}
  </Tooltip.Content>
</Tooltip.Root>
