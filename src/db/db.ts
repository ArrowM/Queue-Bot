import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema.ts";

export const DB_FILEPATH = "data/main.sqlite";
export const DB_BACKUP_DIRECTORY = "data/backups";
export let db = drizzle(Database(DB_FILEPATH).defaultSafeIntegers(), { schema });

export namespace Db {
	export function reload() {
		db = drizzle(Database(DB_FILEPATH).defaultSafeIntegers(), { schema });
	}

	export function printLoadMessage() {
		console.log(`Loaded ${Object.keys(db._.schema).length} tables from database: ${DB_FILEPATH}`);
	}
}