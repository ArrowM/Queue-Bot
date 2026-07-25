import * as fs from "node:fs";

import {
	ActionRowBuilder,
	ActivityType,
	ApplicationCommand,
	ButtonBuilder,
	ButtonStyle,
	type Collection,
	type DiscordAPIError,
	type GuildResolvable,
	REST,
	Routes,
	type Snowflake,
	TextChannel,
} from "discord.js";
import { groupBy } from "lodash-es";
import { AutoPoster } from "topgg-autoposter";

import { CLIENT } from "../client/client.ts";
import { COMMANDS } from "../commands/commands.loader.ts";
import { Queries } from "../db/queries.ts";
import { Store } from "../db/store.ts";
import { ClientHandler } from "../handlers/client.handler.ts";
import { Color, DisplayUpdateType, MemberRemovalReason } from "../types/db.types.ts";
import { DisplayUtils } from "./display.utils.ts";
import { MemberUtils } from "./member.utils.ts";
import { isGameNameMatch } from "./misc.utils.ts";

export namespace ClientUtils {
	// indexed by `id`
	let LIVE_COMMANDS: Collection<Snowflake, ApplicationCommand<{ guild: GuildResolvable }>>;

	export async function registerCommands() {
		try {
			console.time(`Registered ${COMMANDS.size} commands with server`);
			const commandsPutRoute = Routes.applicationCommands(process.env.CLIENT_ID);
			const commandsJSON = COMMANDS.map(c => c.data.toJSON());
			await new REST()
				.setToken(process.env.TOKEN)
				.put(commandsPutRoute, { body: commandsJSON });

			LIVE_COMMANDS = await CLIENT.application.commands.fetch();
			console.timeEnd(`Registered ${COMMANDS.size} commands with server`);
		}
		catch (e) {
			console.error(e);
		}
	}

	export function getLiveCommand(commandName: string) {
		return LIVE_COMMANDS?.find(cmd => cmd.name === commandName);
	}

	export async function getGuild(guildId: string) {
		try {
			return await CLIENT.guilds.fetch(guildId);
		}
		catch (e) {
			const { status } = e as DiscordAPIError;
			if (status == 404) {
				Queries.deleteGuild({ guildId });
			}
			else {
				console.error(e);
			}
		}
	}

	export async function login() {
		console.time("Logged in");
		await CLIENT.login(process.env.TOKEN);
		CLIENT.user.setActivity({ name: "ready to /help", type: ActivityType.Custom });
		console.timeEnd("Logged in");
	}

	export function verifyRequiredEnvironmentVariables() {
		// Required exist
		[
			"TOKEN",
			"CLIENT_ID",
			"DEFAULT_COLOR",
		].forEach(name => {
			if (process.env[name] == null) {
				throw new Error(`Required environment variable ${name} not set. Please edit .env file`);
			}
		});
		// DEFAULT_COLOR is valid
		if (!Object.keys(Color).includes(process.env.DEFAULT_COLOR as string)) {
			throw new Error(`Invalid DEFAULT_COLOR value. Please edit .env file\nOptions: [${Object.keys(Color).join(", ")}]`);
		}
	}

