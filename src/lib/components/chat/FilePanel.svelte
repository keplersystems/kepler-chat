<script lang="ts">
  import type { FileEntryDTO } from '$lib/contracts';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { downloadFileUrl } from '$lib/api';
  import type { Component } from 'svelte';
  import DownloadIcon from '@lucide/svelte/icons/download';
  import EyeIcon from '@lucide/svelte/icons/eye';
  import FileIcon from '@lucide/svelte/icons/file';
  import FileCodeIcon from '@lucide/svelte/icons/file-code';
  import ImageIcon from '@lucide/svelte/icons/image';
  import MoreHorizontalIcon from '@lucide/svelte/icons/more-horizontal';

  interface Props {
    conversationId: string;
    files: FileEntryDTO[];
  }

  let { conversationId, files }: Props = $props();
  let previewOpen = $state(false);
  let previewFile = $state<FileEntryDTO | null>(null);
  let previewContent = $state('');
  let previewLoading = $state(false);
  let previewError = $state<string | null>(null);
  const previewCache = new Map<string, string>();

  const previewableExtensions = new Set([
    'md', 'txt', 'json', 'yaml', 'yml', 'xml', 'js', 'ts', 'jsx', 'tsx',
    'css', 'html', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'sh',
  ]);

  function formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function getFileName(path: string): string {
    return path.split('/').pop() || path;
  }

  function getRawFileUrl(path: string): string {
    const relative = downloadFileUrl(conversationId, path, 'output');
    return new URL(relative, window.location.origin).toString();
  }

  function isPreviewable(path: string): boolean {
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    return previewableExtensions.has(ext);
  }

  async function previewFileContent(file: FileEntryDTO) {
    previewFile = file;
    previewOpen = true;
    previewError = null;
    previewContent = '';

    if (!isPreviewable(file.path)) {
      previewError = 'Preview is not available for this file type.';
      return;
    }

    if (previewCache.has(file.path)) {
      previewContent = previewCache.get(file.path) ?? '';
      return;
    }

    previewLoading = true;
    try {
      const response = await fetch(downloadFileUrl(conversationId, file.path, 'output'), {
        credentials: 'include',
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const text = await response.text();
      previewCache.set(file.path, text);
      previewContent = text;
    } catch {
      previewError = 'Failed to load preview.';
    } finally {
      previewLoading = false;
    }
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  }

  const codeExts = new Set(['js', 'ts', 'jsx', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'cpp', 'c', 'h']);
  const imageExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']);

  function getFileIcon(path: string): Component {
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    if (codeExts.has(ext)) return FileCodeIcon;
    if (imageExts.has(ext)) return ImageIcon;
    return FileIcon;
  }
</script>

{#if files.length > 0}
  <div class="h-full space-y-0.5 overflow-y-auto px-2 py-2">
    {#each files as file (file.path)}
      {@const FileIconComponent = getFileIcon(file.path)}
      <div class="group flex items-center gap-2 rounded-md px-1 py-1 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
        <button
          onclick={() => previewFileContent(file)}
          class="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left"
        >
          <FileIconComponent size={14} class="opacity-60" />
          <span class="flex-1 truncate">{getFileName(file.path)}</span>
          <span class="text-xs opacity-50">{formatSize(file.size)}</span>
        </button>

        <div class="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <button
            onclick={(event) => {
              event.stopPropagation();
              previewFileContent(file);
            }}
            class="rounded-md p-1.5 hover:bg-sidebar-accent"
            aria-label={`Preview ${getFileName(file.path)}`}
          >
            <EyeIcon size={13} />
          </button>
          <a
            href={downloadFileUrl(conversationId, file.path, 'output')}
            download={getFileName(file.path)}
            onclick={(event) => event.stopPropagation()}
            class="rounded-md p-1.5 hover:bg-sidebar-accent"
            aria-label={`Download ${getFileName(file.path)}`}
          >
            <DownloadIcon size={13} />
          </a>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              class="rounded-md p-1.5 hover:bg-sidebar-accent"
              aria-label={`More actions for ${getFileName(file.path)}`}
            >
              <MoreHorizontalIcon size={13} />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
              <DropdownMenu.Item onSelect={() => copyText(file.path)}>
                Copy path
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => copyText(getRawFileUrl(file.path))}>
                Copy link
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item
                onSelect={() => window.open(getRawFileUrl(file.path), '_blank', 'noopener,noreferrer')}
              >
                Open raw
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      </div>
    {/each}
  </div>
{/if}

<Dialog.Root bind:open={previewOpen}>
  <Dialog.Content class="max-w-3xl">
    <Dialog.Header>
      <Dialog.Title>{previewFile ? getFileName(previewFile.path) : 'File Preview'}</Dialog.Title>
      {#if previewFile}
        <Dialog.Description>
          {formatSize(previewFile.size)} • {formatDate(previewFile.mtime)}
        </Dialog.Description>
      {/if}
    </Dialog.Header>

    {#if previewLoading}
      <div class="text-sm text-muted-foreground">Loading preview…</div>
    {:else if previewError}
      <div class="text-sm text-destructive">{previewError}</div>
    {:else}
      <div class="max-h-[60vh] overflow-auto rounded-md border bg-muted/30 p-3">
        <pre class="whitespace-pre-wrap break-words text-xs leading-relaxed">{previewContent}</pre>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
