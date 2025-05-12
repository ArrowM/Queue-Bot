import { Client as DiscordClient, GatewayIntentBits, Options } from "discord.js";

import { checkForMigration } from "../db/legacy-migration/migrate.ts";
import { ClientListeners } from "../listeners/client.listeners.ts";
import { ClientUtils } from "../utils/client.utils.ts";
import { ScheduleUtils } from "../utils/schedule.utils.ts";

export const CLIENT = new DiscordClient({
	intents: [
		// Required for guild / channel updates
		GatewayIntentBits.Guilds,
		// Required for voice updates
		GatewayIntentBits.GuildVoiceStates,
		// Required for DisplayUpdateType.LatestMessage
		GatewayIntentBits.GuildMessages,
	],
	makeCache: Options.cacheWithLimits({
		...Options.DefaultMakeCacheSettings,
		GuildMessageManager: 50,
		MessageManager: 50,
		GuildTextThreadManager: 50,
		GuildMemberManager: {
			maxSize: 250,
			keepOverLimit: member => member.id === member.client.user.id,
		},
		// Disable caching for unused features
		ReactionManager: 0,
		ReactionUserManager: 0,
		GuildStickerManager: 0,
		GuildScheduledEventManager: 0,
		ThreadManager: 0,
	}),
	sweepers: {
		...Options.DefaultSweeperSettings,
		messages: {
			interval: 3_600, // Every hour.
			lifetime: 3_600, // Remove messages older than 1 hour.
		},
		threads: {
			interval: 3_600, // Every hour.
			lifetime: 3_600, // Remove threads older than 1 hour.
		},
	},
	shards: "auto",
});

export namespace Client {
	export async function start() {
		try {
			console.time("READY");

			ClientListeners.load();

			ClientUtils.verifyRequiredEnvironmentVariables();

			await ClientUtils.login();

			await checkForMigration();

			await ClientUtils.registerCommands();

			ScheduleUtils.loadSchedules();

			console.timeEnd("READY");

			// Post-bot-startup tasks

			ClientUtils.loadTopGGAutoPoster();

			// Force fetch of all guilds
			await CLIENT.guilds.fetch();

			ClientUtils.checkForOfflineVoiceChanges();

			ClientUtils.checkForPatchNotes();
		}
		catch (e) {
			const { message, stack } = e as Error;
			console.error("Failed to start bot:");
			console.error(`Error: ${message}`);
			console.error(`Stack Trace: ${stack}`);
		}
	}
}
