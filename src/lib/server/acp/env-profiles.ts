import { and, eq } from "drizzle-orm";
import type { AgentId } from "$lib/contracts";
import { db } from "$lib/server/db/client";
import { agentEnvProfile } from "$lib/server/db/schema/kepler";
import { decryptProviderPayload, encryptProviderPayload } from "$lib/server/crypto";

function decryptRow(row: {
  encrypted_value: string;
  iv: string;
  auth_tag: string;
}): string {
  const parsed = decryptProviderPayload({
    encryptedPayload: row.encrypted_value,
    iv: row.iv,
    authTag: row.auth_tag,
  }) as { value?: string };
  if (!parsed.value || typeof parsed.value !== "string") {
    throw new Error("Invalid encrypted env payload");
  }
  return parsed.value;
}

export async function loadAgentEnv(agentId: AgentId): Promise<Record<string, string>> {
  const rows = await db.query.agentEnvProfile.findMany({
    where: (fields, { eq: eqOp }) => eqOp(fields.agent_id, agentId),
  });
  return Object.fromEntries(rows.map((row) => [row.env_key, decryptRow(row)]));
}

export async function listAgentEnvKeys(agentId: AgentId): Promise<string[]> {
  const rows = await db.query.agentEnvProfile.findMany({
    where: (fields, { eq: eqOp }) => eqOp(fields.agent_id, agentId),
  });
  return rows.map((row) => row.env_key).sort();
}

export async function setAgentEnvValue(
  agentId: AgentId,
  envKey: string,
  value: string,
): Promise<void> {
  const encrypted = encryptProviderPayload({ value });
  await db
    .insert(agentEnvProfile)
    .values({
      agent_id: agentId,
      env_key: envKey,
      encrypted_value: encrypted.encryptedPayload,
      iv: encrypted.iv,
      auth_tag: encrypted.authTag,
    })
    .onConflictDoUpdate({
      target: [agentEnvProfile.agent_id, agentEnvProfile.env_key],
      set: {
        encrypted_value: encrypted.encryptedPayload,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        updated_at: new Date(),
      },
    });
}

export async function deleteAgentEnvValue(agentId: AgentId, envKey: string): Promise<void> {
  await db
    .delete(agentEnvProfile)
    .where(and(eq(agentEnvProfile.agent_id, agentId), eq(agentEnvProfile.env_key, envKey)));
}
