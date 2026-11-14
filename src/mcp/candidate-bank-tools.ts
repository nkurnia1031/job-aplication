import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { CANDIDATE_SOURCE_KINDS } from "../domain/candidate-bank.js";
import type { CandidateBankWorkflow } from "../workflow/candidate-bank-workflow.js";

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

export function registerCandidateBankTools(
  server: McpServer,
  workflow: CandidateBankWorkflow,
): void {
  server.registerTool(
    "store_candidate_file",
    {
      description:
        "After the user explicitly asks to analyze or update a candidate document, copy one file from the configured .candidate-inbox into private app storage and preserve its extracted text and provenance. The path is relative to .candidate-inbox; this tool cannot read arbitrary paths. Read the file in Codex first and include only text extracted from that source.",
      inputSchema: z.object({
        sourceKey: z.string().min(1).max(191),
        kind: z.enum(CANDIDATE_SOURCE_KINDS),
        title: z.string().trim().min(1).max(255),
        relativePath: z.string().trim().min(1).max(255),
        extractedText: z.string().max(200_000).default(""),
      }),
    },
    async (input) => textResult(await workflow.importSource(input)),
  );

  server.registerTool(
    "store_candidate_experience_update",
    {
      description:
        "After the user explicitly asks to save a written experience or profile update, preserve the original text as a new candidate source version.",
      inputSchema: z.object({
        sourceKey: z.string().min(1).max(191),
        title: z.string().trim().min(1).max(255),
        content: z.string().trim().min(1).max(200_000),
      }),
    },
    async (input) => textResult(await workflow.saveExperienceUpdate(input)),
  );

  server.registerTool(
    "record_candidate_fact",
    {
      description:
        "Record one structured candidate fact after an explicit Codex analysis/update command. Use supportStatus=supported only when evidenceExcerpt occurs in the stored source text. Use unverified when evidence is absent; unverified facts are excluded from supported candidate context. Different values for an existing fact key remain pending until the user confirms one.",
      inputSchema: z.object({
        factKey: z.string().trim().min(1).max(191),
        subject: z.string().trim().min(1).max(191),
        predicate: z.string().trim().min(1).max(191),
        objectValue: z.string().trim().min(1).max(255),
        statement: z.string().trim().min(1).max(1000),
        sourceId: z.string().uuid(),
        evidenceExcerpt: z.string().trim().max(1000).optional(),
        supportStatus: z.enum(["supported", "unverified"]),
      }),
    },
    async (input) => textResult(await workflow.recordFact(input)),
  );

  server.registerTool(
    "resolve_candidate_fact_conflict",
    {
      description:
        "Resolve a pending candidate fact conflict only after the user explicitly confirms or rejects the proposed version in Codex chat.",
      inputSchema: z.object({
        versionId: z.string().uuid(),
        decision: z.enum(["accept", "reject"]),
      }),
    },
    async ({ versionId, decision }) => textResult(await workflow.resolveConflict(versionId, decision)),
  );

  server.registerTool(
    "get_candidate_context",
    {
      description:
        "Read candidate knowledge for matching or drafting. Supported facts, unverified facts, and unresolved conflicts are returned separately. Facts absent from the response are unknown and must not be claimed.",
      inputSchema: z.object({}),
    },
    async () => textResult(await workflow.getContext()),
  );

  server.registerTool(
    "list_candidate_fact_history",
    {
      description: "Read candidate facts, their full version history, evidence excerpts, and source references.",
      inputSchema: z.object({}),
    },
    async () => textResult(await workflow.listHistory()),
  );

  server.registerTool(
    "list_candidate_sources",
    {
      description: "List saved candidate sources and their versions without exposing the local storage path.",
      inputSchema: z.object({}),
    },
    async () => textResult(await workflow.listSources()),
  );

  server.registerTool(
    "read_candidate_source",
    {
      description:
        "Read an extracted-text segment and metadata from an already stored candidate source. Use offsets to read long sources in chunks. The original file remains stored at storedPath.",
      inputSchema: z.object({
        sourceId: z.string().uuid(),
        startAt: z.number().int().min(0).default(0),
        maxCharacters: z.number().int().min(1).max(30_000).default(20_000),
      }),
    },
    async (input) => textResult(await workflow.readSource(input.sourceId, input.startAt, input.maxCharacters)),
  );

  server.registerTool(
    "rebuild_candidate_knowledge_map",
    {
      description:
        "Rebuild the deterministic candidate knowledge map from current and pending source-backed fact versions. This performs no AI inference.",
      inputSchema: z.object({}),
    },
    async () => {
      const { graph, storagePath } = await workflow.rebuildKnowledgeMap();
      return textResult({
        storagePath,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        sourceBackedFactVersionIds: graph.derivedFromFactVersionIds,
      });
    },
  );
}
