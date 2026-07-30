import { OpencodeServerManager } from "$lib/server/opencode/manager";
import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import { getConversationRoot, type ConversationLocator } from "$lib/server/paths";

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
  conversationClient: (conversation: ConversationLocator) => Promise<OpencodeClientContext>;
  directoryClient: (directory: string) => Promise<OpencodeClientContext>;
  disposeDirectory: (directory: string) => Promise<void>;
} = {
  start: async () => {
    await manager.start();
  },
  stop: () => manager.stop(),
  restart: () => manager.restart(),
  client: () => manager.getServerClient(),
  conversationClient: (conversation) =>
    manager.clientForDirectory(getConversationRoot(conversation)),
  directoryClient: (directory) => manager.clientForDirectory(directory),
  /** Drop OpenCode's per-directory instance so config/skills/instructions are re-read. */
  disposeDirectory: async (directory) => {
    const { client } = await manager.getServerClient();
    const { error } = await client.instance.dispose({ directory });
    if (error) throw new Error(`Failed to dispose OpenCode instance for ${directory}`);
  },
};
