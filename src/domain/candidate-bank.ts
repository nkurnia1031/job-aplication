export const CANDIDATE_SOURCE_KINDS = [
  "cv",
  "portfolio",
  "supporting_document",
  "experience_update",
  "other",
] as const;

export type CandidateSourceKind = (typeof CANDIDATE_SOURCE_KINDS)[number];
export type CandidateFactSupport = "supported" | "unverified";
export type CandidateFactState = "current" | "conflict_pending" | "superseded" | "rejected";
export type ConflictDecision = "accept" | "reject";

export class CandidateSourceNotFoundError extends Error {
  constructor() {
    super("Candidate source was not found.");
    this.name = "CandidateSourceNotFoundError";
  }
}

export interface CandidateSource {
  id: string;
  sourceKey: string;
  versionNumber: number;
  kind: CandidateSourceKind;
  title: string;
  originalFileName: string;
  mediaType: string;
  sha256: string;
  storageKey: string;
  extractedText: string | null;
  createdAt: Date;
}

export type CandidateSourceReference = Omit<CandidateSource, "extractedText">;

export interface CandidateFactVersion {
  id: string;
  factId: string;
  factKey: string;
  versionNumber: number;
  subject: string;
  predicate: string;
  objectValue: string;
  statement: string;
  evidenceExcerpt: string | null;
  supportStatus: CandidateFactSupport;
  state: CandidateFactState;
  conflictsWithVersionId: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  source: CandidateSourceReference;
}

export interface CandidateFactHistory {
  factId: string;
  factKey: string;
  versions: CandidateFactVersion[];
}

export interface NewCandidateSource {
  id: string;
  sourceKey: string;
  kind: CandidateSourceKind;
  title: string;
  originalFileName: string;
  mediaType: string;
  sha256: string;
  storageKey: string;
  extractedText: string | null;
  createdAt: Date;
}

export interface NewCandidateFactVersion {
  id: string;
  factKey: string;
  subject: string;
  predicate: string;
  objectValue: string;
  statement: string;
  evidenceExcerpt: string | null;
  supportStatus: CandidateFactSupport;
  sourceId: string;
  createdAt: Date;
}

export interface CandidateFactRecordResult {
  outcome: "created" | "updated_same_value" | "conflict_pending";
  version: CandidateFactVersion;
  currentVersion: CandidateFactVersion | null;
}

export interface CandidateContext {
  supportedFacts: CandidateFactVersion[];
  unverifiedFacts: CandidateFactVersion[];
  conflicts: Array<{
    proposed: CandidateFactVersion;
    current: CandidateFactVersion | null;
  }>;
  claimPolicy: string;
}

export interface CandidateBankRepository {
  createSource(source: NewCandidateSource): Promise<CandidateSource>;
  getSource(id: string): Promise<CandidateSource | null>;
  listSourceReferences(): Promise<CandidateSourceReference[]>;
  recordFact(version: NewCandidateFactVersion): Promise<CandidateFactRecordResult>;
  resolveConflict(versionId: string, decision: ConflictDecision): Promise<CandidateFactVersion>;
  listHistory(): Promise<CandidateFactHistory[]>;
}
