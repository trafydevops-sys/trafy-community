import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client.js";

// Root .env — this package lives two levels under the monorepo root.
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set — copy .env.example to .env first.");
  }
  const db = createDb(databaseUrl);
  const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));
  await migrate(db, { migrationsFolder });
  console.log("Migrations applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
