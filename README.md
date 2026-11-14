# Job Search Assistant

A single-user job-search workspace. AI interaction remains in Codex chat. The application server stores workflow data and exposes authenticated MCP tools; it does not contain a model client, in-app AI, or a background AI worker.

## Ticket #2: workflow foundation

The initial slice records a short receipt after an explicit Codex chat command, returns its durable activity ID, and displays the saved receipt in the dashboard. The receipt is not the search, candidate analysis, email drafting, or email-sending result. Those workflows are delivered in later tickets. Keep summaries brief and omit CV text or sensitive personal details.

The dashboard currently has a read-only recent-activity view and a refresh control. It does not edit candidate or application history. Later feedback, approved-send, and recruiter-reply controls must store data through the application workflow and must never invoke AI.

## Ticket #3: candidate knowledge bank

Candidate source files are imported only after an explicit Codex request. Put a file in `.candidate-inbox`, ask Codex to analyze or update the candidate bank, and Codex will read it, preserve a copy under `data/candidate-sources`, and store its source metadata and extracted text in MySQL. The import tool accepts only files inside that inbox and supports PDF, DOCX, RTF, TXT, and Markdown up to 20 MB. Written experience updates are saved as source notes.

Facts include a stable key, structured relationship, statement, source version, and evidence excerpt. A supported excerpt must match the saved extracted text. Facts without direct matching evidence remain marked unverified and are excluded from supported candidate context. A differing value for an existing fact key is stored as a pending conflict; the current fact changes only after the user accepts or rejects a proposed version in Codex chat.

The knowledge map is deterministic JSON under `data/derived/candidate-knowledge-map.json`, rebuilt from current and pending fact versions. It contains no AI-generated edges. Back up the ignored `data/` directory together with the MySQL database. The existing CV in the repository root has not been imported or analyzed automatically.

## Stack

- Node.js 26 + TypeScript
- Fastify application server and official MCP TypeScript SDK over Streamable HTTP
- Svelte 5 + TypeScript + Vite dashboard
- Drizzle ORM + mysql2
- The MySQL instance already available in the user's environment

The server binds to loopback (`127.0.0.1`) only and checks a bearer token on `/mcp`. The MCP Fastify helper also validates localhost host/origin values to reduce DNS-rebinding risk. Do not expose this HTTP endpoint publicly; remote access would require a separately reviewed HTTPS deployment.

## Local setup

1. Install Node.js 26 and create a `job_search` database and app user on the MySQL instance already available in the environment. The current Laragon instance is MySQL 5.7.24; this app uses MySQL 5.7-compatible UTF-8 collation and does not alter the server installation.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env`, set `DATABASE_URL` to the `job_search` database on the existing MySQL instance, and set `MCP_BEARER_TOKEN` to a random secret with at least 32 characters. Generate a secret with:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

4. Set the same secret in the environment used to launch Codex, under `JOB_APP_MCP_TOKEN`. On Windows, add it to the current user's environment variables and restart Codex. The project-local `.codex/config.toml` reads that variable and connects to `http://127.0.0.1:3000/mcp`.
5. Apply pending checked-in SQL migrations to the app database:

   ```powershell
   npm run db:migrate
   ```

6. Start the dashboard and server with `npm run dev`. Open `http://127.0.0.1:5173`. The backend listens on `127.0.0.1:3000`.

When asked to analyze a document, make it available in `.candidate-inbox` first. The current repository CV remains untouched until you explicitly request its analysis and import.

The `.env` file is ignored by Git. Never commit database credentials or the MCP token. The app does not install or start a MySQL service.

## Workflow seam

`src/workflow/assistant-workflow.ts` owns activity operations. `src/workflow/candidate-bank-workflow.ts` owns candidate source, fact version, conflict, context, and graph operations. MCP tools and dashboard read routes receive these workflow modules. MySQL persistence uses Drizzle/mysql2; original files and the derived map use the ignored `data/` directory. The checked-in SQL migrations are tracked in `schema_migrations`. Keep route handlers and MCP tools thin; keep all model reasoning in Codex chat.

MCP tools in this slice:

- `record_command`: store a short receipt for an explicit Codex command and return its stable activity ID.
- `list_recent_activities`: read recent receipts.
- `store_candidate_file` and `store_candidate_experience_update`: persist original sources after an explicit request.
- `record_candidate_fact`: record source-linked facts with evidence and version history.
- `resolve_candidate_fact_conflict`: apply an explicit user decision to a pending fact version.
- `get_candidate_context`, `list_candidate_fact_history`, `list_candidate_sources`, and `read_candidate_source`: read candidate facts, provenance, versions, and source text.
- `rebuild_candidate_knowledge_map`: rebuild the deterministic derived map without AI.

Dashboard route in this slice:

- `GET /api/activities?limit=25`: read recent activity records, with a maximum of 100.
- `GET /api/candidate-bank`: read candidate facts and source/version history.
- `GET /api/candidate-sources/:sourceId/file`: download an original candidate source.
