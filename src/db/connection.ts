import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "./schema.js";

export function createDatabase(databaseUrl: string) {
  const client = mysql.createPool(databaseUrl);
  const db = drizzle({ client, schema, mode: "default" });

  return {
    db,
    close: () => client.end(),
  };
}
