import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

let cached: ReturnType<typeof createDb> | undefined;

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 10 });
  return drizzle(client, { schema });
}

// Lazily create a single shared connection pool per process — avoids
// exhausting Postgres connections across hot-reloaded dev requests.
export function getDb(databaseUrl: string) {
  if (!cached) {
    cached = createDb(databaseUrl);
  }
  return cached;
}

export type Database = ReturnType<typeof createDb>;
export { schema };
