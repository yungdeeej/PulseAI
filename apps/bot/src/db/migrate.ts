import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";
import { logger } from "../utils/logger.js";

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDir = path.resolve(here, "../../../../packages/db/migrations");
  const files = (await fs.readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  logger.info({ migrationsDir, files }, "applying migrations");

  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    logger.info({ file }, "running migration");
    await pool.query(sql);
  }

  logger.info("migrations complete");
  await pool.end();
}

main().catch((err) => {
  logger.error({ err }, "migration failed");
  process.exit(1);
});
