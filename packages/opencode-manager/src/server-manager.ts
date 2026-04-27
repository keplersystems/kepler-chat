import {
  createOpencodeClient,
  type OpencodeClient,
} from "@opencode-ai/sdk/v2";
import { env } from "@kepler-chat/env/server";
import { wrapCommandForSessionsRoot } from "@kepler-chat/sandbox";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { allocatePort, releasePort } from "./port-allocator";
import { loadProviderEnv } from "./provider-env";

interface ServerData {
  client: OpencodeClient;
  url: string;
  port: number;
  pid: number;
  close: () => Promise<void>;
}

const OPENCODE_START_TIMEOUT_MS = 5000;

function getSessionsRoot(): string {
  return resolve(env.KEPLER_SESSIONS_PATH);
}

function getOpencodeRoot(): string {
  return resolve(getSessionsRoot(), ".opencode");
}

async function prepareServerDirectories(): Promise<{
  xdgData: string;
  xdgCache: string;
  xdgConfig: string;
  xdgState: string;
}> {
  const sessionsRoot = getSessionsRoot();
  const opencodeRoot = getOpencodeRoot();
  const xdgData = resolve(opencodeRoot, "data");
  const xdgCache = resolve(opencodeRoot, "cache");
  const xdgConfig = resolve(opencodeRoot, "config");
  const xdgState = resolve(opencodeRoot, "state");

  await Promise.all([
    mkdir(sessionsRoot, { recursive: true }),
    mkdir(xdgData, { recursive: true }),
    mkdir(xdgCache, { recursive: true }),
    mkdir(xdgConfig, { recursive: true }),
    mkdir(xdgState, { recursive: true }),
  ]);

  return { xdgData, xdgCache, xdgConfig, xdgState };
}

async function createOpencodeEnv(xdgPaths: {
  xdgData: string;
  xdgCache: string;
  xdgConfig: string;
  xdgState: string;
}): Promise<NodeJS.ProcessEnv> {
  const existingPermissionRaw = process.env.OPENCODE_PERMISSION;
  const permissionConfig = existingPermissionRaw
    ? (JSON.parse(existingPermissionRaw) as Record<string, unknown>)
    : {};
  const providerEnv = await loadProviderEnv();

  permissionConfig.external_directory = "deny";
  for (const tool of ["webfetch", "websearch", "codesearch"] as const) {
    if (permissionConfig[tool] === undefined) {
      permissionConfig[tool] = "ask";
    }
  }

  return {
    ...process.env,
    ...providerEnv,
    XDG_DATA_HOME: xdgPaths.xdgData,
    XDG_CACHE_HOME: xdgPaths.xdgCache,
    XDG_CONFIG_HOME: xdgPaths.xdgConfig,
    XDG_STATE_HOME: xdgPaths.xdgState,
    OPENCODE_PERMISSION: JSON.stringify(permissionConfig),
  };
}

function waitForServerUrl(
  proc: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      proc.kill();
      reject(
        new Error(`Timeout waiting for server to start after ${timeoutMs}ms`),
      );
    }, timeoutMs);

    let output = "";

    const cleanup = () => {
      clearTimeout(timeoutId);
      proc.stdout.off("data", handleOutput);
      proc.stderr.off("data", handleOutput);
      proc.off("exit", handleExit);
      proc.off("error", handleError);
    };

    const handleOutput = (chunk: Buffer) => {
      output += chunk.toString();
      for (const line of output.split("\n")) {
        if (!line.startsWith("opencode server listening")) continue;
        const match = line.match(/on\s+(https?:\/\/[^\s]+)/);
        if (!match) {
          proc.kill();
          cleanup();
          reject(new Error(`Failed to parse server url from output: ${line}`));
          return;
        }
        cleanup();
        resolve(match[1]!);
        return;
      }
    };

    const handleExit = (code: number | null) => {
      cleanup();
      let message = `Server exited with code ${code}`;
      if (output.trim()) {
        message += `\nServer output: ${output}`;
      }
      reject(new Error(message));
    };

    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };

    proc.stdout.on("data", handleOutput);
    proc.stderr.on("data", handleOutput);
    proc.on("exit", handleExit);
    proc.on("error", handleError);
  });
}

async function spawnServer(options: {
  port: number;
  hostname: string;
  xdgPaths: {
    xdgData: string;
    xdgCache: string;
    xdgConfig: string;
    xdgState: string;
  };
}): Promise<ServerData> {
  const sessionsRoot = getSessionsRoot();
  const command = `opencode serve --hostname=${options.hostname} --port=${options.port}`;
  const sandboxedCommand = await wrapCommandForSessionsRoot(command, sessionsRoot);

  const proc = spawn(sandboxedCommand, {
    shell: true,
    cwd: sessionsRoot,
    env: await createOpencodeEnv(options.xdgPaths),
    stdio: ["pipe", "pipe", "pipe"],
  });
  proc.stdin.end();

  const url = await waitForServerUrl(proc, OPENCODE_START_TIMEOUT_MS);

  return {
    client: createOpencodeClient({ baseUrl: url, directory: sessionsRoot }),
    url,
    port: options.port,
    pid: proc.pid ?? 0,
    close: async () => {
      proc.kill();
      releasePort(options.port);
    },
  };
}

export class OpencodeServerManager {
  private server: ServerData | null = null;
  private startPromise: Promise<ServerData> | null = null;

  async start(): Promise<ServerData> {
    if (this.server) return this.server;
    if (this.startPromise) return this.startPromise;

    this.startPromise = (async () => {
      const port = await allocatePort();
      const xdgPaths = await prepareServerDirectories();
      try {
        this.server = await spawnServer({
          hostname: "127.0.0.1",
          port,
          xdgPaths,
        });
        return this.server;
      } catch (error) {
        releasePort(port);
        throw error;
      } finally {
        this.startPromise = null;
      }
    })();

    return this.startPromise;
  }

  async clientForDirectory(directory: string): Promise<{
    client: OpencodeClient;
    url: string;
  }> {
    const server = await this.start();
    return {
      client: createOpencodeClient({
        baseUrl: server.url,
        directory,
      }),
      url: server.url,
    };
  }

  async getServerClient(): Promise<{ client: OpencodeClient; url: string }> {
    const server = await this.start();
    return { client: server.client, url: server.url };
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    await server.close();
  }
}
