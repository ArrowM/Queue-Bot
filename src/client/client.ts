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
	// Disable caching for unused features
	makeCache: Options.cacheWithLimits({
		...Options.DefaultMakeCacheSettings,
		GuildMessageManager: {
			maxSize: 0,
			keepOverLimit: member => member.id === member.client.user.id,
		},
		ReactionManager: 0,
		ReactionUserManager: 0,
		GuildStickerManager: 0,
		GuildScheduledEventManager: 0,
		VoiceStateManager: 0,
	}),
	sweepers: {
		...Options.DefaultSweeperSettings,
		messages: {
			interval: 3_600, // Every hour.
			lifetime: 7_200, // Remove messages older than 2 hours.
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
