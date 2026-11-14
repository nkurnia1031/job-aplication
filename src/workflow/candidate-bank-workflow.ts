import { randomUUID } from "node:crypto";
import type {
  CandidateBankRepository,
  CandidateContext,
  CandidateFactRecordResult,
  CandidateFactVersion,
  CandidateSource,
  CandidateSourceKind,
  CandidateSourceReference,
  ConflictDecision,
} from "../domain/candidate-bank.js";
import { CandidateSourceNotFoundError } from "../domain/candidate-bank.js";
import type { CandidateKnowledgeMap } from "../domain/candidate-knowledge-map.js";
import { buildCandidateKnowledgeMap } from "../domain/candidate-knowledge-map.js";
import type { CandidateSourceFileStore, StoredSourceFile } from "../storage/candidate-source-files.js";
import { sourceTextLimit } from "../storage/candidate-source-files.js";

export interface CandidateBankWorkflow {
  importSource(input: {
    sourceKey: string;
    kind: CandidateSourceKind;
    title: string;
    relativePath: string;
    extractedText: string;
  }): Promise<CandidateSourceReference>;
  saveExperienceUpdate(input: {
    sourceKey: string;
    title: string;
    content: string;
  }): Promise<CandidateSourceReference>;
  recordFact(input: {
    factKey: string;
    subject: string;
    predicate: string;
    objectValue: string;
    statement: string;
    sourceId: string;
    evidenceExcerpt?: string | undefined;
    supportStatus: "supported" | "unverified";
  }): Promise<CandidateFactRecordResult>;
  resolveConflict(versionId: string, decision: ConflictDecision): Promise<CandidateFactVersion>;
  getContext(): Promise<CandidateContext>;
  listHistory(): Promise<Array<{ factId: string; factKey: string; versions: CandidateFactVersion[] }>>;
  listSources(): Promise<CandidateSourceReference[]>;
  readSource(id: string, startAt?: number, maxCharacters?: number): Promise<{
    source: CandidateSourceReference;
    extractedText: string | null;
    textOffset: number;
    totalTextLength: number;
    hasMoreText: boolean;
    storedPath: string;
  }>;
  readSourceFile(id: string): Promise<{
    source: CandidateSource;
    bytes: Buffer;
  }>;
  rebuildKnowledgeMap(): Promise<{ graph: CandidateKnowledgeMap; storagePath: string }>;
}

export interface CandidateBankWorkflowOptions {
  repository: CandidateBankRepository;
  files: CandidateSourceFileStore;
  now?: () => Date;
  createId?: () => string;
}

const MAX_STATEMENT_LENGTH = 1000;
const MAX_EVIDENCE_LENGTH = 1000;
const MAX_FIELD_LENGTH = 255;
const MAX_KEY_LENGTH = 191;
const MAX_READ_CHARACTERS = 30_000;
const CLAIM_POLICY =
  "Only supportedFacts have direct source evidence. Treat unverifiedFacts and all pending conflicts as unconfirmed; anything absent from this response is unknown and must not be claimed.";

function trimField(value: string, field: string, maximum = MAX_FIELD_LENGTH): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximum) {
    throw new Error(`${field} must contain 1–${maximum} characters.`);
  }
  return trimmed;
}

