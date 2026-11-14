import { and, asc, desc, eq, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type {
  CandidateBankRepository,
  CandidateFactRecordResult,
  CandidateFactVersion,
  CandidateSource,
  CandidateSourceReference,
  ConflictDecision,
  NewCandidateFactVersion,
  NewCandidateSource,
} from "../domain/candidate-bank.js";
import type { createDatabase } from "./connection.js";
import { candidateFactVersions, candidateFacts, candidateSources } from "./schema.js";

type Database = ReturnType<typeof createDatabase>["db"];

export function createMysqlCandidateBankRepository(db: Database): CandidateBankRepository {
  async function getVersion(id: string): Promise<CandidateFactVersion> {
    const rows = await db
      .select({
        id: candidateFactVersions.id,
        factId: candidateFacts.id,
        factKey: candidateFacts.factKey,
        versionNumber: candidateFactVersions.versionNumber,
        subject: candidateFactVersions.subject,
        predicate: candidateFactVersions.predicate,
        objectValue: candidateFactVersions.objectValue,
        statement: candidateFactVersions.statement,
        evidenceExcerpt: candidateFactVersions.evidenceExcerpt,
        supportStatus: candidateFactVersions.supportStatus,
        state: candidateFactVersions.state,
        conflictsWithVersionId: candidateFactVersions.conflictsWithVersionId,
        createdAt: candidateFactVersions.createdAt,
        resolvedAt: candidateFactVersions.resolvedAt,
        sourceId: candidateSources.id,
        sourceKey: candidateSources.sourceKey,
        sourceVersionNumber: candidateSources.versionNumber,
        sourceKind: candidateSources.kind,
        sourceTitle: candidateSources.title,
        originalFileName: candidateSources.originalFileName,
        mediaType: candidateSources.mediaType,
        sha256: candidateSources.sha256,
        storageKey: candidateSources.storageKey,
        sourceCreatedAt: candidateSources.createdAt,
      })
      .from(candidateFactVersions)
      .innerJoin(candidateFacts, eq(candidateFactVersions.factId, candidateFacts.id))
      .innerJoin(candidateSources, eq(candidateFactVersions.sourceId, candidateSources.id))
      .where(eq(candidateFactVersions.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) throw new Error("Candidate fact version was not found.");

    const source: CandidateSourceReference = {
      id: row.sourceId,
      sourceKey: row.sourceKey,
      versionNumber: row.sourceVersionNumber,
      kind: row.sourceKind,
      title: row.sourceTitle,
      originalFileName: row.originalFileName,
      mediaType: row.mediaType,
      sha256: row.sha256,
      storageKey: row.storageKey,
      createdAt: row.sourceCreatedAt,
    };

    return {
      id: row.id,
      factId: row.factId,
      factKey: row.factKey,
      versionNumber: row.versionNumber,
      subject: row.subject,
      predicate: row.predicate,
      objectValue: row.objectValue,
      statement: row.statement,
      evidenceExcerpt: row.evidenceExcerpt,
      supportStatus: row.supportStatus,
      state: row.state,
      conflictsWithVersionId: row.conflictsWithVersionId,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
      source,
    };
  }

  return {
    async createSource(source: NewCandidateSource): Promise<CandidateSource> {
      const stored = await db.transaction(async (tx) => {
        const latest = await tx
          .select({ versionNumber: candidateSources.versionNumber })
          .from(candidateSources)
          .where(eq(candidateSources.sourceKey, source.sourceKey))
          .orderBy(desc(candidateSources.versionNumber))
          .limit(1)
          .for("update");

        const versionNumber = (latest[0]?.versionNumber ?? 0) + 1;
        await tx.insert(candidateSources).values({ ...source, versionNumber });
        return versionNumber;
      });

      return {
        ...source,
        versionNumber: stored,
      };
    },

    async getSource(id): Promise<CandidateSource | null> {
      const rows = await db.select().from(candidateSources).where(eq(candidateSources.id, id)).limit(1);
      return rows[0] ?? null;
    },

    async listSourceReferences() {
      const rows = await db
        .select({
          id: candidateSources.id,
          sourceKey: candidateSources.sourceKey,
          versionNumber: candidateSources.versionNumber,
          kind: candidateSources.kind,
          title: candidateSources.title,
          originalFileName: candidateSources.originalFileName,
          mediaType: candidateSources.mediaType,
          sha256: candidateSources.sha256,
          storageKey: candidateSources.storageKey,
          createdAt: candidateSources.createdAt,
        })
        .from(candidateSources)
        .orderBy(asc(candidateSources.createdAt));
      return rows.map((row): CandidateSourceReference => ({
        id: row.id,
        sourceKey: row.sourceKey,
        versionNumber: row.versionNumber,
        kind: row.kind,
        title: row.title,
        originalFileName: row.originalFileName,
        mediaType: row.mediaType,
        sha256: row.sha256,
        storageKey: row.storageKey,
        createdAt: row.createdAt,
      }));
    },

    async recordFact(input: NewCandidateFactVersion): Promise<CandidateFactRecordResult> {
      const result = await db.transaction(async (tx) => {
        const existingFacts = await tx
          .select()
          .from(candidateFacts)
          .where(eq(candidateFacts.factKey, input.factKey))
          .limit(1)
          .for("update");

        let factId = existingFacts[0]?.id;
        if (!factId) {
          factId = randomUUID();
          await tx.insert(candidateFacts).values({
            id: factId,
            factKey: input.factKey,
            createdAt: input.createdAt,
          });
        }

        const versions = await tx
          .select()
          .from(candidateFactVersions)
          .where(eq(candidateFactVersions.factId, factId))
          .orderBy(desc(candidateFactVersions.versionNumber))
          .limit(1)
          .for("update");
        const nextVersionNumber = (versions[0]?.versionNumber ?? 0) + 1;

        const currentRows = await tx
          .select()
          .from(candidateFactVersions)
          .where(and(eq(candidateFactVersions.factId, factId), eq(candidateFactVersions.state, "current")))
          .limit(1)
          .for("update");
        const current = currentRows[0];

        const sameValue = current
          ? current.subject.toLocaleLowerCase() === input.subject.toLocaleLowerCase() &&
            current.predicate.toLocaleLowerCase() === input.predicate.toLocaleLowerCase() &&
            current.objectValue.toLocaleLowerCase() === input.objectValue.toLocaleLowerCase()
          : false;

        const keepSupportedCurrent =
          sameValue && current?.supportStatus === "supported" && input.supportStatus === "unverified";
        const state = !current || (sameValue && !keepSupportedCurrent) ? "current" :
          sameValue ? "superseded" : "conflict_pending";

        if (sameValue && !keepSupportedCurrent && current) {
          await tx
            .update(candidateFactVersions)
            .set({ state: "superseded", resolvedAt: input.createdAt })
            .where(eq(candidateFactVersions.id, current.id));
        }

        const versionId = input.id;
        await tx.insert(candidateFactVersions).values({
          id: versionId,
          factId,
          versionNumber: nextVersionNumber,
          subject: input.subject,
          predicate: input.predicate,
          objectValue: input.objectValue,
          statement: input.statement,
          evidenceExcerpt: input.evidenceExcerpt,
          supportStatus: input.supportStatus,
          state,
          sourceId: input.sourceId,
          conflictsWithVersionId: state === "conflict_pending" ? current?.id ?? null : null,
          createdAt: input.createdAt,
          resolvedAt: state === "superseded" ? input.createdAt : null,
        });

        return {
          factVersionId: versionId,
          currentVersionId: state === "current" ? versionId : current?.id ?? null,
          outcome: state === "conflict_pending"
            ? "conflict_pending"
            : keepSupportedCurrent
              ? "updated_same_value"
              : sameValue
                ? "updated_same_value"
                : "created",
        } as const;
      });

      return {
        outcome: result.outcome,
        version: await getVersion(result.factVersionId),
        currentVersion: result.currentVersionId ? await getVersion(result.currentVersionId) : null,
      };
    },

    async resolveConflict(versionId: string, decision: ConflictDecision): Promise<CandidateFactVersion> {
      await db.transaction(async (tx) => {
        const proposedRows = await tx
          .select()
          .from(candidateFactVersions)
          .where(eq(candidateFactVersions.id, versionId))
          .limit(1)
          .for("update");
        const proposed = proposedRows[0];
        if (!proposed || proposed.state !== "conflict_pending") {
          throw new Error("Only a pending candidate fact conflict can be resolved.");
        }

        const resolutionTime = new Date();
        if (decision === "accept") {
          await tx
            .update(candidateFactVersions)
            .set({ state: "superseded", resolvedAt: resolutionTime })
            .where(and(eq(candidateFactVersions.factId, proposed.factId), eq(candidateFactVersions.state, "current")));

          await tx
            .update(candidateFactVersions)
            .set({ state: "rejected", resolvedAt: resolutionTime })
            .where(and(
              eq(candidateFactVersions.factId, proposed.factId),
              eq(candidateFactVersions.state, "conflict_pending"),
              ne(candidateFactVersions.id, versionId),
            ));

          await tx
            .update(candidateFactVersions)
            .set({ state: "current", resolvedAt: resolutionTime })
            .where(eq(candidateFactVersions.id, versionId));
        } else {
          await tx
            .update(candidateFactVersions)
            .set({ state: "rejected", resolvedAt: resolutionTime })
            .where(eq(candidateFactVersions.id, versionId));
        }
      });

      return getVersion(versionId);
    },

    async listHistory() {
      const rows = await db
        .select({
          id: candidateFactVersions.id,
          factId: candidateFacts.id,
          factKey: candidateFacts.factKey,
          versionNumber: candidateFactVersions.versionNumber,
          subject: candidateFactVersions.subject,
          predicate: candidateFactVersions.predicate,
          objectValue: candidateFactVersions.objectValue,
          statement: candidateFactVersions.statement,
          evidenceExcerpt: candidateFactVersions.evidenceExcerpt,
          supportStatus: candidateFactVersions.supportStatus,
          state: candidateFactVersions.state,
          conflictsWithVersionId: candidateFactVersions.conflictsWithVersionId,
          createdAt: candidateFactVersions.createdAt,
          resolvedAt: candidateFactVersions.resolvedAt,
          sourceId: candidateSources.id,
          sourceKey: candidateSources.sourceKey,
          sourceVersionNumber: candidateSources.versionNumber,
          sourceKind: candidateSources.kind,
          sourceTitle: candidateSources.title,
          originalFileName: candidateSources.originalFileName,
          mediaType: candidateSources.mediaType,
          sha256: candidateSources.sha256,
          storageKey: candidateSources.storageKey,
          sourceCreatedAt: candidateSources.createdAt,
        })
        .from(candidateFactVersions)
        .innerJoin(candidateFacts, eq(candidateFactVersions.factId, candidateFacts.id))
        .innerJoin(candidateSources, eq(candidateFactVersions.sourceId, candidateSources.id))
        .orderBy(asc(candidateFacts.factKey), asc(candidateFactVersions.versionNumber));

      const histories = new Map<string, CandidateFactVersion[]>();
      for (const row of rows) {
        const source: CandidateSourceReference = {
          id: row.sourceId,
          sourceKey: row.sourceKey,
          versionNumber: row.sourceVersionNumber,
          kind: row.sourceKind,
          title: row.sourceTitle,
          originalFileName: row.originalFileName,
          mediaType: row.mediaType,
          sha256: row.sha256,
          storageKey: row.storageKey,
          createdAt: row.sourceCreatedAt,
        };
        const version: CandidateFactVersion = {
          id: row.id,
          factId: row.factId,
          factKey: row.factKey,
          versionNumber: row.versionNumber,
          subject: row.subject,
          predicate: row.predicate,
          objectValue: row.objectValue,
          statement: row.statement,
          evidenceExcerpt: row.evidenceExcerpt,
          supportStatus: row.supportStatus,
          state: row.state,
          conflictsWithVersionId: row.conflictsWithVersionId,
          createdAt: row.createdAt,
          resolvedAt: row.resolvedAt,
          source,
        };
        const factVersions = histories.get(row.factId) ?? [];
        factVersions.push(version);
        histories.set(row.factId, factVersions);
      }

      return Array.from(histories.entries()).map(([factId, versions]) => ({
        factId,
        factKey: versions[0]?.factKey ?? "",
        versions,
      }));
    },
  };
}
