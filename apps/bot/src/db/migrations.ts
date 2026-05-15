// Programmatic helper to run migrations from within the bot (e.g. on Replit boot).
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";
import { logger } from "../utils/logger.js";

export async function applyMigrations(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDir = path.resolve(here, "../../../../packages/db/migrations");
  const files = (await fs.readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    logger.info({ file }, "applying migration");
    await pool.query(sql);
  }
}
