<script lang="ts">
  import type { ToolContentView } from "$lib/contracts";

  interface Props {
    diff: Extract<ToolContentView, { type: "diff" }>;
  }

  const { diff }: Props = $props();

  interface DiffLine {
    kind: "added" | "removed" | "context";
    text: string;
  }

  /**
   * Line-level LCS diff. Agents send whole-file before/after text, so the
   * common-prefix/suffix trim keeps the matrix small for typical edits.
   */
  function computeDiff(oldText: string, newText: string): DiffLine[] {
    const oldLines = oldText.length ? oldText.split("\n") : [];
    const newLines = newText.length ? newText.split("\n") : [];

    let start = 0;
    while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) {
      start++;
    }
    let endOld = oldLines.length;
    let endNew = newLines.length;
    while (endOld > start && endNew > start && oldLines[endOld - 1] === newLines[endNew - 1]) {
      endOld--;
      endNew--;
    }

    const midOld = oldLines.slice(start, endOld);
    const midNew = newLines.slice(start, endNew);
    const rows = midOld.length;
    const cols = midNew.length;
    const table: number[][] = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0));
    for (let i = rows - 1; i >= 0; i--) {
      for (let j = cols - 1; j >= 0; j--) {
        table[i][j] =
          midOld[i] === midNew[j]
            ? table[i + 1][j + 1] + 1
            : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }

    const lines: DiffLine[] = [];
    for (const text of oldLines.slice(0, start)) lines.push({ kind: "context", text });
    let i = 0;
    let j = 0;
    while (i < rows && j < cols) {
      if (midOld[i] === midNew[j]) {
        lines.push({ kind: "context", text: midOld[i] });
        i++;
        j++;
      } else if (table[i + 1][j] >= table[i][j + 1]) {
        lines.push({ kind: "removed", text: midOld[i] });
        i++;
      } else {
        lines.push({ kind: "added", text: midNew[j] });
        j++;
      }
    }
    for (; i < rows; i++) lines.push({ kind: "removed", text: midOld[i] });
    for (; j < cols; j++) lines.push({ kind: "added", text: midNew[j] });
    for (const text of oldLines.slice(endOld)) lines.push({ kind: "context", text });
    return lines;
  }

  const lines = $derived(computeDiff(diff.oldText ?? "", diff.newText));
  const stats = $derived({
    added: lines.filter((line) => line.kind === "added").length,
    removed: lines.filter((line) => line.kind === "removed").length,
  });
</script>

<div>
  <div class="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider">
    <span class="font-mono normal-case text-muted-foreground">{diff.path}</span>
    {#if stats.added}<span class="text-success">+{stats.added}</span>{/if}
    {#if stats.removed}<span class="text-destructive">-{stats.removed}</span>{/if}
  </div>
  <div class="max-h-64 overflow-auto rounded-md bg-muted/60 font-mono text-[11px] leading-relaxed">
    {#each lines as line, index (index)}
      <div
        class="whitespace-pre-wrap break-words px-2 {line.kind === 'added'
          ? 'bg-success/15 text-success'
          : line.kind === 'removed'
            ? 'bg-destructive/15 text-destructive'
            : ''}"
      >
        <span class="select-none opacity-50"
          >{line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "}</span
        >{line.text}
      </div>
    {/each}
  </div>
</div>
