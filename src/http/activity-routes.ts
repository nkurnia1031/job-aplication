import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AssistantWorkflow } from "../workflow/assistant-workflow.js";

const listActivitiesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export async function registerActivityRoutes(
  app: FastifyInstance,
  workflow: AssistantWorkflow,
): Promise<void> {
  app.get("/api/activities", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsed = listActivitiesQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid activity list limit." });
    }

    const activities = await workflow.listRecentActivities(parsed.data.limit);
    return { activities };
  });
}
