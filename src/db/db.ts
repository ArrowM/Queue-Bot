import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema.ts";

export const DB_FILEPATH = "db/main.sqlite";
export const DB_BACKUP_DIRECTORY = "db/backups";
export const db = drizzle(Database(DB_FILEPATH).defaultSafeIntegers(), { schema });

export function load() {
	console.log(`Loaded ${Object.keys(db._.schema).length} tables from database: ${DB_FILEPATH}`);
}