import { createHash, timingSafeEqual } from "node:crypto";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { CHAT_COMMANDS } from "../domain/activity.js";
import type { AssistantWorkflow } from "../workflow/assistant-workflow.js";
import type { CandidateBankWorkflow } from "../workflow/candidate-bank-workflow.js";
import { registerCandidateBankTools } from "./candidate-bank-tools.js";

const recordCommandSchema = z.object({
  command: z.enum(CHAT_COMMANDS),
  summary: z.string().trim().min(1).max(500),
});

const listActivitiesSchema = z.object({
  limit: z.number().int().min(1).max(100).default(25),
});

function buildHandler(workflow: AssistantWorkflow, candidateBank: CandidateBankWorkflow) {
  return createMcpHandler(() => {
    const server = new McpServer({ name: "job-search-app", version: "0.1.0" });

    server.registerTool(
      "record_command",
      {
        description:
          "Record a short receipt after the user explicitly gives a command in Codex chat. This only stores the receipt; it does not search jobs, analyze files, draft emails, or send email. Do not include CV text or sensitive personal details in the summary.",
        inputSchema: recordCommandSchema,
      },
      async (input) => {
        const activity = await workflow.recordCommand(input);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                activityId: activity.id,
                command: activity.command,
                recordedAt: activity.createdAt.toISOString(),
              }),
            },
          ],
        };
      },
    );

    server.registerTool(
      "list_recent_activities",
      {
        description: "Read recent persisted command receipts from the application.",
        inputSchema: listActivitiesSchema,
      },
      async ({ limit }) => {
        const activities = await workflow.listRecentActivities(limit);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                activities.map((activity) => ({
                  ...activity,
                  createdAt: activity.createdAt.toISOString(),
                })),
              ),
            },
          ],
        };
      },
    );

    registerCandidateBankTools(server, candidateBank);

    return server;
  });
}

function hasValidBearerToken(request: FastifyRequest, expectedToken: string): boolean {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return false;

  const providedToken = authorization.slice("Bearer ".length);
  const expectedDigest = createHash("sha256").update(expectedToken).digest();
  const providedDigest = createHash("sha256").update(providedToken).digest();
  return timingSafeEqual(expectedDigest, providedDigest);
}

export function registerMcpRoute(
  app: FastifyInstance,
  workflow: AssistantWorkflow,
  candidateBank: CandidateBankWorkflow,
  expectedToken: string,
): void {
  const nodeHandler = toNodeHandler(buildHandler(workflow, candidateBank));

  app.all("/mcp", async (request, reply) => {
    if (!hasValidBearerToken(request, expectedToken)) {
      return reply
        .code(401)
        .header("www-authenticate", "Bearer")
        .send({ error: "Valid bearer token required." });
    }

    return nodeHandler(request.raw as Parameters<typeof nodeHandler>[0], reply.raw, request.body);
  });
}
