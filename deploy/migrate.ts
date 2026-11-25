import { readConfig } from "../src/server/config";
import { loadMigrations, runMigrations } from "../src/server/db/migrate";
import { createDatabasePool } from "../src/server/db/pool";

async function migrate() {
  const args = process.argv.slice(2);
  const windows = args.length === 1 && args[0] === "--windows";
  if (args.length !== 0 && !windows) throw new Error("Use migrate.ts [--windows].");

  const config = readConfig();
  if (config.NODE_ENV !== "production" || !config.DATABASE_URL) {
    throw new Error("The production web environment is required.");
  }
  const target = new URL(config.DATABASE_URL);
  const host = windows ? "127.0.0.1" : "db";
  const port = windows ? "55434" : "5432";
  if (target.hostname !== host || target.port !== port ||
      target.username !== "shiyoushu_app" || target.pathname !== "/shiyoushu_web") {
    throw new Error("The dedicated web database is required.");
  }

  const pool = createDatabasePool(config.DATABASE_URL);
  try {
    const { rows: [database] } = await pool.query(
      "SELECT current_database() AS name, current_user AS role, current_setting('server_version_num')::int AS version",
    );
    if (database.name !== "shiyoushu_web" || database.role !== "shiyoushu_app" ||
        database.version < 180000 || database.version >= 190000) {
      throw new Error("Unexpected database name, role or PostgreSQL major version.");
    }
    const { applied } = await runMigrations(pool, await loadMigrations());
    console.log("Web database ready. Applied migrations:", applied);
  } finally {
    await pool.end();
  }
}

migrate().catch((error: { code?: string }) => {
  console.error("Web database migration failed.", error.code ?? "Check the deployment configuration.");
  process.exitCode = 1;
});
