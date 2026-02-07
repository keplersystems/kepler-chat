<script lang="ts">
  import Button from '../ui/Button.svelte';
  import Tooltip from '../ui/Tooltip.svelte';
  import Select from '../ui/Select.svelte';
  import type { Provider, ModelSelection } from '$lib/api/chat';

  interface ModelOption {
    value: string;
    label: string;
    providerId: string;
    modelId: string;
  }

  type AttachmentModality = 'audio' | 'image' | 'video' | 'pdf';

  interface Props {
    onSubmit: (text: string, model: ModelSelection, files?: File[]) => void;
    disabled?: boolean;
    placeholder?: string;
    providers?: Provider[];
    connectedProviders?: string[];
    selectedModel?: ModelSelection | null;
    onModelChange?: (model: ModelSelection) => void;
  }

  let { 
    onSubmit, 
    disabled = false, 
    placeholder = 'Message...',
    providers = [],
    connectedProviders = [],
    selectedModel = null,
    onModelChange
  }: Props = $props();

  let text = $state('');
  let files: File[] = $state([]);
  let textarea: HTMLTextAreaElement | null = $state(null);
  let fileInput: HTMLInputElement | null = $state(null);
  let isDragging = $state(false);

  const modelOptions = $derived.by<ModelOption[]>(() => {
    const options: ModelOption[] = [];
    for (const provider of providers) {
      if (!connectedProviders.includes(provider.id)) continue;
      if (!provider.models) continue;
      
      for (const [modelId, model] of Object.entries(provider.models)) {
        const id = model.id || modelId;
        const name = model.name || id;
        options.push({
          value: `${provider.id}:${id}`,
          label: `${provider.name || provider.id} / ${name}`,
          providerId: provider.id,
          modelId: id
        });
      }
    }
    return options;
  });

  const selectedValue = $derived.by(() => {
    if (!selectedModel) return '';
    return `${selectedModel.providerID}:${selectedModel.modelID}`;
  });

  function handleModelChange(value: string) {
    const option = modelOptions.find(o => o.value === value);
    if (option) {
      onModelChange?.({
        providerID: option.providerId,
        modelID: option.modelId
      });
    }
  }

  function fileToModality(file: File): AttachmentModality | null {
    const mime = file.type.toLowerCase();
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime === 'application/pdf') return 'pdf';
    return null;
  }

  function getSelectedModelDefinition() {
    if (!selectedModel) return null;
    const provider = providers.find((item) => item.id === selectedModel.providerID);
    if (!provider?.models) return null;
    return (
      provider.models[selectedModel.modelID] ??
      Object.values(provider.models).find((item) => item.id === selectedModel.modelID) ??
      null
    );
  }

  const compatibilityWarning = $derived.by(() => {
    if (!selectedModel || files.length === 0) return null;

    const model = getSelectedModelDefinition();
    if (!model) return null;
    const hasAttachmentFlag = typeof model.capabilities?.attachment === 'boolean';
    const hasCapabilityInputFlags =
      typeof model.capabilities?.input?.audio === 'boolean' ||
      typeof model.capabilities?.input?.image === 'boolean' ||
      typeof model.capabilities?.input?.video === 'boolean' ||
      typeof model.capabilities?.input?.pdf === 'boolean';
    const hasModalityList =
      Array.isArray(model.modalities?.input) && model.modalities.input.length > 0;
    const hasCapabilityMetadata =
      hasAttachmentFlag || hasCapabilityInputFlags || hasModalityList;
    if (!hasCapabilityMetadata) return null;

    const supported = new Set<AttachmentModality>();
    if (model.capabilities?.input?.audio) supported.add('audio');
    if (model.capabilities?.input?.image) supported.add('image');
    if (model.capabilities?.input?.video) supported.add('video');
    if (model.capabilities?.input?.pdf) supported.add('pdf');

    for (const modality of model.modalities?.input ?? []) {
      if (modality === 'audio' || modality === 'image' || modality === 'video' || modality === 'pdf') {
        supported.add(modality);
      }
    }

    const unsupportedFiles = files
      .map((file) => ({ file, modality: fileToModality(file) }))
      .filter(
        (entry): entry is { file: File; modality: AttachmentModality } =>
          entry.modality !== null,
      )
      .filter((entry) => {
        if (model.capabilities?.attachment === false) {
          return true;
        }
        return !supported.has(entry.modality);
      });

    if (unsupportedFiles.length === 0) return null;

    const unsupportedModalities = Array.from(new Set(unsupportedFiles.map((entry) => entry.modality)));
    return {
      unsupportedModalities,
      unsupportedFiles,
    };
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  function submit() {
    if (!text.trim() && files.length === 0) return;
    if (!selectedModel) return;
    
    onSubmit(text.trim(), selectedModel, files.length > 0 ? files : undefined);
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

      <!-- Model Selector -->
      <div class="flex items-center gap-2">
        <Select
          items={modelOptions}
          value={selectedValue}
          placeholder={modelOptions.length === 0 ? "No models available" : "Select model..."}
          disabled={disabled || modelOptions.length === 0}
          onChange={handleModelChange}
          triggerClass="h-8 text-xs w-auto min-w-[180px]"
        />
        {#if !selectedModel && modelOptions.length > 0}
          <span class="text-xs text-destructive">Select a model to send messages</span>
        {/if}
      </div>

      {#if compatibilityWarning}
        <div class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          <div>
            Selected model may not natively support: {compatibilityWarning.unsupportedModalities.join(', ')}.
            Tools may still handle these files.
          </div>
          <div class="mt-1">
            Files: {compatibilityWarning.unsupportedFiles.map((entry) => entry.file.name).join(', ')}
          </div>
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
            disabled={disabled || !selectedModel}
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
          disabled={disabled || !selectedModel || (!text.trim() && files.length === 0)}
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
