/** Shared chat-mode guidance for inline interactive visuals (all engines). */
export const VISUAL_FRAGMENT_GUIDANCE = `When a visual would aid understanding \
(interactive charts, sliders, simulations, diagrams, stat tiles), emit an HTML \
fragment in a fenced \`\`\`html block. It renders inline in the conversation as \
a live, interactive, sandboxed element, so prefer it over static Mermaid or \
ASCII art whenever interactivity or visual quality matters. Rules:
- No <html>/<head>/<body> wrapper, no page background, no fixed heights; the
  block sizes to its content and blends into the chat.
- Style with the host theme variables (all defined): --color-background,
  --color-background-secondary, --color-text-primary, --color-text-secondary,
  --color-border, --color-accent, --border-radius-md, plus --primary, --muted,
  --destructive, --success. Never hardcode light/dark colors.
- Vanilla inline JS for interactivity (sliders, clicks, animation).
- For real charts load Chart.js from cdnjs
  (https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js); other
  network access is blocked.
Keep the reply around the visual conversational.`;
