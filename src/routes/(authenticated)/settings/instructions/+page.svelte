<script lang="ts">
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { api, apiErrorMessage } from "$lib/api";
  import { INSTRUCTIONS_MAX_LENGTH } from "$lib/contracts";
  import { Button } from "$lib/components/ui/button";
  import { Textarea } from "$lib/components/ui/input";
  import { ThinkingOrb } from "$lib/components/ui/orb";

  let loaded = $state<string | null>(null);
  let draft = $state("");
  let error = $state<string | null>(null);
  let saving = $state(false);
  let saved = $state(false);
  let savedTimer: ReturnType<typeof setTimeout>;

  const dirty = $derived(loaded !== null && draft !== loaded);

  onMount(async () => {
    const { data, error: err } = await api.api.instructions.get();
    if (err) {
      error = apiErrorMessage(err.value, "Failed to load instructions");
      return;
    }
    loaded = data.content;
    draft = data.content;
  });

  async function save() {
    saving = true;
    const { error: err } = await api.api.instructions.put({ content: draft });
    saving = false;
    if (err) {
      error = apiErrorMessage(err.value, "Failed to save instructions");
      return;
    }
    error = null;
    loaded = draft;
    saved = true;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (saved = false), 2000);
  }
</script>

<div class="space-y-4">
  <p class="text-sm text-muted-foreground">
    Applied to every conversation. Project instructions stack on top.</p>

  {#if error}
    <p class="text-sm text-destructive" role="alert">{error}</p>
  {/if}

  {#if loaded === null && !error}
    <div class="flex justify-center py-10">
      <ThinkingOrb size={20} state="searching" />
    </div>
  {:else}
    <Textarea
      bind:value={draft}
      class="min-h-64 font-mono text-sm"
      maxlength={INSTRUCTIONS_MAX_LENGTH}
      aria-label="Global instructions"
    />
    <div class="flex items-center gap-3">
      <Button onclick={save} disabled={!dirty || saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
      {#if saved}
        <span class="text-sm text-muted-foreground" transition:fade={{ duration: 200 }}>
          Saved
        </span>
      {/if}
    </div>
  {/if}
</div>
