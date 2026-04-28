<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PendingRequestDTO } from "$lib/contracts";
  import { getRequestId } from "$lib/messages";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";

  interface Props {
    request: PendingRequestDTO | null;
  }

  const { request }: Props = $props();

  let answerText = $state("");

  const requestId = $derived(request ? getRequestId(request.request) : null);
  const isOpen = $derived(request !== null);

  $effect(() => {
    void request;
    answerText = "";
  });
</script>

{#if request && requestId}
  <Dialog.Root open={isOpen}>
    <Dialog.Content>
      <Dialog.Header>
        <Dialog.Title>
          {request.type === "permission" ? "Permission Required" : "Question"}
        </Dialog.Title>
        <Dialog.Description>
          {request.type === "permission"
            ? "The assistant is requesting permission to perform an action."
            : "The assistant has a question for you."}
        </Dialog.Description>
      </Dialog.Header>

      <div class="space-y-4">
        <div class="rounded-md border bg-muted p-4">
          <pre class="whitespace-pre-wrap text-sm">{JSON.stringify(request.request, null, 2)}</pre>
        </div>

        {#if request.type === "permission"}
          <Dialog.Footer>
            <form method="POST" action="?/replyPermission" use:enhance>
              <input type="hidden" name="requestId" value={requestId} />
              <input type="hidden" name="reply" value="reject" />
              <Button type="submit" variant="outline">Deny</Button>
            </form>
            <form method="POST" action="?/replyPermission" use:enhance>
              <input type="hidden" name="requestId" value={requestId} />
              <input type="hidden" name="reply" value="once" />
              <Button type="submit" variant="secondary">Allow Once</Button>
            </form>
            <form method="POST" action="?/replyPermission" use:enhance>
              <input type="hidden" name="requestId" value={requestId} />
              <input type="hidden" name="reply" value="always" />
              <Button type="submit">Always Allow</Button>
            </form>
          </Dialog.Footer>
        {:else}
          <form method="POST" action="?/replyQuestion" use:enhance class="space-y-4">
            <input type="hidden" name="requestId" value={requestId} />

            <div class="space-y-2">
              <label for="answer-input" class="text-sm font-medium">Your answer:</label>
              <textarea
                id="answer-input"
                name="answer"
                bind:value={answerText}
                placeholder="Type your answer..."
                class="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                rows={3}
                required
              ></textarea>
            </div>

            <Dialog.Footer>
              <Button type="submit" disabled={!answerText.trim()}>Submit Answer</Button>
            </Dialog.Footer>
          </form>

          <form method="POST" action="?/rejectQuestion" use:enhance class="flex justify-end">
            <input type="hidden" name="requestId" value={requestId} />
            <Button type="submit" variant="outline">Cancel</Button>
          </form>
        {/if}
      </div>
    </Dialog.Content>
  </Dialog.Root>
{/if}
