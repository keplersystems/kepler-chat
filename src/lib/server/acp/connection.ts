import { spawn, type ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";
import {
  client,
  methods,
  ndJsonStream,
  PROTOCOL_VERSION,
  type ClientConnection,
  type CreateElicitationRequest,
  type CreateElicitationResponse,
  type InitializeResponse,
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type WriteTextFileRequest,
  type WriteTextFileResponse,
} from "@agentclientprotocol/sdk";
import type { AgentId } from "$lib/contracts";
import { getSessionsRoot } from "$lib/server/paths";
import { requireAgent, type AgentDefinition } from "./registry";
import { wrapAgentCommand } from "./sandbox";

export interface AgentHostDelegate {
  onSessionUpdate(agentId: AgentId, notification: SessionNotification): void;
  requestPermission(
    agentId: AgentId,
    params: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse>;
  createElicitation(
    agentId: AgentId,
    params: CreateElicitationRequest,
  ): Promise<CreateElicitationResponse>;
  readTextFile(agentId: AgentId, params: ReadTextFileRequest): Promise<ReadTextFileResponse>;
  writeTextFile(
    agentId: AgentId,
    params: WriteTextFileRequest,
  ): Promise<WriteTextFileResponse>;
}

const SPAWN_BACKOFF_MS = 3000;
const STOP_TIMEOUT_MS = 5000;
const STDERR_TAIL_LIMIT = 8192;

export interface AgentHandle {
  connection: ClientConnection;
  init: InitializeResponse;
  /** Increments on every respawn; sessions bound to an older epoch must be re-established. */
  epoch: number;
}

export class AgentHost {
  private readonly def: AgentDefinition;
  private proc: ChildProcess | null = null;
  private handle: AgentHandle | null = null;
  private starting: Promise<AgentHandle> | null = null;
  private stopping = false;
  private lastSpawnFailure = 0;
  private stderrTail = "";
  private epochCounter = 0;

  constructor(
    agentId: AgentId,
    private readonly delegate: AgentHostDelegate,
  ) {
    this.def = requireAgent(agentId);
  }

  get agentId(): AgentId {
    return this.def.id;
  }

  get running(): boolean {
    return this.handle !== null;
  }

  get initInfo(): InitializeResponse | null {
    return this.handle?.init ?? null;
  }

  async ensureRunning(): Promise<AgentHandle> {
    if (this.handle) return this.handle;
    if (this.starting) return this.starting;
    const sinceFailure = Date.now() - this.lastSpawnFailure;
    if (sinceFailure < SPAWN_BACKOFF_MS) {
      throw new Error(
        `${this.def.name} failed to start recently; retrying in ${Math.ceil((SPAWN_BACKOFF_MS - sinceFailure) / 1000)}s`,
      );
    }
    this.starting = this.start().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async start(): Promise<AgentHandle> {
    const env = {
      ...process.env,
      ...(await this.def.env()),
    };
    const command = await wrapAgentCommand(this.def.command(), this.def.writablePaths());
    const proc = spawn(command, {
      shell: true,
      cwd: getSessionsRoot(),
      env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    this.proc = proc;
    this.stderrTail = "";
    proc.stderr!.on("data", (chunk: Buffer) => {
      this.stderrTail = (this.stderrTail + chunk.toString()).slice(-STDERR_TAIL_LIMIT);
    });
    proc.on("exit", (code) => {
      if (!this.stopping && code !== 0 && code !== null) {
        console.error(`[acp:${this.def.id}] exited with code ${code}\n${this.stderrTail}`);
      }
      this.teardown();
    });

    const stream = ndJsonStream(
      Writable.toWeb(proc.stdin!),
      Readable.toWeb(proc.stdout!) as unknown as ReadableStream<Uint8Array>,
    );

    const agentId = this.def.id;
    const connection = client({ name: "kepler" })
      .onNotification(methods.client.session.update, (ctx) =>
        this.delegate.onSessionUpdate(agentId, ctx.params),
      )
      .onRequest(methods.client.session.requestPermission, (ctx) =>
        this.delegate.requestPermission(agentId, ctx.params),
      )
      .onRequest(methods.client.elicitation.create, (ctx) =>
        this.delegate.createElicitation(agentId, ctx.params),
      )
      .onRequest(methods.client.fs.readTextFile, (ctx) =>
        this.delegate.readTextFile(agentId, ctx.params),
      )
      .onRequest(methods.client.fs.writeTextFile, (ctx) =>
        this.delegate.writeTextFile(agentId, ctx.params),
      )
      .connect(stream);

    void connection.closed.then(() => this.teardown());

    try {
      const init = await connection.agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          elicitation: { form: {} },
        },
        clientInfo: { name: "kepler", version: "1.0.0" },
      });
      this.handle = { connection, init, epoch: ++this.epochCounter };
      return this.handle;
    } catch (error) {
      this.lastSpawnFailure = Date.now();
      connection.close(error);
      this.killProcessTree("SIGKILL");
      this.proc = null;
      const detail = this.stderrTail.trim();
      throw new Error(
        `Failed to start ${this.def.name}${detail ? `: ${detail.slice(-500)}` : ""}`,
        { cause: error },
      );
    }
  }

  private teardown(): void {
    this.handle?.connection.close();
    this.handle = null;
    this.proc = null;
  }

  private killProcessTree(signal: NodeJS.Signals): void {
    const pid = this.proc?.pid;
    if (!pid) return;
    try {
      if (process.platform === "win32") this.proc!.kill(signal);
      else process.kill(-pid, signal);
    } catch {
      this.proc?.kill(signal);
    }
  }

  /** Agents exit when stdin closes; SIGKILL the tree if they linger. */
  async stop(): Promise<void> {
    const proc = this.proc;
    if (!proc) return;
    this.stopping = true;
    try {
      const exited = new Promise<void>((resolve) => {
        if (proc.exitCode !== null) return resolve();
        proc.once("exit", () => resolve());
      });
      proc.stdin?.end();
      const timeout = new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), STOP_TIMEOUT_MS),
      );
      if ((await Promise.race([exited, timeout])) === "timeout") {
        this.killProcessTree("SIGKILL");
        await exited;
      }
    } finally {
      this.stopping = false;
      this.teardown();
    }
  }
}
