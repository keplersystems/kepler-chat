<script lang="ts">
  import type { PendingRequestDTO } from '@kepler-chat/contracts';
  import Dialog from '../ui/Dialog.svelte';
  import Button from '../ui/Button.svelte';

  interface Props {
    request: PendingRequestDTO | null;
    onReply: (reply: { reply?: string; answers?: string[][] }) => void;
    onReject: () => void;
  }

  let { request, onReply, onReject }: Props = $props();

  let answerText = $state('');
  let selectedOption = $state<string | null>(null);

  function handleApprove() {
    if (request?.type === 'permission') {
      onReply({ reply: 'always' });
    } else if (request?.type === 'question') {
      onReply({ answers: [[answerText]] });
    }
    reset();
  }

  function handleOnce() {
    if (request?.type === 'permission') {
      onReply({ reply: 'once' });
    }
    reset();
  }

  function handleReject() {
    onReject();
    reset();
  }

  function reset() {
    answerText = '';
    selectedOption = null;
  }

  const isOpen = $derived(request !== null);
</script>

{#if request}
  <Dialog
    title={request.type === 'permission' ? 'Permission Required' : 'Question'}
    description={request.type === 'permission' 
      ? 'The assistant is requesting permission to perform an action.'
      : 'The assistant has a question for you.'}
    open={isOpen}
    onOpenChange={(open) => !open && handleReject()}
  >
    {#snippet trigger()}
      <div></div>
    {/snippet}

    <div class="space-y-4">
      <!-- Request Details -->
      <div class="rounded-md border bg-muted p-4">
        <pre class="whitespace-pre-wrap text-sm">{JSON.stringify(request.request, null, 2)}</pre>
      </div>

      <!-- Question Input (for question type) -->
      {#if request.type === 'question'}
        <div class="space-y-2">
          <label for="answer-input" class="text-sm font-medium">Your answer:</label>
          <textarea
            id="answer-input"
            bind:value={answerText}
            placeholder="Type your answer..."
            class="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            rows={3}
          ></textarea>
        </div>
      {/if}

      <!-- Action Buttons -->
      <div class="flex justify-end gap-2">
        <Button variant="outline" onclick={handleReject}>
          {request.type === 'permission' ? 'Deny' : 'Cancel'}
        </Button>
        
        {#if request.type === 'permission'}
          <Button variant="secondary" onclick={handleOnce}>
            Allow Once
          </Button>
          <Button onclick={handleApprove}>
            Always Allow
          </Button>
        {:else}
          <Button onclick={handleApprove} disabled={!answerText.trim()}>
            Submit Answer
          </Button>
        {/if}
      </div>
    </div>
  </Dialog>
{/if}
