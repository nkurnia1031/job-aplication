import { createHash } from "node:crypto";
import type { CandidateFactVersion } from "./candidate-bank.js";

export type KnowledgeEdgeEvidence = "EXTRACTED" | "AMBIGUOUS";

export interface CandidateKnowledgeMapNode {
  id: string;
  label: string;
  kind: "candidate" | "entity";
  factVersionIds: string[];
  sourceIds: string[];
}

export interface CandidateKnowledgeMapEdge {
  id: string;
  from: string;
  to: string;
  relation: string;
  evidence: KnowledgeEdgeEvidence;
  factVersionId: string;
  sourceId: string;
  evidenceExcerpt: string | null;
}

export interface CandidateKnowledgeMap {
  schemaVersion: 1;
  derivedFromFactVersionIds: string[];
  nodes: CandidateKnowledgeMapNode[];
  edges: CandidateKnowledgeMapEdge[];
}

function normalizeEntity(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function nodeId(kind: string, value: string): string {
  const digest = createHash("sha256").update(`${kind}:${normalizeEntity(value)}`).digest("hex").slice(0, 24);
  return `node_${digest}`;
}

export function buildCandidateKnowledgeMap(
  factVersions: CandidateFactVersion[],
): CandidateKnowledgeMap {
  const included = factVersions.filter(
    (fact) => fact.state === "current" || fact.state === "conflict_pending",
  );
  const nodes = new Map<string, CandidateKnowledgeMapNode>();
  const edges: CandidateKnowledgeMapEdge[] = [];

  for (const fact of included) {
    const isCandidate = normalizeEntity(fact.subject) === "candidate";
    const fromId = nodeId(isCandidate ? "candidate" : "entity", fact.subject);
    const toId = nodeId("entity", fact.objectValue);
    const sourceValues = [fact.source.id];

    for (const [id, label, kind] of [
      [fromId, isCandidate ? "Candidate" : fact.subject, isCandidate ? "candidate" : "entity"],
      [toId, fact.objectValue, "entity"],
    ] as const) {
      const existing = nodes.get(id);
      if (existing) {
        if (!existing.factVersionIds.includes(fact.id)) existing.factVersionIds.push(fact.id);
        for (const sourceId of sourceValues) {
          if (!existing.sourceIds.includes(sourceId)) existing.sourceIds.push(sourceId);
        }
      } else {
        nodes.set(id, {
          id,
          label,
          kind,
          factVersionIds: [fact.id],
          sourceIds: sourceValues,
        });
      }
    }

    edges.push({
      id: `edge_${fact.id}`,
      from: fromId,
      to: toId,
      relation: fact.predicate,
      evidence:
        fact.state === "current" && fact.supportStatus === "supported" ? "EXTRACTED" : "AMBIGUOUS",
      factVersionId: fact.id,
      sourceId: fact.source.id,
      evidenceExcerpt: fact.evidenceExcerpt,
    });
  }

  const orderedNodes = [...nodes.values()]
    .map((node) => ({
      ...node,
      factVersionIds: node.factVersionIds.sort(),
      sourceIds: node.sourceIds.sort(),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const orderedEdges = edges.sort((left, right) => left.id.localeCompare(right.id));

  return {
    schemaVersion: 1,
    derivedFromFactVersionIds: included.map((fact) => fact.id).sort(),
    nodes: orderedNodes,
    edges: orderedEdges,
  };
}
