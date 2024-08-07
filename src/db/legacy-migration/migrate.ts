import csv from "csv-parser";
import { type DiscordAPIError, REST, Routes } from "discord.js";
import fs from "fs";
import { get } from "lodash-es";
import moment from "moment-timezone";

import { CLIENT } from "../../client/client.ts";
import { Color, DisplayUpdateType, MemberDisplayType, ScheduleCommand, Scope, TimestampType } from "../../types/db.types.ts";
import { ClientUtils } from "../../utils/client.utils.ts";
import { formatFileDate } from "../../utils/misc.utils.ts";
import { db, DB_FILEPATH } from "../db.ts";
import { QUEUE_TABLE } from "../schema.ts";
import { Store } from "../store.ts";
import type {
	AdminPermission,
	BlackWhiteList,
	DisplayChannels,
	LastPulled,
	Priority,
	QueueChannels,
	QueueGuilds,
	QueueMembers,
	Schedules,
} from "./migrate.types.ts";

export const LEGACY_EXPORT_DIR = "data/migrations/legacy-export";

const legacyAdminPermission: AdminPermission[] = [];
const legacyBlackWhiteList: BlackWhiteList[] = [];
const legacyDisplayChannels: DisplayChannels[] = [];
const legacyLastPulled: LastPulled[] = [];
const legacyPriority: Priority[] = [];
const legacyQueueChannels: QueueChannels[] = [];
const legacyQueueGuilds: QueueGuilds[] = [];
const legacyQueueMembers: QueueMembers[] = [];
const legacySchedules: Schedules[] = [];

export async function checkForMigration() {
	const skipMigrationFlag = process.env.ENABLE_LEGACY_MIGRATION;
	if (skipMigrationFlag?.toLowerCase() === "true") {
		let migrationFiles;
		try {
			migrationFiles = fs.readdirSync(LEGACY_EXPORT_DIR).filter(file => file.endsWith(".csv"));
		}
		catch (e) {
			console.error("Error reading legacy migration directory:", e);
			return;
		}
		if (migrationFiles?.length) {
			console.log();
			console.log("Legacy migration found. Proceeding...");
			console.log();

			// Backup current database
			const backupPath = `data/main-pre-migration-${formatFileDate(new Date)}.sqlite`;
			fs.copyFileSync(DB_FILEPATH, backupPath);

			// Load old data
			await loadExportData();

			// Force fetch of all guilds
			await CLIENT.guilds.fetch();

			await removeOldGuildSpecificCommands();
			await convertAndInsert();
			await markComplete();
		}
	}
}

export async function removeOldGuildSpecificCommands() {
	console.log("Removing old guild commands:");
	const rest = new REST().setToken(process.env.TOKEN);
	for (let i = 0; i < legacyQueueGuilds.length; i++) {
		try {
			// rate limit
			if (i % 5 === 4) {
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
			// log progress
			if (i % 25 === 24 || i === legacyQueueGuilds.length - 1) {
				console.log(`Removing old guild commands ${i + 1} of ${legacyQueueGuilds.length}`);
			}

			const legacyGuild = legacyQueueGuilds[i];
			await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, legacyGuild.guild_id), { body: [] });
		}
		catch (e) {
			const { status } = e as DiscordAPIError;
			if (status !== 403) {
				console.error(e);
			}
		}
	}
}

export async function loadExportData() {
	const files = fs.readdirSync(LEGACY_EXPORT_DIR).filter(file => file.endsWith(".csv"));
	await Promise.all(files.map(file => new Promise<void>((resolve, reject) => {
		const data: any[] = [];
		fs.createReadStream(`${LEGACY_EXPORT_DIR}/${file}`)
		// @ts-ignore
			.pipe(csv())
			.on("data", (row) => {
				data.push(row);
			})
			.on("end", () => {
				switch (file) {
					case "admin_permission.csv":
						legacyAdminPermission.push(...data);
						break;
					case "black_white_list.csv":
						legacyBlackWhiteList.push(...data);
						break;
					case "display_channels.csv":
						legacyDisplayChannels.push(...data);
						break;
					case "last_pulled.csv":
						legacyLastPulled.push(...data);
						break;
					case "priority.csv":
						legacyPriority.push(...data);
						break;
					case "queue_channels.csv":
						legacyQueueChannels.push(...data);
						break;
					case "queue_guilds.csv":
						legacyQueueGuilds.push(...data);
						break;
					case "queue_members.csv":
						legacyQueueMembers.push(...data);
						break;
					case "schedules.csv":
						legacySchedules.push(...data);
						break;
				}
				resolve();
			})
			.on("error", reject);
	}))
	);

	console.log("To be migrated:");
	console.log("adminPermission length", legacyAdminPermission.length);
	console.log("blackWhiteList length", legacyBlackWhiteList.length);
	console.log("displayChannels length", legacyDisplayChannels.length);
	console.log("lastPulled length", legacyLastPulled.length);
	console.log("priority length", legacyPriority.length);
	console.log("queueChannels length", legacyQueueChannels.length);
	console.log("queueGuilds length", legacyQueueGuilds.length);
	console.log("queueMembers length", legacyQueueMembers.length);
	console.log("schedules length", legacySchedules.length);
	console.log();
}

