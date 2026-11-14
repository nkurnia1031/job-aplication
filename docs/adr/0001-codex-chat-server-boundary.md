---
status: accepted
---

# Codex chat and application-server boundary

Codex chat is the only place the user interacts with AI. The ChatGPT/Codex model remains outside the job-search application and acts only after an explicit chat command. It reads source files and accesses persistent application data through authenticated server tools or APIs. An MCP server, if used, is only a tool adapter; it does not host a model or provide an embedded AI UI. The application server stores files, facts, drafts, and timelines, and runs ordinary application workflows; it has no model client or background AI worker.

The dashboard shows persisted information and permits only the agreed feedback, approved-send, and recruiter-reply actions. Those controls call application endpoints and never invoke AI. Feedback and replies are stored; Codex reads them and performs draft revision or reply analysis only after the user asks in chat. The send action transmits the reviewed, approved draft without calling AI.

The selected stack is Node.js 26 LTS + TypeScript, Fastify, the official MCP TypeScript SDK as a Codex tool adapter, Svelte 5 + TypeScript + Vite, and Drizzle/mysql2 on the MySQL instance already available in the user's environment. Node.js and TypeScript give the MCP adapter, HTTP routes, and workflow modules one language and runtime. Fastify hosts both the MCP adapter and dashboard data routes; the official MCP SDK handles protocol transport while the application owns workflow rules. Svelte is the selected dashboard framework, and Vite handles local development and frontend builds. Drizzle/mysql2 provides typed MySQL access without placing business rules in route handlers. Keep original candidate files and source provenance; treat the knowledge map as derived and rebuildable. Keep the database migration compatible with the current Laragon MySQL 5.7.24 server; do not install or upgrade MySQL as part of this ticket.

The first workflow slice stores a short receipt of an explicit Codex command and returns its durable activity ID. Candidate sources, fact versions, and conflict decisions are handled by the candidate-bank workflow. MCP tools and dashboard read routes call application workflows; the dashboard displays persisted activities and candidate facts read-only. Specific feedback, send, and recruiter-reply actions belong to their later workflow tickets and must call application workflows without invoking AI. Bind the local server to loopback, require a bearer token for MCP, and retain localhost host/origin validation to prevent accidental network exposure and DNS rebinding.

References: [Codex MCP configuration](https://developers.openai.com/learn/docs-mcp), [MCP servers as external tools](https://developers.openai.com/plugins/concepts/mcp-server), [official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), [Svelte overview](https://svelte.dev/docs/svelte/overview).
