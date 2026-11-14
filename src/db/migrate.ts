import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const migrationsDirectory = resolve(process.cwd(), "migrations");
const connection = await mysql.createConnection(databaseUrl);

try {
  const [versionRows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT VERSION() AS version",
  );
  process.stdout.write(`Connected to MySQL ${versionRows[0]?.version ?? "unknown version"}.\n`);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id varchar(64) NOT NULL PRIMARY KEY,
      applied_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file))
    .sort();

  for (const file of migrationFiles) {
    const migrationId = file.replace(/\.sql$/, "");
    const [existing] = await connection.execute<mysql.RowDataPacket[]>(
      "SELECT id FROM schema_migrations WHERE id = ? LIMIT 1",
      [migrationId],
    );
    if (existing.length > 0) continue;

    const sql = await readFile(resolve(migrationsDirectory, file), "utf8");
    const statements = sql
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) await connection.query(statement);

    await connection.execute("INSERT INTO schema_migrations (id) VALUES (?)", [migrationId]);
    process.stdout.write(`Applied migration ${migrationId}.\n`);
  }
} finally {
  await connection.end();
}
