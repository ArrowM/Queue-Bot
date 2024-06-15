import type { GuildTextBasedChannel } from "discord.js";

import type { DbQueue } from "../db/schema.ts";

export enum NotificationAction {
	ADDED_TO_QUEUE = "added to",
	KICKED_FROM_QUEUE = "kicked from",
	PULLED_FROM_QUEUE = "pulled from",
	// ADDED_TO_WHITELIST = "added to the whitelist for",
	// REMOVED_FROM_WHITELIST = "removed from the whitelist for",
	// PRIORITIZED = "prioritized in",
	// UNPRIORITIZED = "Deprioritized in",
	// GRANTED_ADMIN = "granted admin access in",
	// REVOKED_ADMIN = "revoked admin access in",
}

export interface NotificationOptions {
	queue: DbQueue,
	action: NotificationAction;
	channelToLink?: GuildTextBasedChannel;
}