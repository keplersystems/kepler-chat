<script lang="ts">
  import { enhance } from "$app/forms";
  import type { EnvSchema } from "$lib/types";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";

  interface Props {
    open: boolean;
    providerId: string | null;
    providerName: string | null;
    schema: EnvSchema | null;
    initialValues: Record<string, string>;
    onClose: () => void;
  }

  let {
    open = $bindable(),
    providerId,
    providerName,
    schema,
    initialValues,
    onClose,
  }: Props = $props();

  let submitting = $state(false);
</script>

<Dialog.Root bind:open>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{providerName ?? "Provider"} Setup</Dialog.Title>
      <Dialog.Description>Configure environment variables for this provider.</Dialog.Description>
    </Dialog.Header>

    {#if providerId && schema?.envSchema}
      <form
        method="POST"
        action="?/saveEnvProfile"
        enctype="multipart/form-data"
        use:enhance={() => {
          submitting = true;
          return async ({ result, update }) => {
            await update();
            submitting = false;
            if (result.type === "success") onClose();
          };
        }}
        class="space-y-4 max-h-[60vh] overflow-y-auto"
      >
        <input type="hidden" name="providerId" value={providerId} />

        {#each schema.envSchema as field (field.key)}
          <div>
            <label for={field.key} class="text-sm font-medium">
              {field.key}
              {#if field.inputKind === "secret"}
                <span class="text-xs text-muted-foreground ml-1">(secret)</span>
              {:else if field.inputKind === "file_path"}
                <span class="text-xs text-muted-foreground ml-1">(file)</span>
              {/if}
            </label>
            {#if field.description}
              <p class="text-xs text-muted-foreground mb-1">{field.description}</p>
            {/if}
            {#if field.inputKind === "file_path"}
              <input
                id={field.key}
                name={field.key}
                type="file"
                class="mt-1 flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            {:else}
              <input
                id={field.key}
                name={field.key}
                type={field.inputKind === "secret" ? "password" : "text"}
                value={initialValues[field.key] ?? ""}
                placeholder={field.placeholder ?? ""}
                class="mt-1 flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            {/if}
          </div>
        {/each}

        <Dialog.Footer class="border-t">
          <Button type="button" variant="outline" onclick={onClose}>Cancel</Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Save Configuration"}
          </Button>
        </Dialog.Footer>
      </form>
    {:else}
      <div class="text-muted-foreground">Loading form...</div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
