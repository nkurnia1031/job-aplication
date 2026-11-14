import "dotenv/config";
import { createApp } from "./app.js";
import { createDatabase } from "./db/connection.js";
import { createMysqlActivityRepository } from "./db/mysql-activity-repository.js";
import { createMysqlCandidateBankRepository } from "./db/mysql-candidate-bank-repository.js";
import { createCandidateSourceFileStore } from "./storage/candidate-source-files.js";
import { createAssistantWorkflow } from "./workflow/assistant-workflow.js";
import { createCandidateBankWorkflow } from "./workflow/candidate-bank-workflow.js";

const databaseUrl = process.env.DATABASE_URL;
const mcpToken = process.env.MCP_BEARER_TOKEN;
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? "3000");

if (!databaseUrl) throw new Error("DATABASE_URL is required.");
if (!mcpToken || mcpToken.length < 32) {
  throw new Error("MCP_BEARER_TOKEN must be set and contain at least 32 characters.");
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}
if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
  throw new Error("This MVP binds to loopback only. HOST must be 127.0.0.1, localhost, or ::1.");
}

const database = createDatabase(databaseUrl);
const repository = createMysqlActivityRepository(database.db);
const workflow = createAssistantWorkflow({ repository });
const candidateRepository = createMysqlCandidateBankRepository(database.db);
const candidateFiles = createCandidateSourceFileStore({
  importDirectory: process.env.CANDIDATE_IMPORT_DIR ?? ".candidate-inbox",
  dataDirectory: process.env.CANDIDATE_DATA_DIR ?? "data",
});
const candidateBank = createCandidateBankWorkflow({
  repository: candidateRepository,
  files: candidateFiles,
});
const app = await createApp(workflow, candidateBank, mcpToken);

try {
  await app.listen({ host, port });
  app.log.info(`Job-search dashboard and MCP endpoint listening at http://${host}:${port}`);
} catch (error) {
  await database.close();
  app.log.error(error);
  process.exitCode = 1;
}

const shutdown = async () => {
  await app.close();
  await database.close();
};

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
