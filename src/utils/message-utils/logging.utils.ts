import { EmbedBuilder, type GuildTextBasedChannel, Message } from "discord.js";

import type { Store } from "../../db/store.ts";
import { LogScope } from "../../types/db.types.ts";

export namespace LoggingUtils {
	export async function log(store: Store, isAdmin: boolean, originalMessage: Message | string) {
		const { logChannelId, logScope } = store.dbGuild();
		if (
			!logChannelId ||
			!logScope ||
			!originalMessage ||
			(originalMessage instanceof Message && logChannelId === originalMessage.channelId)
		) return;

		const logChannel = await store.jsChannel(logChannelId) as GuildTextBasedChannel;
		if (!logChannel) return;

		const embeds: EmbedBuilder[] = [];

		if (typeof originalMessage === "string") {
			embeds.push(new EmbedBuilder().setDescription(originalMessage));
		}
		else {
			if (originalMessage.content) {
				embeds.push(new EmbedBuilder().setDescription(originalMessage.content));
			}
			if (originalMessage.embeds) {
				embeds.push(...originalMessage.embeds as any);
			}
		}

		if (store.inter) {
			for (const embed of embeds) {
				(embed as any as EmbedBuilder).setAuthor({
					name: store.inter.user.displayName,
					iconURL: store.inter.user.displayAvatarURL(),
					url: (originalMessage as any)?.url,
				});
			}
		}

		if (
			isAdmin && ([LogScope.Admin, LogScope.All].includes(logScope)) ||
			!isAdmin && ([LogScope.NonAdmin, LogScope.All].includes(logScope))
		) {
			try {
				return await logChannel.send({ embeds });
			}
			catch (e) {
				// ignore
			}
		}
	}
}