// ====================================================================
//                           Db Guild Updates
// ====================================================================

import fs from "node:fs";

import { subDays, subMonths } from "date-fns";
import type { Snowflake } from "discord.js";
import { count, eq, lt, sql } from "drizzle-orm";
import { get } from "lodash-es";
import { schedule as cron } from "node-cron";

import type { GuildStat } from "../types/db.types.ts";
import type { PendingGuildUpdates } from "../types/misc.types.ts";
import { ClientUtils } from "../utils/client.utils.ts";
import { db, DB_BACKUP_DIRECTORY, DB_FILEPATH } from "./db.ts";
import {
	ADMIN_TABLE,
	ARCHIVED_MEMBER_TABLE,
	BLACKLISTED_TABLE,
	DISPLAY_TABLE,
	GUILD_TABLE,
	MEMBER_TABLE,
	PRIORITIZED_TABLE,
	QUEUE_TABLE,
	SCHEDULE_TABLE,
	VOICE_TABLE,
	WHITELISTED_TABLE,
} from "./schema.ts";

let pendingGuildUpdates: PendingGuildUpdates = {};

// Increment a stat for a guild
export function incrementGuildStat(guildId: Snowflake, stat: GuildStat, by = 1) {
	if (!pendingGuildUpdates[guildId]) {
		pendingGuildUpdates[guildId] = {};
	}
	if (!pendingGuildUpdates[guildId][stat]) {
		pendingGuildUpdates[guildId][stat] = 0;
	}
	pendingGuildUpdates[guildId][stat]! += by;
}

export async function flushPendingGuildUpdatesToDB() {
	// Start a transaction
	db.transaction(() => {
		for (const guildId in pendingGuildUpdates) {
			try {
				const updates = pendingGuildUpdates[guildId];
				for (const stat in updates) {
					const column = get(GUILD_TABLE, stat);
					const value = updates[stat as GuildStat] as number;
					const columnName = column.name;
					db.run(
						sql`UPDATE guild
                SET ${sql.raw(columnName)} = ${sql.raw(columnName)} + ${value}
                WHERE ${sql.raw(GUILD_TABLE.guildId.name)} = ${guildId};`,
					);
				}
				db.update(GUILD_TABLE)
					.set({ lastUpdateTime: BigInt(new Date().getTime()) })
					.where(
						eq(GUILD_TABLE.guildId, guildId),
					)
					.run();
			}
			catch (e) {
				const { message, stack } = e as Error;
				console.error("Failed to flush guild updates to db:");
				console.error(`Error: ${message}`);
				console.error(`Stack Trace: ${stack}`);
			}
		}
	});
	pendingGuildUpdates = {};
}

// Write pending guild updates to the database every 5 minutes
cron("*/5 * * * *", async () => {
	try {
		await flushPendingGuildUpdatesToDB();
	}
	catch (e) {
		const { message, stack } = e as Error;
		console.error("Failed to write pending guild updates to the database:");
		console.error(`Error: ${message}`);
		console.error(`Stack Trace: ${stack}`);
	}
});

// ====================================================================
//                    Database Cleanup and Backup
// ====================================================================

// Backup database every 2 hours
cron("0 */2 * * *", async () => {
	try {
		backupPrep();
		deleteOldBackups();
		deleteOldArchivedMembers();
		await deleteDeadGuilds();
		logStats();
		backup();
	}
	catch (e) {
		const { message, stack } = e as Error;
		console.error("Database backup failed:");
		console.error(`Error: ${message}`);
		console.error(`Stack Trace: ${stack}`);
	}
});

function backupPrep() {
	if (!fs.existsSync(DB_BACKUP_DIRECTORY)) {
		fs.mkdirSync(DB_BACKUP_DIRECTORY);
	}
}

// Delete backups older than 4 days
function deleteOldBackups() {
	fs.readdirSync(DB_BACKUP_DIRECTORY).forEach(file => {
		const filePath = `${DB_BACKUP_DIRECTORY}/${file}`;
		const stats = fs.statSync(filePath);
		if (stats.isFile() && stats.mtime < subDays(new Date(), 4)) {
			fs.unlinkSync(filePath);
			console.log(`Deleted old backup: ${filePath}`);
		}
	});
}

// Delete the entries from the ARCHIVED_MEMBER table that are older than one month
function deleteOldArchivedMembers() {
	const oneMonthAgo = BigInt(subMonths(new Date(), 1).getTime());
	db.delete(ARCHIVED_MEMBER_TABLE)
		.where(
			lt(ARCHIVED_MEMBER_TABLE.archivedTime, oneMonthAgo),
		)
		.run();
}

async function deleteDeadGuilds() {
	const oneMonthAgo = BigInt(subMonths(new Date(), 1).getTime());
	// Start a transaction
	await db.transaction(async () => {
		const oldGuilds = db.select()
			.from(GUILD_TABLE)
			.where(
				lt(GUILD_TABLE.lastUpdateTime, oneMonthAgo),
			)
			.all();
		for (const guild of oldGuilds) {
			const jsGuild = await ClientUtils.getGuild(guild.guildId);
			if (jsGuild == null) {
				db.delete(GUILD_TABLE)
					.where(
						eq(GUILD_TABLE.guildId, guild.guildId),
					)
					.run();
				console.log(`Deleted dead guild: ${guild.guildId}`);
			}
		}
	});
}

function logStats() {
	console.log("Guilds: ", db.select({ count: count() }).from(GUILD_TABLE).get().count);
	console.log("Queues: ", db.select({ count: count() }).from(QUEUE_TABLE).get().count);
	console.log("Voices: ", db.select({ count: count() }).from(VOICE_TABLE).get().count);
	console.log("Members: ", db.select({ count: count() }).from(MEMBER_TABLE).get().count);
	console.log("Displays: ", db.select({ count: count() }).from(DISPLAY_TABLE).get().count);
	console.log("Schedules: ", db.select({ count: count() }).from(SCHEDULE_TABLE).get().count);
	console.log("Blacklisted: ", db.select({ count: count() }).from(BLACKLISTED_TABLE).get().count);
	console.log("Whitelisted: ", db.select({ count: count() }).from(WHITELISTED_TABLE).get().count);
	console.log("Prioritized ", db.select({ count: count() }).from(PRIORITIZED_TABLE).get().count);
	console.log("Admins: ", db.select({ count: count() }).from(ADMIN_TABLE).get().count);
	console.log("Archived Members: ", db.select({ count: count() }).from(ARCHIVED_MEMBER_TABLE).get().count);
}

// Create a backup of the SQLite database file
function backup() {
	console.log("Creating backup...");

	// Get backup filepath
	const dateStr = new Date().toLocaleString("en-US", { hour12: false }).replace(/\D/g, "_");
	const backupFilepath = `${DB_BACKUP_DIRECTORY}/main_${dateStr}.sqlite`;

	// Copy the SQLite database file to the backup location
	fs.copyFile(DB_FILEPATH, backupFilepath, (err) => {
		if (err) {
			console.error("Failed to create backup:", err);
		}
		else {
			console.log(`Backup created successfully: ${backupFilepath}`);
		}
	});
}