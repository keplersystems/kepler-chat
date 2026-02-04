import { OpencodeInstanceManager } from "@kepler-chat/opencode-manager";

/**
 * Singleton instance manager for all OpenCode instances.
 * Handles lifecycle, spawning, and cleanup.
 */
export const opencodeManager = new OpencodeInstanceManager();
