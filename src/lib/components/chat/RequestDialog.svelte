<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PendingRequestDTO } from "$lib/contracts";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";

  interface Props {
    request: PendingRequestDTO | null;
  }

  const { request }: Props = $props();

  const requestId = $derived(request?.request.id ?? null);
  const isOpen = $derived(request !== null);

  const questions = $derived(request?.type === "question" ? request.request.questions : []);
  const metadataEntries = $derived(
    request?.type === "permission"
      ? Object.entries(request.request.metadata).filter(
          (e): e is [string, string | number | boolean] =>
            ["string", "number", "boolean"].includes(typeof e[1]),
        )
      : [],
  );

  let selections = $state<string[][]>([]);
  let customs = $state<string[]>([]);

  $effect(() => {
    void requestId;
    selections = questions.map(() => []);
    customs = questions.map(() => "");
  });

  /** Effective answer per question: custom text wins over a radio pick, joins checkbox picks. */
  const answers = $derived(
    questions.map((q, i) => {
      const custom = (customs[i] ?? "").trim();
      const selected = selections[i] ?? [];
      if (q.multiple) return custom ? [...selected, custom] : selected;
      return custom ? [custom] : selected;
    }),
  );
  const canSubmit = $derived(answers.length > 0 && answers.every((a) => a.length > 0));

  function toggle(i: number, label: string) {
    const current = selections[i] ?? [];
    selections[i] = current.includes(label)
      ? current.filter((l) => l !== label)
      : [...current, label];
  }
</script>

{#if request && requestId}
  <Dialog.Root open={isOpen}>
    <Dialog.Content class="max-w-lg">
      {#if request.type === "permission"}
        {@const perm = request.request}
        <Dialog.Header>
          <Dialog.Title class="font-mono">{perm.permission}</Dialog.Title>
          <Dialog.Description>
            The assistant is requesting permission to perform this action.
          </Dialog.Description>
        </Dialog.Header>

        <div class="space-y-4">
          {#if perm.patterns.length > 0}
            <div class="flex flex-wrap gap-1.5">
              {#each perm.patterns as pattern (pattern)}
                <span
                  class="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs text-foreground"
                >
                  {pattern}
                </span>
              {/each}
            </div>
          {/if}

          {#if metadataEntries.length > 0}
            <div
              class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border border-border bg-muted p-3 text-xs"
            >
              {#each metadataEntries as [key, value] (key)}
                <span class="font-medium text-muted-foreground">{key}</span>
                <span class="min-w-0 break-all font-mono">{value}</span>
              {/each}
            </div>
          {/if}
        </div>

        <Dialog.Footer class="flex-col gap-2 sm:flex-col sm:items-end">
          <div class="flex gap-2">
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
          </div>
          {#if perm.always.length > 0}
            <p class="text-right text-xs text-muted-foreground">
              Always allows
              {#each perm.always as pattern, i (pattern)}{i > 0 ? "," : ""}
                <span class="font-mono">{pattern}</span>{/each}
            </p>
          {/if}
        </Dialog.Footer>
      {:else}
        <Dialog.Header>
          <Dialog.Title>Question</Dialog.Title>
          <Dialog.Description>The assistant has a question for you.</Dialog.Description>
        </Dialog.Header>

        <form method="POST" action="?/replyQuestion" use:enhance class="space-y-5">
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="questionCount" value={questions.length} />
          {#each answers as questionAnswers, i (i)}
            {#each questionAnswers as answer, j (j)}
              <input type="hidden" name={`answer-${i}`} value={answer} />
            {/each}
          {/each}

          <div class="max-h-[55vh] space-y-5 overflow-y-auto">
            {#each questions as question, i (i)}
              <fieldset class="space-y-3">
                <legend class="space-y-1.5">
                  <span
                    class="inline-block rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                  >
                    {question.header}
                  </span>
                  <span class="block text-sm">{question.question}</span>
                </legend>

                <div class="space-y-2" role={question.multiple ? "group" : "radiogroup"}>
                  {#each question.options as option (option.label)}
                    {@const selected = (selections[i] ?? []).includes(option.label)}
                    <label
                      class="flex cursor-pointer flex-col gap-0.5 rounded-md border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background {selected
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:bg-muted'}"
                    >
                      {#if question.multiple}
                        <input
                          type="checkbox"
                          class="sr-only"
                          checked={selected}
                          onchange={() => toggle(i, option.label)}
                        />
                      {:else}
                        <input
                          type="radio"
                          name={`question-${i}`}
                          class="sr-only"
                          checked={selected}
                          onchange={() => (selections[i] = [option.label])}
                        />
                      {/if}
                      <span class="text-sm font-medium">{option.label}</span>
                      {#if option.description}
                        <span class="text-xs text-muted-foreground">{option.description}</span>
                      {/if}
                    </label>
                  {/each}
                </div>

                {#if question.custom !== false}
                  <input
                    type="text"
                    bind:value={customs[i]}
                    placeholder="Other..."
                    aria-label="Custom answer"
                    class="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                {/if}
              </fieldset>
            {/each}
          </div>

          <Dialog.Footer>
            <Button type="submit" formaction="?/rejectQuestion" variant="outline">Cancel</Button>
            <Button type="submit" disabled={!canSubmit}>Submit</Button>
          </Dialog.Footer>
        </form>
      {/if}
    </Dialog.Content>
  </Dialog.Root>
{/if}