function getTimeZonesForOffset(offset: number) {
	return moment.tz
		.names()
		.find((zoneName: string) => {
			const tzOffset = moment.tz(zoneName).utcOffset();
			return tzOffset === offset * 60;
		});
}

async function convertAndInsert() {
	console.log("Converting and inserting data:");
	await db.transaction(async () => {
		for (let i = 0; i < legacyQueueGuilds.length; i++) {
			try {
				// rate limit
				if (i % 5 === 4) {
					await new Promise(resolve => setTimeout(resolve, 1000));
				}
				// log progress
				if (i % 25 === 24 || i === legacyQueueGuilds.length - 1) {
					console.log(`Converting guild ${i + 1} of ${legacyQueueGuilds.length}`);
				}

				const legacyGuild = legacyQueueGuilds[i];
				const jsGuild = await ClientUtils.getGuild(legacyGuild.guild_id);
				if (!jsGuild) continue;
				const store = new Store(jsGuild);

				store.insertGuild({
					guildId: legacyGuild.guild_id,
					logChannelId: legacyGuild.logging_channel_id,
					logScope: legacyGuild.logging_channel_level ? Scope.All : undefined,
				});

				for (const legacyQueue of legacyQueueChannels.filter(legacy => legacy.guild_id == legacyGuild.guild_id)) {
					try {
						const jsSourceChannel = await jsGuild.channels.fetch(legacyQueue.queue_channel_id);
						if (!jsSourceChannel) continue;

						let queue;
						for (let i = 0; i < 5; i++) {
							const name = i === 0 ? jsSourceChannel.name : `${jsSourceChannel.name} (${i})`;
							try {
								queue = store.insertQueue({
									name: name,
									guildId: legacyGuild.guild_id,
									autopullToggle: legacyQueue.auto_fill,
									color: get(Color, legacyQueue.color) ?? QUEUE_TABLE.color.default,
									buttonsToggle: legacyQueue.hide_button ? Scope.None : Scope.All,
									displayUpdateType: (legacyGuild.msg_mode === 3) ? DisplayUpdateType.New : (legacyGuild.msg_mode === 2) ? DisplayUpdateType.Replace : DisplayUpdateType.Edit,
									header: legacyQueue.header,
									lockToggle: legacyQueue.is_locked,
									memberDisplayType: legacyGuild.disable_mentions ? MemberDisplayType.DisplayName : MemberDisplayType.Mention,
									dmOnPullToggle: !legacyGuild.disable_notifications,
									pullBatchSize: BigInt(legacyQueue.pull_num),
									rejoinGracePeriod: BigInt(legacyQueue.grace_period),
									roleInQueueId: legacyQueue.role_id,
									size: BigInt(legacyQueue.max_members),
									timestampType:
										legacyGuild.timestamps === "date" ? TimestampType.Date :
											legacyGuild.timestamps === "time" ? TimestampType.Time :
												legacyGuild.timestamps === "date+time" ? TimestampType.DateAndTime :
													legacyGuild.timestamps === "relative" ? TimestampType.Relative
														: TimestampType.Off,
									voiceDestinationChannelId: legacyQueue.target_channel_id,
								});
								break;
							}
							catch (e) {
								console.error(e);
							}
						}

						if ("isVoiceBased" in jsSourceChannel && jsSourceChannel.isVoiceBased()) {
							try {
								store.insertVoice({
									guildId: legacyGuild.guild_id,
									queueId: queue.id,
									sourceChannelId: legacyQueue.queue_channel_id,
								});
							}
							catch (e) {
								console.error(e);
							}
						}

						for (const legacyDisplay of legacyDisplayChannels.filter(legacy => legacy.queue_channel_id == legacyQueue.queue_channel_id)) {
							try {
								store.insertDisplay({
									guildId: legacyGuild.guild_id,
									queueId: queue.id,
									displayChannelId: legacyDisplay.display_channel_id,
									lastMessageId: legacyDisplay.message_id,
								});
							}
							catch (e) {
								console.error(e);
							}
						}

						for (const legacyMember of legacyQueueMembers.filter(legacy => legacy.channel_id == legacyQueue.queue_channel_id)) {
							try {
								store.insertMember({
									guildId: legacyGuild.guild_id,
									queueId: queue.id,
									userId: legacyMember.member_id,
									message: legacyMember.personal_message,
									joinTime: BigInt(new Date(legacyMember.display_time).getTime()),
									positionTime: BigInt(new Date(legacyMember.created_at).getTime()),
									priorityOrder: legacyMember.is_priority ? 5n : undefined,
								});
							}
							catch (e) {
								console.error(e);
							}
						}

						for (const legacySchedule of legacySchedules.filter(legacy => legacy.queue_channel_id == legacyQueue.queue_channel_id)) {
							try {
								store.insertSchedule({
									guildId: legacyGuild.guild_id,
									queueId: queue.id,
									command: legacySchedule.command as ScheduleCommand,
									cron: legacySchedule.schedule,
									timezone: getTimeZonesForOffset(legacySchedule.utc_offset),
									messageChannelId: legacyQueue.queue_channel_id,
								});
							}
							catch (e) {
								console.error(e);
							}
						}

						for (const legacyBlack of legacyBlackWhiteList.filter(legacy => legacy.queue_channel_id == legacyQueue.queue_channel_id && legacy.type === 0)) {
							try {
								store.insertBlacklisted({
									guildId: legacyGuild.guild_id,
									queueId: queue.id,
									subjectId: legacyBlack.role_member_id,
									isRole: legacyBlack.is_role,
								});
							}
							catch (e) {
								console.error(e);
							}
						}

						for (const legacyWhite of legacyBlackWhiteList.filter(legacy => legacy.queue_channel_id == legacyQueue.queue_channel_id && legacy.type === 1)) {
							try {
								store.insertWhitelisted({
									guildId: legacyGuild.guild_id,
									queueId: queue.id,
									subjectId: legacyWhite.role_member_id,
									isRole: legacyWhite.is_role,
								});
							}
							catch (e) {
								console.error(e);
							}
						}

						for (const legacyPrio of legacyPriority.filter(legacy => legacy.guild_id == legacyGuild.guild_id)) {
							try {
								store.insertPrioritized({
									guildId: legacyGuild.guild_id,
									queueId: queue.id,
									subjectId: legacyPrio.role_member_id,
									isRole: legacyPrio.is_role,
									priorityOrder: 5n,
								});
							}
							catch (e) {
								console.error(e);
							}
						}

						for (const legacyAdmin of legacyAdminPermission.filter(legacy => legacy.guild_id == legacyGuild.guild_id)) {
							try {
								store.insertAdmin({
									guildId: legacyGuild.guild_id,
									subjectId: legacyAdmin.role_member_id,
									isRole: legacyAdmin.is_role,
								});
							}
							catch (e) {
								console.error(e);
							}
						}
					}
					catch (e) {
						console.error(e);
					}
				}
			}
			catch (e) {
				console.error(e);
			}
		}
	});
	console.log();
	console.log("Conversion and insertion complete.");
	console.log();
}

export async function markComplete() {
	const completedDir = `${LEGACY_EXPORT_DIR}/completed-${formatFileDate(new Date)}`;
	fs.mkdirSync(completedDir);
	fs.readdir(LEGACY_EXPORT_DIR, (err, files) => {
		if (err) {
			console.error("Error reading directory:", err);
			return;
		}

		// Filter for CSV files
		const csvFiles = files.filter(file => file.toLowerCase().endsWith(".csv"));

		// Move each CSV file to destination directory
		csvFiles.forEach(file => {
			const sourceFile = `${LEGACY_EXPORT_DIR}/${file}`;
			const destFile = `${completedDir}/${file}`;

			// Rename (move) file
			fs.rename(sourceFile, destFile, err => {
				if (err) {
					console.error(`Error moving ${file}:`, err);
				}
				else {
					console.log(`Moved ${file} to ${LEGACY_EXPORT_DIR}`);
				}
			});
		});
	});
}