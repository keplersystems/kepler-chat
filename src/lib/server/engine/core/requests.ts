import type {
  ElicitationReply,
  PendingRequestDTO,
  PermissionRequestDTO,
  ElicitationRequestDTO,
} from "$lib/contracts";
import { HttpError } from "$lib/server/http-error";
import { generateId } from "$lib/server/ids";
import { broadcast } from "./stream-hub";

export type PermissionReply = { outcome: "cancelled" } | { outcome: "selected"; optionId: string };

type Resolver =
  | { type: "permission"; resolve: (reply: PermissionReply) => void }
  | { type: "elicitation"; resolve: (reply: ElicitationReply) => void };

interface Pending {
  conversationId: string;
  dto: PendingRequestDTO;
  resolver: Resolver;
}

const pending = new Map<string, Pending>();

function settle(requestId: string, entry: Pending): void {
  pending.delete(requestId);
  broadcast(entry.conversationId, "request.settled", { requestId });
}

export function askPermission(
  conversationId: string,
  request: Omit<PermissionRequestDTO, "requestId" | "conversationId">,
): Promise<PermissionReply> {
  const requestId = generateId();
  const dto: PendingRequestDTO = {
    type: "permission",
    request: { ...request, requestId, conversationId },
  };
  return new Promise<PermissionReply>((resolve) => {
    pending.set(requestId, {
      conversationId,
      dto,
      resolver: { type: "permission", resolve },
    });
    broadcast(conversationId, "request.asked", dto);
  });
}

export function askElicitation(
  conversationId: string,
  request: Omit<ElicitationRequestDTO, "requestId" | "conversationId">,
): Promise<ElicitationReply> {
  const requestId = generateId();
  const dto: PendingRequestDTO = {
    type: "elicitation",
    request: { ...request, requestId, conversationId },
  };
  return new Promise<ElicitationReply>((resolve) => {
    pending.set(requestId, {
      conversationId,
      dto,
      resolver: { type: "elicitation", resolve },
    });
    broadcast(conversationId, "request.asked", dto);
  });
}

export function listPendingRequests(conversationId: string): PendingRequestDTO[] {
  return [...pending.values()]
    .filter((entry) => entry.conversationId === conversationId)
    .map((entry) => entry.dto);
}

function requirePending(conversationId: string, requestId: string): Pending {
  const entry = pending.get(requestId);
  if (!entry || entry.conversationId !== conversationId) {
    throw new HttpError(404, "Request not found");
  }
  return entry;
}

export function replyPermission(
  conversationId: string,
  requestId: string,
  optionId: string,
): void {
  const entry = requirePending(conversationId, requestId);
  if (entry.resolver.type !== "permission") {
    throw new HttpError(400, "Request is not a permission request");
  }
  if (
    entry.dto.type === "permission" &&
    !entry.dto.request.options.some((option) => option.optionId === optionId)
  ) {
    throw new HttpError(400, "Unknown permission option");
  }
  settle(requestId, entry);
  entry.resolver.resolve({ outcome: "selected", optionId });
}

export function replyElicitation(
  conversationId: string,
  requestId: string,
  reply: ElicitationReply,
): void {
  const entry = requirePending(conversationId, requestId);
  if (entry.resolver.type !== "elicitation") {
    throw new HttpError(400, "Request is not an elicitation");
  }
  settle(requestId, entry);
  entry.resolver.resolve(reply);
}

/** Turn ended or was cancelled: outstanding prompts must not dangle. */
export function cancelPendingRequests(conversationId: string): void {
  for (const [requestId, entry] of pending) {
    if (entry.conversationId !== conversationId) continue;
    settle(requestId, entry);
    if (entry.resolver.type === "permission") {
      entry.resolver.resolve({ outcome: "cancelled" });
    } else {
      entry.resolver.resolve({ action: "cancel" });
    }
  }
}
