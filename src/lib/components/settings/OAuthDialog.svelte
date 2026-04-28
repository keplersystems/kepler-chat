<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";

  interface Props {
    open: boolean;
    providerId: string | null;
    providerName: string | null;
    method: number | null;
    url: string;
    instructions: string;
    onClose: () => void;
  }

  let {
    open = $bindable(),
    providerId,
    providerName,
    method,
    url,
    instructions,
    onClose,
  }: Props = $props();

  let submitting = $state(false);
</script>

<Dialog.Root bind:open>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>OAuth Authorization</Dialog.Title>
      <Dialog.Description>
        Complete OAuth authorization for {providerName ?? "this provider"}.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4">
      {#if instructions}
        <p class="text-sm text-muted-foreground">{instructions}</p>
      {/if}
      <p class="text-sm">Click the link below to authorize with {providerName}:</p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        class="text-primary hover:underline break-all"
      >
        {url}
      </a>

      {#if providerId !== null && method !== null}
        <form
          method="POST"
          action="?/completeOAuth"
          use:enhance={() => {
            submitting = true;
            return async ({ result, update }) => {
              await update();
              submitting = false;
              if (result.type === "success") onClose();
            };
          }}
          class="space-y-2"
        >
          <input type="hidden" name="providerId" value={providerId} />
          <input type="hidden" name="method" value={method} />

          <label for="oauth-code" class="text-sm font-medium">
            Authorization Code (if required)
          </label>
          <input
            id="oauth-code"
            name="code"
            type="text"
            placeholder="Paste code if provider returned one"
            class="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />

          <Dialog.Footer>
            <Button type="button" variant="outline" onclick={onClose}>Close</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Completing..." : "Complete Authorization"}
            </Button>
          </Dialog.Footer>
        </form>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
