import type { FastifyInstance } from "fastify";
import { CandidateSourceNotFoundError } from "../domain/candidate-bank.js";
import type { CandidateBankWorkflow } from "../workflow/candidate-bank-workflow.js";

export async function registerCandidateBankRoutes(
  app: FastifyInstance,
  workflow: CandidateBankWorkflow,
): Promise<void> {
  app.get("/api/candidate-bank", async (_request, reply) => {
    reply.header("cache-control", "no-store");
    const [histories, sources] = await Promise.all([
      workflow.listHistory(),
      workflow.listSources(),
    ]);
    const facts = histories.map((history) => ({
      ...history,
      versions: history.versions.map((version) => ({
        ...version,
        source: {
          id: version.source.id,
          sourceKey: version.source.sourceKey,
          versionNumber: version.source.versionNumber,
          kind: version.source.kind,
          title: version.source.title,
          originalFileName: version.source.originalFileName,
          mediaType: version.source.mediaType,
          createdAt: version.source.createdAt,
        },
      })),
    }));
    return {
      facts,
      sources: sources.map((source) => ({
        id: source.id,
        sourceKey: source.sourceKey,
        versionNumber: source.versionNumber,
        kind: source.kind,
        title: source.title,
        originalFileName: source.originalFileName,
        mediaType: source.mediaType,
        createdAt: source.createdAt,
      })),
    };
  });

  app.get<{ Params: { sourceId: string } }>(
    "/api/candidate-sources/:sourceId/file",
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      try {
        const { source, bytes } = await workflow.readSourceFile(request.params.sourceId);
        const fileName = encodeURIComponent(source.originalFileName);
        return reply
          .type(source.mediaType)
          .header("content-disposition", `attachment; filename*=UTF-8''${fileName}`)
          .send(bytes);
      } catch (error) {
        if (error instanceof CandidateSourceNotFoundError) {
          return reply.code(404).send({ error: "Candidate source not found." });
        }
        throw error;
      }
    },
  );
}
