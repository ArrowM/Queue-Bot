import Database from "better-sqlite3";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema.ts";

export const DB_FILEPATH = "data/main.sqlite";
export const DB_BACKUP_DIRECTORY = "db/backups";
export let db: BetterSQLite3Database<typeof schema>;

export namespace Db {
	export function load() {
		db = drizzle(Database(DB_FILEPATH).defaultSafeIntegers(), { schema });
		console.log(`Loaded ${Object.keys(db._.schema).length} tables from database: ${DB_FILEPATH}`);
	}
}