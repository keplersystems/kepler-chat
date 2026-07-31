// One supervised `opencode serve` process for the whole app. Config rides in
// OPENCODE_CONFIG_CONTENT (chat agent + global MCP servers), so no config
// files are written; per-conversation scoping happens via the `directory`
// query each API call carries.

import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2";
import type { Config as OpencodeConfig } from "@opencode-ai/sdk/v2";
import { resolveMcpServers } from "$lib/server/mcp";
import { getSessionsRoot } from "$lib/server/paths";
import { readPermissionSettings } from "$lib/server/permissions";
import { loadAgentEnv } from "../../core/env-profiles";
import { wrapAgentCommand } from "../../core/sandbox";
import { CHAT_SYSTEM_PROMPT } from "./prompts";

const PORT_START = 14100;
const PORT_END = 14200;
const START_TIMEOUT_MS = 20000;
const STOP_TIMEOUT_MS = 5000;
const RESPAWN_DELAY_MS = 3000;

const OPENCODE_BIN = process.env.KEPLER_OPENCODE_BIN ?? "opencode";

interface RunningServer {
  proc: ChildProcess;
  url: string;
  client: OpencodeClient;
}

let running: RunningServer | null = null;
let startPromise: Promise<RunningServer> | null = null;
let stopped = false;

function opencodeWritablePaths(): string[] {
  return [
    resolve(homedir(), ".local", "share", "opencode"),
    resolve(homedir(), ".local", "state", "opencode"),
    resolve(homedir(), ".config", "opencode"),
    resolve(homedir(), ".cache", "opencode"),
  ];
}

function portIsFree(port: number): Promise<boolean> {
  return new Promise((done) => {
    const probe = createServer();
    probe.once("error", () => done(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => done(true)));
  });
}

async function allocatePort(): Promise<number> {
  for (let port = PORT_START; port <= PORT_END; port++) {
    if (await portIsFree(port)) return port;
  }
  throw new Error(`No free port in ${PORT_START}-${PORT_END} for the OpenCode server`);
}

async function buildConfigContent(): Promise<string> {
  const servers = await resolveMcpServers(null);
  const mcp: NonNullable<OpencodeConfig["mcp"]> = Object.fromEntries(
    servers.map((server) => [
      server.name,
      server.transport.type === "stdio"
        ? {
            type: "local" as const,
            command: [server.transport.command, ...server.transport.args],
            environment: server.transport.env,
          }
        : {
            type: "remote" as const,
            url: server.transport.url,
            headers: server.transport.headers,
          },
    ]),
  );
  const config: OpencodeConfig = {
    agent: {
      chat: {
        mode: "primary",
        description: "Conversational assistant",
        prompt: CHAT_SYSTEM_PROMPT,
        permission: { "*": "deny", websearch: "allow", webfetch: "allow", skill: "allow" },
      },
    },
    ...(servers.length ? { mcp } : {}),
  };
  return JSON.stringify(config);
}

async function buildEnv(): Promise<NodeJS.ProcessEnv> {
  const tmpDir = resolve(getSessionsRoot(), ".tmp", "opencode");
  await mkdir(resolve(tmpDir, "npm-cache"), { recursive: true });
  return {
    ...process.env,
    ...(await loadAgentEnv("opencode")),
    OPENCODE_CONFIG_CONTENT: await buildConfigContent(),
    OPENCODE_ENABLE_EXA: "1",
    OPENCODE_PERMISSION: JSON.stringify(await readPermissionSettings()),
    // The sandbox only permits writes under the sessions root and OpenCode's
    // own credential/cache dirs; scratch space must land inside them.
    TMPDIR: tmpDir,
    npm_config_cache: resolve(tmpDir, "npm-cache"),
  };
}

function waitForListening(proc: ChildProcess): Promise<string> {
  return new Promise((done, fail) => {
    let output = "";
    const timer = setTimeout(() => {
      cleanup();
      killTree(proc);
      fail(new Error(`Timeout waiting for OpenCode server after ${START_TIMEOUT_MS}ms`));
    }, START_TIMEOUT_MS);

    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      for (const line of output.split("\n")) {
        if (!line.startsWith("opencode server listening")) continue;
        const match = line.match(/on\s+(https?:\/\/\S+)/);
        cleanup();
        if (match) done(match[1]);
        else fail(new Error(`Failed to parse OpenCode server url from: ${line}`));
        return;
      }
    };
    const onExit = (code: number | null) => {
      cleanup();
      fail(new Error(`OpenCode server exited with code ${code}\n${output.trim()}`));
    };
    const onError = (error: Error) => {
      cleanup();
      fail(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      proc.stdout?.off("data", onData);
      proc.stderr?.off("data", onData);
      proc.off("exit", onExit);
      proc.off("error", onError);
    };

    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);
    proc.on("exit", onExit);
    proc.on("error", onError);
  });
}

function killTree(proc: ChildProcess, signal: NodeJS.Signals = "SIGTERM"): void {
  if (!proc.pid) return;
  try {
    process.kill(-proc.pid, signal);
  } catch {
    proc.kill(signal);
  }
}

function waitForExit(proc: ChildProcess): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve();
  return new Promise((done) => {
    const timer = setTimeout(() => {
      killTree(proc, "SIGKILL");
      done();
    }, STOP_TIMEOUT_MS);
    proc.once("exit", () => {
      clearTimeout(timer);
      done();
    });
  });
}

async function spawnServer(): Promise<RunningServer> {
  const sessionsRoot = getSessionsRoot();
  await mkdir(sessionsRoot, { recursive: true });
  const port = await allocatePort();
  const command = await wrapAgentCommand(
    [OPENCODE_BIN, "serve", "--hostname=127.0.0.1", `--port=${port}`],
    opencodeWritablePaths(),
  );
  const proc = spawn(command, {
    shell: true,
    cwd: sessionsRoot,
    env: await buildEnv(),
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  const url = await waitForListening(proc);
  proc.on("exit", () => {
    if (running?.proc !== proc) return;
    running = null;
    if (stopped) return;
    setTimeout(() => {
      void opencodeServer().catch((error) => {
        console.error("OpenCode server respawn failed:", error);
      });
    }, RESPAWN_DELAY_MS);
  });
  return { proc, url, client: createOpencodeClient({ baseUrl: url }) };
}

/** Lazy-starts the supervised server and returns its ready SDK client. */
export function opencodeServer(): Promise<RunningServer> {
  if (running) return Promise.resolve(running);
  if (!startPromise) {
    stopped = false;
    startPromise = spawnServer()
      .then((server) => {
        running = server;
        return server;
      })
      .finally(() => {
        startPromise = null;
      });
  }
  return startPromise;
}

export function isServerRunning(): boolean {
  return running !== null;
}

export async function stopServer(): Promise<void> {
  stopped = true;
  const server = running;
  running = null;
  if (!server) return;
  killTree(server.proc);
  await waitForExit(server.proc);
}

export function opencodeVersion(): Promise<string | null> {
  return new Promise((done) => {
    execFile(OPENCODE_BIN, ["--version"], (error, stdout) => {
      done(error ? null : stdout.trim() || null);
    });
  });
}