	export async function checkForPatchNotes() {
		// Check if any patch notes have not been read
		const dbPatchNotes = Queries.selectAllPatchNotes();
		const fileNamesOfUnsentPatchNotes = fs.readdirSync("./patch-notes")
			.filter(fileNames => !dbPatchNotes.some(dbPatchNote => dbPatchNote.fileName == fileNames));
		if (fileNamesOfUnsentPatchNotes.length === 0) return;

		// Use dynamic import to load the .ts file
		const patchNotesChannelId = process.env.PATCH_NOTES_CHANNEL_ID;
		if (!patchNotesChannelId) return;
		const patchNotesChannel = CLIENT.channels.cache.get(patchNotesChannelId) as TextChannel;
		for (const fileName of fileNamesOfUnsentPatchNotes) {
			const { embeds } = await import(`../../patch-notes/${fileName}`);

			// wait for console confirmation
			let userInput = null;
			const sendPatchNotesFlag = process.env.FORCE_SEND_PATCH_NOTES.toLowerCase().trim() === "true";
			if (sendPatchNotesFlag) {
				userInput = "1";
			}
			else {
				while (!["1", "2", "3"].includes(userInput)) {
					console.log("");
					console.log(`Patch notes for '${fileName}' have not been sent. Enter a number to continue:`);
					console.log("[1] send patch notes to patch notes channel");
					console.log("[2] mark patch note as already sent");
					console.log("[3] skip");
					userInput = (await new Promise(resolve => process.stdin.once("data", resolve)))?.toString().trim();
				}
			}
			if (userInput === "1") {
				await patchNotesChannel.send({ embeds });
				Queries.insertPatchNotes({ fileName });
				console.log(`Sent ${fileName}. Continuing...`);
			}
			else if (userInput === "2") {
				Queries.insertPatchNotes({ fileName });
				console.log(`Marked '${fileName}' as sent. Continuing...`);
			}
			else {
				console.log("Continuing...");
			}
		}
	}

	export function loadTopGGAutoPoster() {
		if (process.env.TOP_GG_TOKEN) {
			try {
				console.time("Linked Top.gg AutoPoster");
				AutoPoster(process.env.TOP_GG_TOKEN, CLIENT).on("error", () => null);
				console.timeEnd("Linked Top.gg AutoPoster");
			}
			catch (e) {
				console.error(e);
			}
		}
	}

	export async function checkForOfflineVoiceChanges() {
		for (const guildId of Object.keys(groupBy(Queries.selectAllVoices(), "guildId"))) {
			const guild = await getGuild(guildId);
			if (!guild) continue;
			const store = new Store(guild);
			const queueIds = store.dbQueues().map(queue => queue.id);
			DisplayUtils.requestDisplaysUpdate({ store, queueIds, opts: { updateTypeOverride: DisplayUpdateType.Edit } });
			// rate limit
			await new Promise(resolve => setTimeout(resolve, 500));
		}
	}

	export function startPresencePolling() {
		setInterval(async () => {
			try {
				const guilds = CLIENT.guilds.cache;
				for (const guild of guilds.values()) {
					const store = new Store(guild);
					const activeQueues = store.dbQueues().filter(queue => queue.gamePresenceToggle);
					if (!activeQueues.size) continue;

					const activeQueueIds = new Set(activeQueues.map(q => q.id));
					const queuedMembers = store.dbMembers().filter(m => activeQueueIds.has(m.queueId));
					if (!queuedMembers.size) continue;

					const uniqueUserIds = [...new Set(queuedMembers.map(m => m.userId))];

					for (const userId of uniqueUserIds) {
						let jsMember = guild.members.cache.get(userId);
						let presence = ClientHandler.LIVE_PRESENCES.get(userId) ?? guild.presences.cache.get(userId) ?? jsMember?.presence;

						if (!presence) {
							jsMember = await guild.members.fetch({ user: userId, withPresences: true }).catch(() => null) ?? jsMember;
							presence = jsMember?.presence;
							if (presence) {
								ClientHandler.LIVE_PRESENCES.set(userId, presence);
							}
						}

						const memberTag = jsMember?.user?.tag ?? jsMember?.user?.username ?? userId;

						if (!presence) {
							console.log(`[DEBUG PRESENCE POLL] Presence data for ${memberTag} is pending/uncached from Discord. Skipping kick safety check.`);
							continue;
						}

						const activities = presence.activities ?? [];
						const isOffline = presence.status === "offline";
						const activityNames = activities.map(a => `${ActivityType[a.type] ?? a.type}: "${a.name}"`).join(", ") || "none";

						console.log(`[DEBUG PRESENCE POLL] User: ${memberTag} | Status: ${presence.status} | Activities: [${activityNames}]`);

						const userQueues = activeQueues.filter(q => queuedMembers.some(m => m.userId === userId && m.queueId === q.id));

						for (const queue of userQueues.values()) {
							const gameName = queue.gamePresenceName?.trim();
							let stillPlaying = false;

							if (!isOffline && activities.length > 0) {
								if (gameName) {
									stillPlaying = activities.some(activity =>
										isGameNameMatch(activity.name, gameName)
									);
								}
								else {
									stillPlaying = activities.some(activity => activity.type === ActivityType.Playing || activity.type === ActivityType.Competing);
								}
							}

							if (stillPlaying) {
								const matched = activities.filter(a => isGameNameMatch(a.name, gameName ?? ""));
								console.log(`[DEBUG PRESENCE POLL] User ${memberTag} IS playing matching game for queue "${queue.name}". Activity JSON:`, JSON.stringify(matched));
							}
							else {
								console.log(`[DEBUG PRESENCE POLL] Game OFF detected for ${memberTag} in queue "${queue.name}" (filter: "${gameName || 'any'}"). Removing member...`);
								await MemberUtils.deleteMembers({
									store,
									queues: [queue],
									reason: MemberRemovalReason.Left,
									by: { userId },
								}).catch(() => null);
							}
						}
					}
				}
			}
			catch (e) {
				// silent error catch
			}
		}, 10_000);
	}

