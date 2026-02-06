<script lang="ts">
  import Button from '../ui/Button.svelte';
  import Tooltip from '../ui/Tooltip.svelte';

  interface Props {
    onSubmit: (text: string, files?: File[]) => void;
    disabled?: boolean;
    placeholder?: string;
  }

  let { onSubmit, disabled = false, placeholder = 'Message...' }: Props = $props();

  let text = $state('');
  let files: File[] = $state([]);
  let textarea: HTMLTextAreaElement | null = $state(null);
  let fileInput: HTMLInputElement | null = $state(null);
  let isDragging = $state(false);

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  function submit() {
    if (!text.trim() && files.length === 0) return;
    onSubmit(text.trim(), files.length > 0 ? files : undefined);
    text = '';
    files = [];
    adjustHeight();
  }

  function adjustHeight() {
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }

  function handleFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      const newFiles = Array.from(input.files);
      files = [...files, ...newFiles];
    }
    // Reset input to allow selecting the same file again
    input.value = '';
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
    if (event.dataTransfer?.files) {
      const newFiles = Array.from(event.dataTransfer.files);
      files = [...files, ...newFiles];
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragging = true;
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
  }

  function removeFile(index: number) {
    files = files.filter((_, i) => i !== index);
  }

  function openFilePicker() {
    fileInput?.click();
  }
</script>

<div class="border-t bg-background p-4">
  <div 
    class="rounded-lg border-2 border-dashed p-4 transition-colors {isDragging ? 'border-primary bg-primary/5' : 'border-muted bg-muted/50'}"
    ondrop={handleDrop}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    role="region"
    aria-label="File upload dropzone"
  >
    <div class="flex flex-col gap-3">
      <!-- Attached Files -->
      {#if files.length > 0}
        <div class="flex flex-wrap gap-2">
          {#each files as file, index (file.name + index)}
            <div class="flex items-center gap-2 rounded-md border bg-card px-2 py-1 text-xs">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                <path d="M14 2v4a2 2 0 0 0 2 2h4" />
              </svg>
              <span class="max-w-[150px] truncate">{file.name}</span>
              <button
                onclick={() => removeFile(index)}
                class="ml-1 rounded-sm opacity-60 hover:opacity-100"
                aria-label="Remove file"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Input Area -->
      <div class="flex items-end gap-2">
        <input
          bind:this={fileInput}
          type="file"
          multiple
          accept="*/*"
          onchange={handleFilesSelected}
          class="hidden"
        />
        
        <Tooltip content="Add files">
          <button 
            onclick={openFilePicker}
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground" 
            aria-label="Add files"
            type="button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
          </button>
        </Tooltip>

        <div class="relative flex-1">
          <textarea
            bind:this={textarea}
            bind:value={text}
            onkeydown={handleKeydown}
            oninput={adjustHeight}
            {placeholder}
            {disabled}
            rows="1"
            class="flex w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            style="min-height: 40px; max-height: 200px;"
          ></textarea>
          <span class="absolute bottom-2 right-2 text-xs text-muted-foreground">
            {text.length > 0 ? `${text.length} chars` : ''}
          </span>
        </div>

        <Button
          onclick={submit}
          disabled={disabled || (!text.trim() && files.length === 0)}
          size="icon"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m22 2-7 20-4-9-9-4Z" />
            <path d="M22 2 11 13" />
          </svg>
        </Button>
      </div>
    </div>
  </div>

  <div class="mt-2 text-center text-xs text-muted-foreground">
    Shift + Enter for new line • Drag and drop files anywhere
  </div>
</div>
