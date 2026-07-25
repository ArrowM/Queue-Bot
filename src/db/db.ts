import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";

import * as schema from "./schema.ts";

export const DB_FILEPATH = "data/main.sqlite";
export const DB_BACKUP_DIRECTORY = "data/backups";

function initDatabase() {
	if (!fs.existsSync("data")) {
		fs.mkdirSync("data", { recursive: true });
	}
	const sqlite = new Database(DB_FILEPATH);
	sqlite.pragma("foreign_keys = ON");
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS guild (
			guild_id TEXT PRIMARY KEY,
			log_channel_id TEXT,
			log_scope TEXT,
			joinTime INTEGER NOT NULL,
			last_updated_time INTEGER NOT NULL,
			messages_received INTEGER NOT NULL DEFAULT 0,
			commands_received INTEGER NOT NULL DEFAULT 0,
			buttons_received INTEGER NOT NULL DEFAULT 0,
			queues_added INTEGER NOT NULL DEFAULT 0,
			voices_added INTEGER NOT NULL DEFAULT 0,
			displays_added INTEGER NOT NULL DEFAULT 0,
			members_added INTEGER NOT NULL DEFAULT 0,
			schedules_added INTEGER NOT NULL DEFAULT 0,
			whitelisted_added INTEGER NOT NULL DEFAULT 0,
			blacklisted_added INTEGER NOT NULL DEFAULT 0,
			prioritized_added INTEGER NOT NULL DEFAULT 0,
			admins_added INTEGER NOT NULL DEFAULT 0,
			archived_members_added INTEGER NOT NULL DEFAULT 0
		);

		CREATE TABLE IF NOT EXISTS queue (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			guild_id TEXT NOT NULL REFERENCES guild(guild_id) ON DELETE CASCADE,
			autopull_toggle INTEGER NOT NULL DEFAULT 0,
			badge_toggle INTEGER NOT NULL DEFAULT 1,
			color TEXT NOT NULL DEFAULT '#d2075c',
			display_update_type TEXT NOT NULL DEFAULT 'edit',
			dm_on_pull_toggle INTEGER NOT NULL DEFAULT 1,
			buttons_toggles TEXT NOT NULL DEFAULT 'all',
			header TEXT,
			inline_toggle INTEGER NOT NULL DEFAULT 0,
			lock_toggle INTEGER NOT NULL DEFAULT 0,
			member_display_type TEXT NOT NULL DEFAULT 'mention',
			pull_batch_size INTEGER NOT NULL DEFAULT 1,
			pull_message TEXT,
			pull_message_display_type TEXT NOT NULL DEFAULT 'private',
			rejoin_cooldown_period INTEGER NOT NULL DEFAULT 0,
			rejoin_grace_period INTEGER NOT NULL DEFAULT 0,
			require_message_to_join INTEGER DEFAULT 0,
			role_in_queue_id TEXT,
			role_on_pull_id TEXT,
			size INTEGER,
			time_display_type TEXT DEFAULT 'off',
			voice_destination_channel_id TEXT,
			voice_only_toggle INTEGER NOT NULL DEFAULT 0,
			game_presence_toggle INTEGER NOT NULL DEFAULT 0,
			game_presence_name TEXT,
			member_timeout INTEGER NOT NULL DEFAULT 0,
			UNIQUE(name, guild_id)
		);

		CREATE TABLE IF NOT EXISTS voice (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			guild_id TEXT NOT NULL REFERENCES guild(guild_id) ON DELETE CASCADE,
			queue_id INTEGER NOT NULL REFERENCES queue(id) ON DELETE CASCADE,
			source_channel_id TEXT NOT NULL,
			join_sync_toggle INTEGER NOT NULL DEFAULT 1,
			leave_sync_toggle INTEGER NOT NULL DEFAULT 1,
			UNIQUE(queue_id, source_channel_id)
		);

		CREATE TABLE IF NOT EXISTS display (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			guild_id TEXT NOT NULL REFERENCES guild(guild_id) ON DELETE CASCADE,
			queue_id INTEGER NOT NULL REFERENCES queue(id) ON DELETE CASCADE,
			display_channel_id TEXT NOT NULL,
			last_message_id TEXT,
			UNIQUE(queue_id, display_channel_id)
		);

		CREATE TABLE IF NOT EXISTS member (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			guild_id TEXT NOT NULL REFERENCES guild(guild_id) ON DELETE CASCADE,
			queue_id INTEGER NOT NULL REFERENCES queue(id) ON DELETE CASCADE,
			user_id TEXT NOT NULL,
			message TEXT,
			position_time INTEGER NOT NULL,
			join_time INTEGER NOT NULL,
			priority_order INTEGER,
			UNIQUE(queue_id, user_id)
		);

		CREATE TABLE IF NOT EXISTS schedule (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			guild_id TEXT NOT NULL REFERENCES guild(guild_id) ON DELETE CASCADE,
			queue_id INTEGER NOT NULL REFERENCES queue(id) ON DELETE CASCADE,
			command TEXT NOT NULL,
			cron TEXT NOT NULL,
			timezone TEXT DEFAULT 'america/chicago',
			message_channel_id TEXT,
			reason TEXT,
			UNIQUE(queue_id, command, cron, timezone)
		);

		CREATE TABLE IF NOT EXISTS blacklisted (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			guild_id TEXT NOT NULL REFERENCES guild(guild_id) ON DELETE CASCADE,
			queue_id INTEGER NOT NULL REFERENCES queue(id) ON DELETE CASCADE,
			subject_id TEXT NOT NULL,
			is_role INTEGER NOT NULL,
			reason TEXT,
			UNIQUE(queue_id, subject_id)
		);

		CREATE TABLE IF NOT EXISTS whitelisted (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			guild_id TEXT NOT NULL REFERENCES guild(guild_id) ON DELETE CASCADE,
			queue_id INTEGER NOT NULL REFERENCES queue(id) ON DELETE CASCADE,
			subject_id TEXT NOT NULL,
			is_role INTEGER NOT NULL,
			reason TEXT,
			UNIQUE(queue_id, subject_id)
		);

		CREATE TABLE IF NOT EXISTS prioritized (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			guild_id TEXT NOT NULL REFERENCES guild(guild_id) ON DELETE CASCADE,
			queue_id INTEGER NOT NULL REFERENCES queue(id) ON DELETE CASCADE,
			subject_id TEXT NOT NULL,
			is_role INTEGER NOT NULL,
			priority_order INTEGER NOT NULL DEFAULT 5,
			reason TEXT,
			UNIQUE(queue_id, subject_id)
		);

		CREATE TABLE IF NOT EXISTS admin (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			guild_id TEXT NOT NULL REFERENCES guild(guild_id) ON DELETE CASCADE,
			subject_id TEXT NOT NULL,
			is_role INTEGER NOT NULL,
			UNIQUE(guild_id, subject_id)
		);

		CREATE TABLE IF NOT EXISTS archived_member (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			guild_id TEXT NOT NULL,
			queue_id INTEGER NOT NULL,
			user_id TEXT NOT NULL,
			message TEXT,
			position_time INTEGER NOT NULL,
			join_time INTEGER NOT NULL,
			archived_time INTEGER NOT NULL,
			reason TEXT NOT NULL,
			UNIQUE(queue_id, user_id)
		);

		CREATE TABLE IF NOT EXISTS patch_note (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			file_name TEXT NOT NULL
		);
	`);

	try { sqlite.prepare("ALTER TABLE queue ADD COLUMN game_presence_toggle INTEGER NOT NULL DEFAULT 0").run(); } catch {}
	try { sqlite.prepare("ALTER TABLE queue ADD COLUMN game_presence_name TEXT").run(); } catch {}
	try { sqlite.prepare("ALTER TABLE queue ADD COLUMN member_timeout INTEGER NOT NULL DEFAULT 0").run(); } catch {}

	return sqlite;
}

const sqliteInstance = initDatabase();
export let db = drizzle(sqliteInstance.defaultSafeIntegers(), { schema });

export namespace Db {
	export function reload() {
		const sqlite = initDatabase();
		db = drizzle(sqlite.defaultSafeIntegers(), { schema });
	}

	export function printLoadMessage() {
		console.log(`Loaded ${Object.keys(db._.schema).length} tables from database: ${DB_FILEPATH}`);
	}
}