	export const WARNED_MEMBER_TIMEOUTS = new Set<string>();

	export function startMemberTimeoutChecker() {
		setInterval(async () => {
			try {
				const guilds = CLIENT.guilds.cache;
				for (const guild of guilds.values()) {
					const store = new Store(guild);
					const timeoutQueues = store.dbQueues().filter(queue => Boolean(queue.memberTimeout && queue.memberTimeout > 0n));
					if (!timeoutQueues.size) continue;

					for (const queue of timeoutQueues.values()) {
						const timeoutMinutes = Number(queue.memberTimeout);
						if (timeoutMinutes <= 0) continue;

						const timeoutMs = timeoutMinutes * 60 * 1000;
						const warningMs = Math.max(0, (timeoutMinutes - 10) * 60 * 1000);
						const members = store.dbMembers().filter(m => m.queueId === queue.id);

						for (const member of members.values()) {
							const now = Date.now();
							const joinTimeMs = Number(member.joinTime);
							const elapsedMs = now - joinTimeMs;
							const key = `${queue.id}_${member.userId}`;

							// Check Expiration first
							if (elapsedMs >= timeoutMs) {
								WARNED_MEMBER_TIMEOUTS.delete(key);

								console.log(`[DEBUG TIMEOUT] Member ${member.userId} expired in queue "${queue.name}" after ${timeoutMinutes}m. Auto-removing...`);

								await MemberUtils.deleteMembers({
									store,
									queues: [queue],
									reason: MemberRemovalReason.Expired,
									by: { userId: member.userId },
								}).catch(() => null);

								const jsMember = await guild.members.fetch(member.userId).catch(() => null);
								await jsMember?.send({
									content: `⏳ You were automatically removed from the **${queue.name}** queue because your ${timeoutMinutes}-minute queue timer expired.`,
								}).catch(() => null);

								continue;
							}

							// Check Warning (10 minutes prior to expiration)
							if (elapsedMs >= warningMs && !WARNED_MEMBER_TIMEOUTS.has(key)) {
								WARNED_MEMBER_TIMEOUTS.add(key);

								const remainingMinutes = Math.max(1, Math.ceil((timeoutMs - elapsedMs) / 60000));
								console.log(`[DEBUG TIMEOUT] Sending 10-minute warning DM to member ${member.userId} for queue "${queue.name}".`);

								const jsMember = await guild.members.fetch(member.userId).catch(() => null);
								if (jsMember) {
									const renewButton = new ButtonBuilder()
										.setCustomId(`renew:${queue.id}`)
										.setLabel("🔄 Renew Queue Timer")
										.setStyle(ButtonStyle.Primary);
									const row = new ActionRowBuilder<ButtonBuilder>().addComponents(renewButton);

									await jsMember.send({
										content: `⚠️ You will be automatically removed from the **${queue.name}** queue in ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}. Click below if you want to renew your timer!`,
										components: [row],
									}).catch(() => null);
								}
							}
						}
					}
				}
			}
			catch (e) {
				// silent catch
			}
		}, 15_000); // Check every 15 seconds
	}
}