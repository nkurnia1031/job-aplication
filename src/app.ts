import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import { createMcpFastifyApp } from "@modelcontextprotocol/fastify";
import type { FastifyInstance } from "fastify";
import type { AssistantWorkflow } from "./workflow/assistant-workflow.js";
import type { CandidateBankWorkflow } from "./workflow/candidate-bank-workflow.js";
import { registerActivityRoutes } from "./http/activity-routes.js";
import { registerCandidateBankRoutes } from "./http/candidate-bank-routes.js";
import { registerMcpRoute } from "./mcp/server.js";

const appDirectory = fileURLToPath(new URL(".", import.meta.url));
const webBuildDirectory = resolve(appDirectory, "../web/dist");

export async function createApp(
  workflow: AssistantWorkflow,
  candidateBank: CandidateBankWorkflow,
  mcpToken: string,
): Promise<FastifyInstance> {
  const app = createMcpFastifyApp();

  await registerActivityRoutes(app, workflow);
  await registerCandidateBankRoutes(app, candidateBank);
  registerMcpRoute(app, workflow, candidateBank, mcpToken);

  const hasWebBuild = existsSync(webBuildDirectory);
  if (hasWebBuild) {
    await app.register(fastifyStatic, {
      root: webBuildDirectory,
      prefix: "/",
      wildcard: false,
    });
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/") || request.url.startsWith("/mcp")) {
      return reply.code(404).send({ error: "Not found." });
    }
    if (!hasWebBuild) return reply.code(404).send({ error: "Dashboard build not found." });
    return reply.sendFile("index.html");
  });

  return app;
}
