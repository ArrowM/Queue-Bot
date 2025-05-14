import { Client as DiscordClient, GatewayIntentBits, LimitedCollection, type Message, Options } from "discord.js";

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
		UserManager: {
			maxSize: 0,
			keepOverLimit: user => user.id === user.client.user.id,
		},
		GuildMemberManager: {
			maxSize: 0,
			keepOverLimit: member => member.user.id === member.client.user.id,
		},
		GuildMessageManager: {
			maxSize: 0,
			keepOverLimit: (value: Message<true>, _key: string, collection: LimitedCollection<string, Message<true>>) => {
				if (value.author.id !== value.client.user?.id) {
					return false;
				}
				if (collection.size > 5) {
					collection.delete(collection.firstKey());
				}
				return true;
			},
		},
		// Disable caching for unused features
		BaseGuildEmojiManager: 0,
		GuildEmojiManager: 0,
		GuildBanManager: 0,
		GuildInviteManager: 0,
		MessageManager: 0,
		GuildTextThreadManager: 0,
		ReactionManager: 0,
		ReactionUserManager: 0,
		GuildStickerManager: 0,
		GuildScheduledEventManager: 0,
		ThreadManager: 0,
		PresenceManager: 0,
	}),
	sweepers: {
		...Options.DefaultSweeperSettings,
		messages: {
			interval: 1_800, // Every half hour.
			lifetime: 1_800, // Remove messages older than half an hour.
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
