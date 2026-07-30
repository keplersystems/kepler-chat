<script lang="ts">
  import type { MarkedToken, Token, Tokens } from "$lib/markdown/lex";
  import CodeBlock from "./CodeBlock.svelte";
  import Self from "./MarkdownTokens.svelte";

  let { tokens }: { tokens: Token[] } = $props();

  const headingTag = (depth: number) => `h${Math.min(depth + 1, 6)}`;
  const isSafeHref = (href: string) => /^(https?:|mailto:)/i.test(href);
</script>

{#snippet cells(row: Tokens.TableCell[])}
  {#each row as cell}
    <svelte:element this={cell.header ? "th" : "td"} style:text-align={cell.align}>
      <Self tokens={cell.tokens} />
    </svelte:element>
  {/each}
{/snippet}

{#each tokens as token}
  {@const t = token as MarkedToken}
  {#if t.type === "paragraph"}
    <p><Self tokens={t.tokens} /></p>
  {:else if t.type === "text"}
    {#if t.tokens}<Self tokens={t.tokens} />{:else}{t.text}{/if}
  {:else if t.type === "strong"}
    <strong><Self tokens={t.tokens} /></strong>
  {:else if t.type === "em"}
    <em><Self tokens={t.tokens} /></em>
  {:else if t.type === "del"}
    <del><Self tokens={t.tokens} /></del>
  {:else if t.type === "codespan"}
    <code>{t.text}</code>
  {:else if t.type === "code"}
    <CodeBlock code={t.text} lang={t.lang ?? ""} />
  {:else if t.type === "link"}
    {#if isSafeHref(t.href)}
      <a href={t.href} target="_blank" rel="noopener noreferrer" title={t.title ?? undefined}>
        <Self tokens={t.tokens} />
      </a>
    {:else}
      <Self tokens={t.tokens} />
    {/if}
  {:else if t.type === "image"}
    {#if isSafeHref(t.href)}
      <a href={t.href} target="_blank" rel="noopener noreferrer">{t.text || t.href}</a>
    {:else}
      {t.text}
    {/if}
  {:else if t.type === "heading"}
    <svelte:element this={headingTag(t.depth)}><Self tokens={t.tokens} /></svelte:element>
  {:else if t.type === "list"}
    <svelte:element
      this={t.ordered ? "ol" : "ul"}
      start={t.ordered && t.start !== "" ? t.start : undefined}
      class:task-list={t.items.some((item) => item.task)}
    >
      {#each t.items as item}
        <li class:task={item.task}><Self tokens={item.tokens} /></li>
      {/each}
    </svelte:element>
  {:else if t.type === "checkbox"}
    <input type="checkbox" checked={t.checked} disabled />
  {:else if t.type === "blockquote"}
    <blockquote><Self tokens={t.tokens} /></blockquote>
  {:else if t.type === "table"}
    <div class="table-wrap">
      <table>
        <thead><tr>{@render cells(t.header)}</tr></thead>
        <tbody>
          {#each t.rows as row}
            <tr>{@render cells(row)}</tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if t.type === "hr"}
    <hr />
  {:else if t.type === "br"}
    <br />
  {:else if t.type === "space" || t.type === "def"}
    <!-- no output -->
  {:else if t.type === "escape"}
    {t.text}
  {:else if t.type === "html"}
    {t.raw}
  {:else}
    {t.raw}
  {/if}
{/each}

<style>
  :global(.kepler-prose) {
    font-family: var(--font-serif);
    font-size: 1rem;
    line-height: 1.75;
    letter-spacing: 0;
    overflow-wrap: break-word;
    max-width: 100%;
    min-width: 0;
  }

  :global(
    .kepler-prose
      :is(p, ul, ol, blockquote, hr, h1, h2, h3, h4, h5, h6, .table-wrap, .kepler-codeblock)
  ) {
    margin-block: 0.75em;
  }

  :global(.kepler-prose > :first-child) {
    margin-top: 0;
  }

  :global(.kepler-prose > :last-child) {
    margin-bottom: 0;
  }

  :global(.kepler-prose :is(h1, h2, h3, h4, h5, h6)) {
    font-weight: 600;
    line-height: 1.3;
    margin-top: 1.25em;
  }

  :global(.kepler-prose h2) {
    font-size: 1.3em;
  }

  :global(.kepler-prose h3) {
    font-size: 1.15em;
  }

  :global(.kepler-prose h4) {
    font-size: 1.05em;
  }

  :global(.kepler-prose a) {
    color: var(--foreground);
    text-decoration: underline;
    text-underline-offset: 2px;
    text-decoration-color: var(--muted-foreground);
  }

  :global(.kepler-prose a:hover) {
    text-decoration-color: var(--foreground);
  }

  :global(.kepler-prose code:not(pre code)) {
    background-color: var(--muted);
    font-family: var(--font-mono);
    font-size: 0.85em;
    padding: 0.15em 0.4em;
    border-radius: calc(var(--radius) - 10px);
  }

  :global(.kepler-prose :is(ul, ol)) {
    padding-inline-start: 1.5em;
  }

  :global(.kepler-prose ul) {
    list-style: disc;
  }

  :global(.kepler-prose ul ul) {
    list-style: circle;
  }

  :global(.kepler-prose ol) {
    list-style: decimal;
  }

  :global(.kepler-prose li) {
    margin-block: 0.25em;
  }

  :global(.kepler-prose li > :is(ul, ol)) {
    margin-block: 0.25em;
  }

  :global(.kepler-prose ul.task-list) {
    padding-inline-start: 0.5em;
  }

  :global(.kepler-prose li.task) {
    list-style: none;
  }

  :global(.kepler-prose input[type="checkbox"]) {
    accent-color: var(--primary);
    vertical-align: -0.1em;
    margin-right: 0.5em;
  }

  :global(.kepler-prose blockquote) {
    border-left: 3px solid var(--border);
    padding-left: 1em;
    color: var(--muted-foreground);
  }

  :global(.kepler-prose .table-wrap) {
    overflow-x: auto;
    max-width: 100%;
  }

  :global(.kepler-prose table) {
    border-collapse: collapse;
    font-size: 0.9em;
  }

  :global(.kepler-prose :is(th, td)) {
    border: 1px solid var(--border);
    padding: 0.4em 0.75em;
    text-align: left;
  }

  :global(.kepler-prose th) {
    background-color: var(--muted);
    font-weight: 600;
  }

  :global(.kepler-prose hr) {
    border: none;
    border-top: 1px solid var(--border);
    margin-block: 1.5em;
  }
</style>
