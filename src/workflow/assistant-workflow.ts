import { randomUUID } from "node:crypto";
import type {
  Activity,
  ActivityRepository,
  ChatCommand,
  RecordCommandInput,
} from "../domain/activity.js";

export interface AssistantWorkflow {
  recordCommand(input: RecordCommandInput): Promise<Activity>;
  listRecentActivities(limit?: number): Promise<Activity[]>;
}

export interface AssistantWorkflowOptions {
  repository: ActivityRepository;
  now?: () => Date;
  createId?: () => string;
}

const MAX_SUMMARY_LENGTH = 500;
const DEFAULT_ACTIVITY_LIMIT = 25;
const MAX_ACTIVITY_LIMIT = 100;
const allowedCommands = new Set<ChatCommand>([
  "candidate_update",
  "job_search",
  "draft_emails",
  "analyze_recruiter_reply",
  "other",
]);

export function createAssistantWorkflow({
  repository,
  now = () => new Date(),
  createId = randomUUID,
}: AssistantWorkflowOptions): AssistantWorkflow {
  return {
    async recordCommand(input) {
      if (!allowedCommands.has(input.command)) {
        throw new Error("Unsupported command type.");
      }

      const summary = input.summary.trim();
      if (summary.length === 0 || summary.length > MAX_SUMMARY_LENGTH) {
        throw new Error(`Summary must contain 1–${MAX_SUMMARY_LENGTH} characters.`);
      }

      const activity: Activity = {
        id: createId(),
        command: input.command,
        summary,
        source: "codex",
        createdAt: now(),
      };

      await repository.insert(activity);
      return activity;
    },

    async listRecentActivities(limit = DEFAULT_ACTIVITY_LIMIT) {
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ACTIVITY_LIMIT) {
        throw new Error(`Activity limit must be an integer between 1 and ${MAX_ACTIVITY_LIMIT}.`);
      }
      return repository.listRecent(limit);
    },
  };
}
