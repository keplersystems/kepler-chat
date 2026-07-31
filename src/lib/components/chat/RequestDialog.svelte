<script lang="ts">
  import type {
    ElicitationSchema,
    PendingRequestDTO,
    PermissionOptionDTO,
  } from "$lib/contracts";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Checkbox } from "$lib/components/ui/checkbox";

  interface Props {
    request: PendingRequestDTO | null;
    onPermission: (requestId: string, optionId: string) => void;
    onElicitation: (
      requestId: string,
      action: "accept" | "decline" | "cancel",
      content?: Record<string, unknown>,
    ) => void;
  }

  const { request, onPermission, onElicitation }: Props = $props();

  const requestId = $derived(request?.request.requestId ?? null);

  type PropertySchema = NonNullable<ElicitationSchema["properties"]>[string];

  interface Field {
    key: string;
    kind: "text" | "number" | "boolean" | "enum";
    required: boolean;
    title: string;
    description: string | null;
    enumValues: Array<{ value: string; label: string }>;
  }

  /**
   * The schema union ends in a catch-all member with an index signature, so
   * property access has to go through an explicit narrowing read.
   */
  function readString(schema: PropertySchema, key: "title" | "description"): string | null {
    const value = (schema as Record<string, unknown>)[key];
    return typeof value === "string" ? value : null;
  }

  function enumValuesOf(schema: PropertySchema): Field["enumValues"] {
    if (schema.type !== "string") return [];
    const record = schema as Record<string, unknown>;
    const oneOf = record.oneOf;
    if (Array.isArray(oneOf)) {
      return oneOf
        .filter((option): option is { const: string; title: string } => {
          const entry = option as { const?: unknown; title?: unknown };
          return typeof entry.const === "string" && typeof entry.title === "string";
        })
        .map((option) => ({ value: option.const, label: option.title }));
    }
    const values = record.enum;
    if (!Array.isArray(values)) return [];
    return values
      .filter((value): value is string => typeof value === "string")
      .map((value) => ({ value, label: value }));
  }

  function kindOf(schema: PropertySchema, hasEnum: boolean): Field["kind"] {
    if (hasEnum) return "enum";
    if (schema.type === "boolean") return "boolean";
    if (schema.type === "number" || schema.type === "integer") return "number";
    return "text";
  }

  const fields = $derived.by((): Field[] => {
    if (request?.type !== "elicitation") return [];
    const schema = request.request.requestedSchema;
    const required = new Set(schema.required ?? []);
    return Object.entries(schema.properties ?? {}).map(([key, propertySchema]) => {
      const enumValues = enumValuesOf(propertySchema);
      return {
        key,
        kind: kindOf(propertySchema, enumValues.length > 0),
        required: required.has(key),
        title: readString(propertySchema, "title") ?? key,
        description: readString(propertySchema, "description"),
        enumValues,
      };
    });
  });

  let values = $state<Record<string, unknown>>({});

  $effect(() => {
    void requestId;
    values = {};
  });

  const canSubmit = $derived(
    fields.every((field) => {
      if (!field.required) return true;
      const value = values[field.key];
      return typeof value === "boolean" || (value !== undefined && String(value).length > 0);
    }),
  );

  function permissionVariant(option: PermissionOptionDTO) {
    if (option.kind === "reject_once" || option.kind === "reject_always") return "outline" as const;
    if (option.kind === "allow_always") return "secondary" as const;
    return "default" as const;
  }

  function submitElicitation() {
    if (!requestId || !canSubmit) return;
    const content: Record<string, unknown> = {};
    for (const field of fields) {
      const value = values[field.key];
      if (value === undefined || value === "") continue;
      if (field.kind === "number") {
        content[field.key] = Number(value);
      } else {
        content[field.key] = value;
      }
    }
    onElicitation(requestId, "accept", content);
  }
</script>

{#if request}
  <Dialog.Root open={true}>
    <Dialog.Content class="max-w-lg">
      {#if request.type === "permission"}
        {@const permission = request.request}
        <Dialog.Header>
          <Dialog.Title class="font-mono text-base">{permission.title}</Dialog.Title>
          <Dialog.Description>
            {permission.toolKind
              ? `The agent wants to run a ${permission.toolKind} action.`
              : "The agent is requesting permission."}
          </Dialog.Description>
        </Dialog.Header>

        {#if permission.locations.length > 0}
          <ul class="flex flex-wrap gap-1.5">
            {#each permission.locations as location, index (index)}
              <li class="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                {location.path}{location.line != null ? `:${location.line}` : ""}
              </li>
            {/each}
          </ul>
        {/if}

        {#if permission.rawInput !== undefined && permission.rawInput !== null}
          <pre class="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-relaxed">{JSON.stringify(
              permission.rawInput,
              null,
              2,
            )}</pre>
        {/if}

        <Dialog.Footer class="flex-wrap gap-2">
          {#each permission.options as option (option.optionId)}
            <Button
              variant={permissionVariant(option)}
              onclick={() => onPermission(permission.requestId, option.optionId)}
            >
              {option.name}
            </Button>
          {/each}
        </Dialog.Footer>
      {:else}
        {@const elicitation = request.request}
        <Dialog.Header>
          <Dialog.Title class="text-base">
            {elicitation.requestedSchema.title ?? "Input needed"}
          </Dialog.Title>
          <Dialog.Description>{elicitation.message}</Dialog.Description>
        </Dialog.Header>

        <div class="space-y-4">
          {#each fields as field (field.key)}
            <div class="space-y-1.5">
              <span class="text-sm font-medium">
                {field.title}
                {#if field.required}<span class="text-destructive">*</span>{/if}
              </span>
              {#if field.description}
                <p class="text-xs text-muted-foreground">{field.description}</p>
              {/if}

              {#if field.kind === "enum"}
                <div class="space-y-1">
                  {#each field.enumValues as option (option.value)}
                    <label
                      class="flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm hover:bg-accent/40 has-[:checked]:border-ring has-[:checked]:bg-accent/60"
                    >
                      <input
                        type="radio"
                        class="sr-only"
                        name={field.key}
                        value={option.value}
                        checked={values[field.key] === option.value}
                        onchange={() => (values = { ...values, [field.key]: option.value })}
                      />
                      {option.label}
                    </label>
                  {/each}
                </div>
              {:else if field.kind === "boolean"}
                <label class="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={values[field.key] === true}
                    aria-label={field.title}
                    onCheckedChange={(checked) =>
                      (values = { ...values, [field.key]: checked === true })}
                  />
                  Enabled
                </label>
              {:else}
                <Input
                  type={field.kind === "number" ? "number" : "text"}
                  aria-label={field.title}
                  value={(values[field.key] as string) ?? ""}
                  oninput={(event) =>
                    (values = { ...values, [field.key]: event.currentTarget.value })}
                />
              {/if}
            </div>
          {/each}
        </div>

        <Dialog.Footer class="gap-2">
          <Button
            variant="outline"
            onclick={() => onElicitation(elicitation.requestId, "decline")}
          >
            Decline
          </Button>
          <Button disabled={!canSubmit} onclick={submitElicitation}>Submit</Button>
        </Dialog.Footer>
      {/if}
    </Dialog.Content>
  </Dialog.Root>
{/if}
