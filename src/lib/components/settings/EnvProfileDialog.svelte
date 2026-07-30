<script lang="ts">
  import { enhance } from "$app/forms";
  import type { EnvSchema } from "$lib/types";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Dialog from "$lib/components/ui/dialog";
  import { ThinkingOrb } from "$lib/components/ui/orb";

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
        class="max-h-[60vh] space-y-4 overflow-y-auto"
      >
        <input type="hidden" name="providerId" value={providerId} />

        {#each schema.envSchema as field (field.key)}
          <div>
            <label for={field.key} class="font-mono text-sm font-medium">
              {field.key}
              {#if field.inputKind === "secret"}
                <span class="ml-1 font-sans text-xs text-muted-foreground">(secret)</span>
              {:else if field.inputKind === "file_path"}
                <span class="ml-1 font-sans text-xs text-muted-foreground">(file)</span>
              {/if}
            </label>
            <p class="mb-1 text-xs text-muted-foreground">{field.description}</p>
            {#if field.inputKind === "file_path"}
              <Input
                id={field.key}
                name={field.key}
                type="file"
                class="mt-1 file:border-0 file:bg-transparent file:text-sm file:font-medium"
              />
            {:else}
              <Input
                id={field.key}
                name={field.key}
                type={field.inputKind === "secret" ? "password" : "text"}
                value={initialValues[field.key] ?? ""}
                class="mt-1"
              />
            {/if}
          </div>
        {/each}

        <Dialog.Footer class="border-t border-border">
          <Button type="button" variant="outline" onclick={onClose}>Cancel</Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Save Configuration"}
          </Button>
        </Dialog.Footer>
      </form>
    {:else}
      <div class="flex justify-center py-8 text-muted-foreground">
        <ThinkingOrb size={20} state="searching" />
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
