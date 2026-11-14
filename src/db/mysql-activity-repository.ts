import { desc } from "drizzle-orm";
import type { Activity, ActivityRepository } from "../domain/activity.js";
import type { createDatabase } from "./connection.js";
import { activityEvents } from "./schema.js";

type Database = ReturnType<typeof createDatabase>["db"];

export function createMysqlActivityRepository(db: Database): ActivityRepository {
  return {
    async insert(activity) {
      await db.insert(activityEvents).values(activity);
    },

    async listRecent(limit) {
      const rows = await db
        .select()
        .from(activityEvents)
        .orderBy(desc(activityEvents.createdAt))
        .limit(limit);

      return rows.map((row): Activity => ({
        id: row.id,
        command: row.command,
        summary: row.summary,
        source: row.source,
        createdAt: row.createdAt,
      }));
    },
  };
}
