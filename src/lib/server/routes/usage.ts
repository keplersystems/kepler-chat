import { Elysia } from "elysia";
import { requireAuth } from "$lib/server/auth";
import { buildUsageResponse } from "$lib/server/usage";

export const usageRoute = new Elysia({ prefix: "/api/usage" }).get(
  "/",
  async (context) => {
    requireAuth(context);
    return buildUsageResponse();
  },
  {
    detail: {
      summary: "Usage aggregates",
      tags: ["Usage"],
      description: "Token and cost aggregates from Kepler's message store",
    },
  },
);
