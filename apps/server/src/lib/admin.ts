import { env } from "@kepler-chat/env/server";

const adminUserIds = new Set(
  env.KEPLER_ADMIN_USER_IDS.split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

export function isAdminUser(userId: string): boolean {
  return adminUserIds.has(userId);
}

