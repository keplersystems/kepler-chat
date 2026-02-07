<script lang="ts">
  import { api, type NormalizedProvider, type EnvSchema, type EnvProfile } from '$lib/api/chat';
  import Button from '../../../../components/ui/Button.svelte';
  import Dialog from '../../../../components/ui/Dialog.svelte';
  import Collapsible from '../../../../components/ui/Collapsible.svelte';

  let normalizedProviders = $state<NormalizedProvider[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  // Form state
  let selectedProvider = $state<NormalizedProvider | null>(null);
  let envSchema = $state<EnvSchema | null>(null);
  let envFormValues = $state<Record<string, string>>({});
  let envFormFiles = $state<Record<string, File>>({});
  let isSubmitting = $state(false);
  let showEnvDialog = $state(false);
  let showOauthDialog = $state(false);
  let oauthUrl = $state('');
  let oauthInstructions = $state('');
  let oauthMethodIndex = $state<number | null>(null);
  let oauthCode = $state('');

  async function loadProviders() {
    isLoading = true;
    error = null;
    try {
      const response = await api.listProviders();
      normalizedProviders = response.normalizedProviders || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load providers';
    } finally {
      isLoading = false;
    }
  }

  function getProviderStatus(provider: NormalizedProvider): { label: string; color: string } {
    if (provider.connected) {
      return { label: 'Ready', color: 'text-green-600' };
    }

    const configuredCount = provider.envProfileStatus?.configuredCount ?? 0;
    const totalCount = provider.envProfileStatus?.totalCount ?? 0;
    if (configuredCount === totalCount && totalCount > 0) {
      return { label: 'Ready', color: 'text-green-600' };
    }
    if (configuredCount > 0) {
      return { label: 'Partially configured', color: 'text-amber-600' };
    }
    
    return { label: 'Not configured', color: 'text-muted-foreground' };
  }

  async function openEnvDialog(provider: NormalizedProvider) {
    selectedProvider = provider;
    isSubmitting = true;
    try {
      const [schema, profile] = await Promise.all([
        api.getProviderEnvSchema(provider.providerId),
        api.getProviderEnvProfile(provider.providerId).catch(() => null),
      ]);
      
      envSchema = schema;
      
      // Initialize form with existing values or empty
      const initialValues: Record<string, string> = {};
      const fields = schema.envSchema || [];
      for (const field of fields) {
        const existing = profile?.values?.find((v) => v.key === field.key);
        initialValues[field.key] = existing?.value ?? '';
      }
      envFormValues = initialValues;
      envFormFiles = {};
      
      showEnvDialog = true;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load env schema';
    } finally {
      isSubmitting = false;
    }
  }

  async function handleSaveEnvProfile() {
    if (!selectedProvider) return;
    
    isSubmitting = true;
    try {
      // Handle file uploads first if any
      const valuesToSave: Record<string, string> = {};
      for (const [key, value] of Object.entries(envFormValues)) {
        if (value.trim().length > 0) {
          valuesToSave[key] = value;
        }
      }
      
      for (const [fieldName, file] of Object.entries(envFormFiles)) {
        const uploaded = await api.uploadProviderEnvFile(
          selectedProvider.providerId,
          fieldName,
          file,
        );
        valuesToSave[fieldName] = uploaded.path;
      }
      
      await api.setProviderEnvProfile(selectedProvider.providerId, { values: valuesToSave });
      
      showEnvDialog = false;
      selectedProvider = null;
      envSchema = null;
      envFormValues = {};
      envFormFiles = {};
      
      await loadProviders();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save env profile';
    } finally {
      isSubmitting = false;
    }
  }

  async function handleRemoveEnvProfile(providerId: string) {
    try {
      await api.deleteProviderEnvProfile(providerId);
      await loadProviders();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to remove env profile';
    }
  }

  async function startOAuth(provider: NormalizedProvider, methodIndex: number) {
    try {
      const response = await api.authorizeProviderOAuth(provider.providerId, methodIndex);
      if (response.url) {
        oauthUrl = response.url;
        oauthInstructions = response.instructions;
        oauthMethodIndex = methodIndex;
        oauthCode = '';
        selectedProvider = provider;
        showOauthDialog = true;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to start OAuth';
    }
  }

  function handleFileChange(fieldName: string, event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      envFormFiles[fieldName] = input.files[0];
    }
  }

  async function completeOAuth() {
    if (!selectedProvider || oauthMethodIndex === null) {
      return;
    }

    isSubmitting = true;
    try {
      await api.callbackProviderOAuth(selectedProvider.providerId, {
        method: oauthMethodIndex,
        code: oauthCode.trim().length > 0 ? oauthCode.trim() : undefined,
      });
      showOauthDialog = false;
      selectedProvider = null;
      oauthUrl = '';
      oauthInstructions = '';
      oauthMethodIndex = null;
      oauthCode = '';
      await loadProviders();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to complete OAuth';
    } finally {
      isSubmitting = false;
    }
  }

  $effect(() => {
    loadProviders();
  });
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-2xl font-bold">Providers</h1>
    <p class="text-muted-foreground mt-1">
      Manage your AI provider credentials. You need to authenticate with at least one provider to send messages.
    </p>
  </div>

  {#if error}
    <div class="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
      {error}
    </div>
  {/if}

  {#if isLoading}
    <div class="text-muted-foreground">Loading providers...</div>
  {:else}
    <div class="space-y-4">
      {#each normalizedProviders as provider}
        {@const status = getProviderStatus(provider)}
        <div class="rounded-lg border bg-card">
          <Collapsible open={false}>
            {#snippet trigger(props)}
              <button
                {...props()}
                class="flex w-full items-center justify-between p-4 text-left hover:bg-accent/50"
              >
                <div class="flex items-center gap-3">
                  <div class="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary">
                      <path d="M12 2v4" />
                      <path d="m5 5 2.8 2.8" />
                      <path d="m19 5-2.8 2.8" />
                      <path d="M12 12v8" />
                      <path d="m5 19 2.8-2.8" />
                      <path d="m19 19-2.8-2.8" />
                    </svg>
                  </div>
                  <div>
                    <h3 class="font-semibold">{provider.providerName}</h3>
                    <p class="text-sm text-muted-foreground">
                      {#if provider.authMode === 'oauth'}
                        OAuth authentication
                      {:else if provider.authMode === 'api_key'}
                        API key authentication
                      {:else if provider.authMode === 'manual_env'}
                        Environment variables
                      {:else}
                        No authentication required
                      {/if}
                      <span class="ml-2 {status.color}">● {status.label}</span>
                    </p>
                  </div>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground transition-transform data-[state=open]:rotate-180">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            {/snippet}
            
            <div class="border-t px-4 pb-4">
              <!-- Auth section -->
              <div class="pt-3">
                {#if provider.authMode === 'oauth'}
                  <div class="space-y-2">
                    <p class="text-sm font-medium">OAuth Authentication</p>
                    <p class="text-xs text-muted-foreground">Choose a method to connect:</p>
                    <div class="flex flex-wrap gap-2">
                      {#each provider.oauthMethods as method}
                        <Button
                          size="sm"
                          variant="outline"
                          onclick={() => startOAuth(provider, method.index)}
                        >
                          {method.label}
                        </Button>
                      {/each}
                    </div>
                  </div>
                {:else if provider.authMode === 'api_key' || provider.authMode === 'manual_env'}
                  {@const configuredCount = provider.envProfileStatus?.configuredCount ?? 0}
                  {@const totalCount = provider.envProfileStatus?.totalCount ?? 0}
                  <div class="space-y-2">
                    {#if configuredCount > 0 && configuredCount === totalCount && totalCount > 0}
                      <div class="flex items-center justify-between">
                        <div>
                          <p class="text-sm font-medium">Configured</p>
                          <p class="text-xs text-muted-foreground">
                            {configuredCount} environment variables set
                          </p>
                        </div>
                        <div class="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onclick={() => openEnvDialog(provider)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onclick={() => handleRemoveEnvProfile(provider.providerId)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    {:else if configuredCount > 0}
                      <div class="space-y-2">
                        <p class="text-sm font-medium text-amber-600">Partially Configured</p>
                        <p class="text-xs text-muted-foreground">
                          Configured: {provider.envProfileStatus?.configuredKeys.join(', ')}
                        </p>
                        <p class="text-xs text-destructive">
                          Missing: {provider.envProfileStatus?.missingKeys.join(', ')}
                        </p>
                        <Button
                          size="sm"
                          onclick={() => openEnvDialog(provider)}
                        >
                          Complete Setup
                        </Button>
                      </div>
                    {:else}
                      <div class="space-y-2">
                        <p class="text-sm font-medium">Environment Setup Required</p>
                        <p class="text-xs text-muted-foreground">
                          This provider requires {provider.envVars.length} environment variables
                        </p>
                        <Button
                          size="sm"
                          onclick={() => openEnvDialog(provider)}
                        >
                          Guided Setup
                        </Button>
                      </div>
                    {/if}
                  </div>
                {:else}
                  <p class="text-sm text-muted-foreground">No authentication required</p>
                {/if}
              </div>
            </div>
          </Collapsible>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Environment Setup Dialog -->
<Dialog
  title="{selectedProvider?.providerName || 'Provider'} Setup"
  description="Configure environment variables for this provider."
  bind:open={showEnvDialog}
>
  {#snippet trigger()}{/snippet}
  
  <div class="space-y-4 max-h-[60vh] overflow-y-auto">
    {#if envSchema?.envSchema}
      {#each envSchema.envSchema as field}
        <div>
          <label for={field.key} class="text-sm font-medium">
            {field.key}
            {#if field.inputKind === 'secret'}
              <span class="text-xs text-muted-foreground ml-1">(secret)</span>
            {:else if field.inputKind === 'file_path'}
              <span class="text-xs text-muted-foreground ml-1">(file)</span>
            {/if}
          </label>
          {#if field.description}
            <p class="text-xs text-muted-foreground mb-1">{field.description}</p>
          {/if}
          {#if field.inputKind === 'file_path'}
            <input
              id={field.key}
              type="file"
              onchange={(e) => handleFileChange(field.key, e)}
              class="mt-1 flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          {:else}
            <input
              id={field.key}
              type={field.inputKind === 'secret' ? 'password' : 'text'}
              bind:value={envFormValues[field.key]}
              placeholder={field.placeholder || ''}
              class="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          {/if}
        </div>
      {/each}
    {:else}
      <div class="text-muted-foreground">Loading form...</div>
    {/if}
    
    <div class="flex justify-end gap-2 pt-4 border-t">
      <Button
        variant="outline"
        onclick={() => { 
          showEnvDialog = false; 
          selectedProvider = null; 
          envSchema = null;
          envFormValues = {};
          envFormFiles = {};
        }}
      >
        Cancel
      </Button>
      <Button
        disabled={isSubmitting}
        onclick={handleSaveEnvProfile}
      >
        {isSubmitting ? 'Saving...' : 'Save Configuration'}
      </Button>
    </div>
  </div>
</Dialog>

<!-- OAuth Dialog -->
<Dialog
  title="OAuth Authorization"
  description="Complete OAuth authorization for {selectedProvider?.providerName || 'this provider'}."
  bind:open={showOauthDialog}
>
  {#snippet trigger()}{/snippet}
  
  <div class="space-y-4">
    {#if oauthInstructions}
      <p class="text-sm text-muted-foreground">
        {oauthInstructions}
      </p>
    {/if}
    <p class="text-sm">
      Click the link below to authorize with {selectedProvider?.providerName}:
    </p>
    <a 
      href={oauthUrl} 
      target="_blank" 
      rel="noopener noreferrer"
      class="text-primary hover:underline break-all"
    >
      {oauthUrl}
    </a>
    <div class="space-y-2">
      <label for="oauth-code" class="text-sm font-medium">
        Authorization Code (if required)
      </label>
      <input
        id="oauth-code"
        type="text"
        bind:value={oauthCode}
        placeholder="Paste code if provider returned one"
        class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </div>
    <div class="flex justify-end">
      <Button
        onclick={completeOAuth}
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Completing...' : 'Complete Authorization'}
      </Button>
      <Button
        variant="outline"
        onclick={() => {
          showOauthDialog = false;
          selectedProvider = null;
          oauthUrl = '';
          oauthInstructions = '';
          oauthMethodIndex = null;
          oauthCode = '';
        }}
      >
        Close
      </Button>
    </div>
  </div>
</Dialog>
