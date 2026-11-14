export const CHAT_COMMANDS = [
  "candidate_update",
  "job_search",
  "draft_emails",
  "analyze_recruiter_reply",
  "other",
] as const;

export type ChatCommand = (typeof CHAT_COMMANDS)[number];
export type ActivitySource = "codex" | "dashboard";

export interface Activity {
  id: string;
  command: ChatCommand;
  summary: string;
  source: ActivitySource;
  createdAt: Date;
}

export interface RecordCommandInput {
  command: ChatCommand;
  summary: string;
}

export interface ActivityRepository {
  insert(activity: Activity): Promise<void>;
  listRecent(limit: number): Promise<Activity[]>;
}
