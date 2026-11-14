---
status: accepted
---

# Candidate source storage and fact provenance

## Context

The candidate bank must retain original documents and written updates, link every fact version to evidence and a source version, and preserve conflicts until the user decides which version is current. The application uses the MySQL instance already available in the user's environment. Candidate knowledge relationships must be rebuildable and must not contain model-generated claims that have no source fact.

## Decision

- Store source metadata, extracted text, fact identities, and fact versions in MySQL.
- Keep original source bytes under the ignored local `data/candidate-sources/` directory; store only a relative storage key in MySQL.
- Import files only from the dedicated `.candidate-inbox/` directory through an explicit Codex command. Reject paths outside that folder and allow only PDF, DOCX, RTF, TXT, and Markdown files up to 20 MB.
- Require a source-linked evidence excerpt for a supported fact and match that excerpt against the saved extracted text. Keep other candidate statements as unverified; do not include them in supported context.
- Store a conflicting fact version as pending while leaving the current version intact. Change the current version only after an explicit Codex command reflecting the user's decision.
- Rebuild the JSON knowledge map from current and pending fact versions. The map is a derived artifact and can be deleted and regenerated from MySQL.
- Back up the MySQL database and `data/` together. The dashboard may read candidate facts and download original sources, but it does not edit them or invoke AI.

## Rationale

Keeping binary documents outside MySQL avoids storing large document bytes in relational rows while preserving a direct local copy. A dedicated inbox limits which paths an MCP tool can import. The database remains the source of truth for provenance and versions, while the generated map can be rebuilt without model inference. This makes combined database-and-file backups necessary.
