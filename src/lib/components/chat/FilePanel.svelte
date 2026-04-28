<script lang="ts">
  import type { FileEntryDTO } from '$lib/contracts';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { downloadFileUrl } from '$lib/api';

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

  function getFileIcon(path: string) {
    const ext = path.split('.').pop()?.toLowerCase();
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'cpp', 'c', 'h'].includes(ext || '')) {
      return 'code';
    } else if (['md', 'txt', 'json', 'yaml', 'yml', 'xml'].includes(ext || '')) {
      return 'text';
    } else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '')) {
      return 'image';
    } else if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext || '')) {
      return 'document';
    }
    return 'file';
  }
</script>

{#if files.length > 0}
  <div class="h-full space-y-0.5 overflow-y-auto px-2 py-2">
    {#each files as file (file.path)}
      <div class="group flex items-center gap-2 rounded-md px-1 py-1 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
        <button
          onclick={() => previewFileContent(file)}
          class="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left"
        >
          {#if getFileIcon(file.path) === 'code'}
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-60">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          {:else if getFileIcon(file.path) === 'image'}
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-60">
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-60">
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
              <path d="M14 2v4a2 2 0 0 0 2 2h4" />
            </svg>
          {/if}
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
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <a
            href={downloadFileUrl(conversationId, file.path, 'output')}
            download={getFileName(file.path)}
            onclick={(event) => event.stopPropagation()}
            class="rounded-md p-1.5 hover:bg-sidebar-accent"
            aria-label={`Download ${getFileName(file.path)}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" x2="12" y1="15" y2="3" />
            </svg>
          </a>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              class="rounded-md p-1.5 hover:bg-sidebar-accent"
              aria-label={`More actions for ${getFileName(file.path)}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
              </svg>
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