function normalizeEvidence(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function validateSourceKey(value: string): string {
  const key = value.trim().toLocaleLowerCase();
  if (
    key.length === 0 ||
    key.length > MAX_KEY_LENGTH ||
    !/^[a-z0-9][a-z0-9._/-]*$/.test(key) ||
    key.includes("..") ||
    key.includes("//")
  ) {
    throw new Error("Source key must be a simple identifier such as resume or experience/2026.");
  }
  return key;
}

function toReference(source: CandidateSource): CandidateSourceReference {
  const { extractedText: _extractedText, ...reference } = source;
  return reference;
}

function cleanupOnFailure(
  files: CandidateSourceFileStore,
  stored: StoredSourceFile,
  operation: () => Promise<CandidateSource>,
): Promise<CandidateSource> {
  return operation().catch(async (error: unknown) => {
    await files.remove(stored.storageKey).catch(() => undefined);
    throw error;
  });
}

export function createCandidateBankWorkflow({
  repository,
  files,
  now = () => new Date(),
  createId = randomUUID,
}: CandidateBankWorkflowOptions): CandidateBankWorkflow {
  async function rebuild(): Promise<{ graph: CandidateKnowledgeMap; storagePath: string }> {
    const histories = await repository.listHistory();
    const versions = histories.flatMap((history) => history.versions);
    const graph = buildCandidateKnowledgeMap(versions);
    const storagePath = await files.writeKnowledgeMap(graph);
    return { graph, storagePath };
  }

  return {
    async importSource(input) {
      const sourceId = createId();
      const sourceKey = validateSourceKey(input.sourceKey);
      const title = trimField(input.title, "Source title");
      const extractedText = input.extractedText.trim();
      if (extractedText.length > sourceTextLimit()) {
        throw new Error(`Extracted source text must be ${sourceTextLimit()} characters or shorter.`);
      }

      const stored = await files.importFromInbox(input.relativePath, sourceId);
      const source = await cleanupOnFailure(files, stored, () => repository.createSource({
        id: sourceId,
        sourceKey,
        kind: input.kind,
        title,
        originalFileName: stored.originalFileName,
        mediaType: stored.mediaType,
        sha256: stored.sha256,
        storageKey: stored.storageKey,
        extractedText: extractedText || null,
        createdAt: now(),
      }));

      return toReference(source);
    },

    async saveExperienceUpdate(input) {
      const sourceId = createId();
      const sourceKey = validateSourceKey(input.sourceKey);
      const title = trimField(input.title, "Source title");
      const content = input.content.trim();
      if (!content) throw new Error("Experience update cannot be empty.");
      if (content.length > sourceTextLimit()) {
        throw new Error(`Experience updates must be ${sourceTextLimit()} characters or shorter.`);
      }

      const stored = await files.saveNote(sourceId, title, content);
      const source = await cleanupOnFailure(files, stored, () => repository.createSource({
        id: sourceId,
        sourceKey,
        kind: "experience_update",
        title,
        originalFileName: stored.originalFileName,
        mediaType: stored.mediaType,
        sha256: stored.sha256,
        storageKey: stored.storageKey,
        extractedText: content,
        createdAt: now(),
      }));

      return toReference(source);
    },

    async recordFact(input) {
      const factKey = input.factKey.trim().toLocaleLowerCase();
      if (
        factKey.length === 0 ||
        factKey.length > MAX_KEY_LENGTH ||
        !/^[a-z0-9][a-z0-9._:-]*$/.test(factKey)
      ) {
        throw new Error("Fact key must be a stable identifier such as skill:typescript.");
      }

      const subject = trimField(input.subject, "Fact subject", MAX_KEY_LENGTH);
      const predicate = trimField(input.predicate, "Fact relationship", MAX_KEY_LENGTH);
      const objectValue = trimField(input.objectValue, "Fact value");
      const statement = trimField(input.statement, "Fact statement", MAX_STATEMENT_LENGTH);
      const source = await repository.getSource(input.sourceId);
      if (!source) throw new Error("Candidate source was not found.");

      const evidenceExcerpt = input.evidenceExcerpt?.trim() || null;
      if (evidenceExcerpt && evidenceExcerpt.length > MAX_EVIDENCE_LENGTH) {
        throw new Error(`Evidence excerpt must be ${MAX_EVIDENCE_LENGTH} characters or shorter.`);
      }
      if (input.supportStatus === "supported") {
        if (!evidenceExcerpt || !source.extractedText) {
          throw new Error("A supported fact needs an exact evidence excerpt from the saved source text.");
        }
        if (!normalizeEvidence(source.extractedText).includes(normalizeEvidence(evidenceExcerpt))) {
          throw new Error("Evidence excerpt was not found in the saved source text; record this fact as unverified.");
        }
      }

      const result = await repository.recordFact({
        id: createId(),
        factKey,
        subject,
        predicate,
        objectValue,
        statement,
        evidenceExcerpt,
        supportStatus: input.supportStatus,
        sourceId: source.id,
        createdAt: now(),
      });

      return result;
    },

    async resolveConflict(versionId, decision) {
      return repository.resolveConflict(versionId, decision);
    },

    async getContext(): Promise<CandidateContext> {
      const histories = await repository.listHistory();
      const currentVersions = histories.flatMap((history) =>
        history.versions.filter((version) => version.state === "current"),
      );
      const supportedFacts = currentVersions.filter((fact) => fact.supportStatus === "supported");
      const unverifiedFacts = currentVersions.filter((fact) => fact.supportStatus === "unverified");
      const conflicts = histories.flatMap((history) => {
        const current = history.versions.find((version) => version.state === "current") ?? null;
        return history.versions
          .filter((version) => version.state === "conflict_pending")
          .map((proposed) => ({ proposed, current }));
      });

      return { supportedFacts, unverifiedFacts, conflicts, claimPolicy: CLAIM_POLICY };
    },

    listHistory: () => repository.listHistory(),

    listSources: () => repository.listSourceReferences(),

    async readSource(id, startAt = 0, maxCharacters = 20_000) {
      if (!Number.isInteger(startAt) || startAt < 0) throw new Error("Source text offset must be non-negative.");
      if (!Number.isInteger(maxCharacters) || maxCharacters < 1 || maxCharacters > MAX_READ_CHARACTERS) {
        throw new Error(`Source text reads must request 1–${MAX_READ_CHARACTERS} characters.`);
      }

      const source = await repository.getSource(id);
      if (!source) throw new CandidateSourceNotFoundError();
      const text = source.extractedText;
      const excerpt = text?.slice(startAt, startAt + maxCharacters) ?? null;
      return {
        source: toReference(source),
        extractedText: excerpt,
        textOffset: startAt,
        totalTextLength: text?.length ?? 0,
        hasMoreText: text ? startAt + maxCharacters < text.length : false,
        storedPath: source.storageKey,
      };
    },

    async readSourceFile(id) {
      const source = await repository.getSource(id);
      if (!source) throw new CandidateSourceNotFoundError();
      return { source, bytes: await files.read(source.storageKey) };
    },

    rebuildKnowledgeMap: rebuild,
  };
}
