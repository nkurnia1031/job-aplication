import {
  foreignKey,
  index,
  int,
  mediumtext,
  mysqlEnum,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const activityEvents = mysqlTable("activity_events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  command: mysqlEnum("command", [
    "candidate_update",
    "job_search",
    "draft_emails",
    "analyze_recruiter_reply",
    "other",
  ]).notNull(),
  summary: varchar("summary", { length: 500 }).notNull(),
  source: mysqlEnum("source", ["codex", "dashboard"]).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [index("activity_events_created_at_idx").on(table.createdAt)]);

export const candidateSources = mysqlTable("candidate_sources", {
  id: varchar("id", { length: 36 }).primaryKey(),
  sourceKey: varchar("source_key", { length: 191 }).notNull(),
  versionNumber: int("version_number", { unsigned: true }).notNull(),
  kind: mysqlEnum("kind", [
    "cv",
    "portfolio",
    "supporting_document",
    "experience_update",
    "other",
  ]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  originalFileName: varchar("original_file_name", { length: 255 }).notNull(),
  mediaType: varchar("media_type", { length: 100 }).notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  storageKey: varchar("storage_key", { length: 512 }).notNull(),
  extractedText: mediumtext("extracted_text"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("candidate_sources_key_version_uq").on(table.sourceKey, table.versionNumber),
  index("candidate_sources_sha256_idx").on(table.sha256),
]);

export const candidateFacts = mysqlTable("candidate_facts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  factKey: varchar("fact_key", { length: 191 }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [uniqueIndex("candidate_facts_fact_key_uq").on(table.factKey)]);

export const candidateFactVersions = mysqlTable("candidate_fact_versions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  factId: varchar("fact_id", { length: 36 }).notNull(),
  versionNumber: int("version_number", { unsigned: true }).notNull(),
  subject: varchar("subject", { length: 191 }).notNull(),
  predicate: varchar("predicate", { length: 191 }).notNull(),
  objectValue: varchar("object_value", { length: 255 }).notNull(),
  statement: varchar("statement", { length: 1000 }).notNull(),
  evidenceExcerpt: varchar("evidence_excerpt", { length: 1000 }),
  supportStatus: mysqlEnum("support_status", ["supported", "unverified"]).notNull(),
  state: mysqlEnum("state", ["current", "conflict_pending", "superseded", "rejected"]).notNull(),
  sourceId: varchar("source_id", { length: 36 }).notNull(),
  conflictsWithVersionId: varchar("conflicts_with_version_id", { length: 36 }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { mode: "date" }),
}, (table) => [
  uniqueIndex("candidate_fact_versions_fact_version_uq").on(table.factId, table.versionNumber),
  index("candidate_fact_versions_fact_state_idx").on(table.factId, table.state),
  index("candidate_fact_versions_source_idx").on(table.sourceId),
  foreignKey({
    name: "candidate_fact_versions_fact_fk",
    columns: [table.factId],
    foreignColumns: [candidateFacts.id],
  }),
  foreignKey({
    name: "candidate_fact_versions_source_fk",
    columns: [table.sourceId],
    foreignColumns: [candidateSources.id],
  }),
  foreignKey({
    name: "candidate_fact_versions_conflict_fk",
    columns: [table.conflictsWithVersionId],
    foreignColumns: [table.id],
  }),
]);
