import { env } from "@kepler-chat/env/server";
import { createServer, type Server } from "net";

const usedPorts = new Set<number>();

async function isPortFreeOnSystem(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server: Server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port, "127.0.0.1");
  });
}

export async function allocatePort(): Promise<number> {
  const start = env.KEPLER_PORT_RANGE_START;
  const end = env.KEPLER_PORT_RANGE_END;

  for (let port = start; port <= end; port++) {
    if (usedPorts.has(port)) {
      continue;
    }

    const isFree = await isPortFreeOnSystem(port);
    if (isFree) {
      usedPorts.add(port);
      return port;
    }
  }

  throw new Error("No available ports in configured range");
}

export function releasePort(port: number): void {
  usedPorts.delete(port);
}
