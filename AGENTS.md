## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues; use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context domain docs: root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.

## Interview pacing

For product or design interviews, ask one question at a time and wait up to five minutes for the user's answer before asking the next question. If no answer arrives within five minutes, continue with a clearly stated assumption and keep the decision open for correction.

## Codex workflow

The project MCP server is a data/workflow adapter only; it does not run a model. Use its candidate-bank tools only after the user explicitly asks in Codex chat to analyze a document or save an experience update. Import files only from `.candidate-inbox`; preserve the original and its source/version metadata. Mark a fact `supported` only when its evidence excerpt appears in the saved source text. Keep unsupported statements `unverified`, and never use them as application claims. If a fact conflicts with the current value, keep the current value until the user explicitly accepts or rejects the proposed version in Codex chat. After saving all facts in an explicit update, call `rebuild_candidate_knowledge_map` once. The map is deterministic and rebuildable; do not invent graph edges.

`record_command` records a short receipt and returns an activity ID; it does not itself search job sources, analyze documents, draft emails, or send email. Never imply a later workflow has run unless its implementation is available and has actually completed. The dashboard displays persisted activity and candidate facts read-only, with original-source downloads. Do not invoke AI because of a dashboard request. Dashboard feedback, approved sending, and recruiter-reply submission remain ordinary application actions that never call AI.
