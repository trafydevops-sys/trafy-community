import { getDb } from "@trafy-community/db";
import { env } from "./env.js";

export const db = getDb(env.DATABASE_URL);
