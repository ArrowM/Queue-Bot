import { type GuildTextBasedChannel, type Message, messageLink } from "discord.js";

import type { Store } from "../../db/store.ts";
import { LogScope } from "../../types/db.types.ts";

export namespace LoggingUtils {
	export async function log(store: Store, isAdmin: boolean, originalMessage: Message | string) {
		const { logChannelId, logScope } = store.dbGuild();
		if (!logChannelId || !logScope || !originalMessage) return;

		const logChannel = await store.jsChannel(logChannelId) as GuildTextBasedChannel;
		if (!logChannel) return;

		if (typeof originalMessage === "string") {
			originalMessage = { content: originalMessage } as Message;
		}

		if (typeof originalMessage === "object" && "channelId" in originalMessage && "id" in originalMessage) {
			originalMessage.content = messageLink(originalMessage.channelId, originalMessage.id) + " " + originalMessage.content;
		}

		if (
			isAdmin && ([LogScope.Admin, LogScope.All].includes(logScope)) ||
			!isAdmin && ([LogScope.NonAdmin, LogScope.All].includes(logScope))
		) {
			return await logChannel.send(originalMessage as any);
		}
	}
}