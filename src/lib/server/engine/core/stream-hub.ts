import type { StreamEventMap, StreamEventName } from "$lib/contracts";

interface GenerationEvent {
  event: StreamEventName;
  data: unknown;
}

interface Generation {
  log: GenerationEvent[];
  listeners: Set<(entry: GenerationEvent | null) => void>;
}

/**
 * In-flight generations by conversation id. Each pump run is detached from the
 * HTTP request that started it: in-flight delta text exists only on the update
 * stream, so the full event log is retained for clients that reattach mid-run.
 */
const generations = new Map<string, Generation>();

export function hasGeneration(conversationId: string): boolean {
  return generations.has(conversationId);
}

export function startGenerationLog(conversationId: string): void {
  generations.set(conversationId, { log: [], listeners: new Set() });
}

export function broadcast<K extends StreamEventName>(
  conversationId: string,
  event: K,
  data: StreamEventMap[K],
): void {
  const generation = generations.get(conversationId);
  if (!generation) return;
  const entry: GenerationEvent = { event, data };
  generation.log.push(entry);
  for (const listener of generation.listeners) listener(entry);
}

export function finishGeneration(conversationId: string): void {
  const generation = generations.get(conversationId);
  if (!generation) return;
  generations.delete(conversationId);
  for (const listener of generation.listeners) listener(null);
  generation.listeners.clear();
}

function formatSSE(id: string, event: string, data: string): string {
  return `id: ${id}\nevent: ${event}\ndata: ${data}\n\n`;
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

type Emit = <K extends StreamEventName>(event: K, data: StreamEventMap[K]) => void;

/**
 * SSE response scaffolding shared by send and attach. A client disconnect
 * reaches us twice — the request signal aborts AND the runtime cancels the
 * stream (closing the controller itself) — so close/enqueue are gated on
 * controller state, not just our own flag.
 */
export function sseStreamResponse(
  requestSignal: AbortSignal,
  run: (emit: Emit) => Promise<void>,
): Response {
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit: Emit = (event, data) => {
        if (closed || controller.desiredSize === null) return;
        controller.enqueue(
          encoder.encode(formatSSE(Date.now().toString(), event, JSON.stringify(data))),
        );
      };
      const closeStream = () => {
        if (closed) return;
        closed = true;
        if (controller.desiredSize !== null) controller.close();
      };
      requestSignal.addEventListener("abort", closeStream);

      try {
        await run(emit);
      } catch (error) {
        if (!requestSignal.aborted) {
          emit("error", {
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      } finally {
        requestSignal.removeEventListener("abort", closeStream);
        closeStream();
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

/** SSE response replaying a generation's log so far, then following it live. */
export function subscribeGeneration(
  conversationId: string,
  requestSignal: AbortSignal,
): Response | null {
  const generation = generations.get(conversationId);
  if (!generation) return null;
  return sseStreamResponse(requestSignal, (emit) => {
    // Replay + listener registration is synchronous, so no event can land
    // between the two.
    for (const entry of generation.log) {
      emit(entry.event as StreamEventName, entry.data as never);
    }
    return new Promise<void>((resolve) => {
      const finish = () => {
        generation.listeners.delete(listener);
        requestSignal.removeEventListener("abort", finish);
        resolve();
      };
      const listener = (entry: GenerationEvent | null) => {
        if (entry === null) {
          finish();
          return;
        }
        emit(entry.event as StreamEventName, entry.data as never);
      };
      generation.listeners.add(listener);
      requestSignal.addEventListener("abort", finish);
    });
  });
}
