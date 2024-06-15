import { Client, GatewayIntentBits, Options } from "discord.js";

import { ClientListeners } from "../listeners/client.listeners.ts";
import { ClientUtils } from "../utils/client.utils.ts";
import { ScheduleUtils } from "../utils/schedule.utils.ts";
import { BotOnlyMessageCollection } from "./client-only.cache.ts";

export const CLIENT = new Client({
	intents: [
		// Required for guild / channel updates
		GatewayIntentBits.Guilds,
		// Required for voice updates
		GatewayIntentBits.GuildVoiceStates,
	],
	// Disable caching for unused features
	makeCache: Options.cacheWithLimits({
		...Options.DefaultMakeCacheSettings,
		MessageManager: new BotOnlyMessageCollection({ maxSize: 20 }),
		ReactionManager: 0,
		ReactionUserManager: 0,
		GuildStickerManager: 0,
		GuildScheduledEventManager: 0,
	}),
	sweepers: {
		...Options.DefaultSweeperSettings,
		// Sweep old threads
		threads: {
			interval: 3_600, // Every hour.
			lifetime: 1_800, // Remove thread older than 30 minutes.
		},
	},
});

export async function start() {
	try {
		console.time("READY");

		ClientListeners.load();

		ClientUtils.verifyRequiredEnvironmentVariables();

		await ClientUtils.login();

		await ClientUtils.registerCommands();

		ScheduleUtils.loadSchedules();

		console.timeEnd("READY");

		// Post-bot-startup tasks

		ClientUtils.loadTopGGAutoPoster();

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
