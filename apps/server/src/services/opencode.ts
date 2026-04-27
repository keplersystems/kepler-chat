import { OpencodeServerManager } from "@kepler-chat/opencode-manager";
import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import { getConversationRoot } from "../lib/conversation-paths";

interface OpencodeClientContext {
  client: OpencodeClient;
  url: string;
}

const manager = new OpencodeServerManager();

export const opencodeServer: {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  client: () => Promise<OpencodeClientContext>;
  conversationClient: (conversationId: string) => Promise<OpencodeClientContext>;
} = {
  start: async () => {
    await manager.start();
  },
  stop: () => manager.stop(),
  restart: () => manager.restart(),
  client: () => manager.getServerClient(),
  conversationClient: (conversationId: string) =>
    manager.clientForDirectory(getConversationRoot(conversationId)),
};
