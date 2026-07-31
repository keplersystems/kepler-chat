// Singleton supervised `codex app-server` subprocess: JSON-RPC 2.0 over
// newline-delimited JSON on stdio (codex omits the jsonrpc envelope field).

import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { join } from "node:path";
import { getSessionsRoot } from "$lib/server/paths";
import { loadAgentEnv } from "../../core/env-profiles";
import { wrapAgentCommand } from "../../core/sandbox";

const SPAWN_BACKOFF_MS = 3000;
const STOP_TIMEOUT_MS = 5000;
const STDERR_TAIL_LIMIT = 8192;

type NotificationHandler = (method: string, params: unknown) => void;
type ServerRequestHandler = (method: string, params: unknown) => Promise<unknown>;

interface PendingRequest {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface WireMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string };
}

let proc: ChildProcess | null = null;
let ready = false;
let starting: Promise<number> | null = null;
let stopping = false;
let lastSpawnFailure = 0;
let stderrTail = "";
let epochCounter = 0;
let nextRequestId = 1;
const pendingRequests = new Map<number, PendingRequest>();
const notificationHandlers = new Set<NotificationHandler>();
let serverRequestHandler: ServerRequestHandler | null = null;
const exitHandlers = new Set<() => void>();

export function onNotification(handler: NotificationHandler): void {
  notificationHandlers.add(handler);
}

export function onServerRequest(handler: ServerRequestHandler): void {
  serverRequestHandler = handler;
}

export function onAppServerExit(handler: () => void): void {
  exitHandlers.add(handler);
}

export function appServerRunning(): boolean {
  return ready;
}

/** Resolves the current epoch; sessions resumed under an older epoch are stale. */
export async function ensureAppServer(): Promise<number> {
  if (ready) return epochCounter;
  if (starting) return starting;
  const sinceFailure = Date.now() - lastSpawnFailure;
  if (sinceFailure < SPAWN_BACKOFF_MS) {
    throw new Error(
      `Codex app-server failed to start recently; retrying in ${Math.ceil((SPAWN_BACKOFF_MS - sinceFailure) / 1000)}s`,
    );
  }
  starting = start().finally(() => {
    starting = null;
  });
  return starting;
}

export async function request<T>(method: string, params: unknown = {}): Promise<T> {
  await ensureAppServer();
  return rawRequest<T>(method, params);
}

export function notify(method: string, params: unknown = {}): void {
  writeMessage({ method, params });
}

function rawRequest<T>(method: string, params: unknown): Promise<T> {
  if (!proc) return Promise.reject(new Error("Codex app-server is not running"));
  const id = nextRequestId++;
  writeMessage({ method, id, params });
  return new Promise<T>((resolve, reject) => {
    pendingRequests.set(id, {
      method,
      resolve: resolve as (value: unknown) => void,
      reject,
    });
  });
}

function writeMessage(message: WireMessage): void {
  proc?.stdin?.write(`${JSON.stringify(message)}\n`);
}

function route(line: string): void {
  if (!line.trim()) return;
  let msg: WireMessage;
  try {
    msg = JSON.parse(line) as WireMessage;
  } catch {
    return;
  }
  if (msg.id !== undefined && msg.method === undefined) {
    const pending = pendingRequests.get(msg.id);
    if (!pending) return;
    pendingRequests.delete(msg.id);
    if (msg.error) {
      pending.reject(new Error(`${pending.method}: ${msg.error.message ?? JSON.stringify(msg.error)}`));
    } else {
      pending.resolve(msg.result);
    }
    return;
  }
  if (msg.method !== undefined && msg.id !== undefined) {
    const { id, method } = msg;
    const handler = serverRequestHandler;
    if (!handler) {
      writeMessage({ id, error: { code: -32601, message: `No handler for ${method}` } });
      return;
    }
    void handler(method, msg.params)
      .then((result) => writeMessage({ id, result }))
      .catch((error: Error) => writeMessage({ id, error: { code: -32603, message: error.message } }));
    return;
  }
  if (msg.method !== undefined) {
    for (const handler of notificationHandlers) handler(msg.method, msg.params);
  }
}

async function start(): Promise<number> {
  const env = { ...process.env, ...(await loadAgentEnv("codex")) } as Record<string, string>;
  const command = await wrapAgentCommand(
    [process.env.KEPLER_CODEX_BIN ?? "codex", "app-server"],
    [join(homedir(), ".codex")],
  );
  const child = spawn(command, {
    shell: true,
    cwd: getSessionsRoot(),
    env,
    stdio: ["pipe", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  proc = child;
  stderrTail = "";
  child.stderr!.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-STDERR_TAIL_LIMIT);
  });
  child.on("exit", (code) => {
    if (!stopping && code !== 0 && code !== null) {
      console.error(`[codex] app-server exited with code ${code}\n${stderrTail}`);
    }
    teardown();
  });
  createInterface({ input: child.stdout! }).on("line", route);

  try {
    await rawRequest("initialize", {
      clientInfo: { name: "kepler", title: "Kepler", version: "1.0.0" },
      capabilities: null,
    });
    notify("initialized", {});
    ready = true;
    return ++epochCounter;
  } catch (error) {
    lastSpawnFailure = Date.now();
    killProcessTree(child, "SIGKILL");
    proc = null;
    const detail = stderrTail.trim();
    throw new Error(
      `Failed to start codex app-server${detail ? `: ${detail.slice(-500)}` : ""}`,
      { cause: error },
    );
  }
}

function teardown(): void {
  ready = false;
  proc = null;
  const error = new Error("Codex app-server exited");
  for (const pending of pendingRequests.values()) pending.reject(error);
  pendingRequests.clear();
  for (const handler of exitHandlers) handler();
}

function killProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  const pid = child.pid;
  if (!pid) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-pid, signal);
  } catch {
    child.kill(signal);
  }
}

/** The server exits when stdin closes; SIGKILL the tree if it lingers. */
export async function stopAppServer(): Promise<void> {
  const child = proc;
  if (!child) return;
  stopping = true;
  try {
    const exited = new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", () => resolve());
    });
    child.stdin?.end();
    const timeout = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), STOP_TIMEOUT_MS),
    );
    if ((await Promise.race([exited, timeout])) === "timeout") {
      killProcessTree(child, "SIGKILL");
      await exited;
    }
  } finally {
    stopping = false;
    teardown();
  }
}
