import { EmbedBuilder, type GuildTextBasedChannel, Message } from "discord.js";

import type { Store } from "../../db/store.ts";
import { Scope } from "../../types/db.types.ts";

export namespace LoggingUtils {
	export type Loggable = Message | string | { embeds?: EmbedBuilder[], content?: string };

	export async function log(store: Store, isAdmin: boolean, originalMessage: Loggable) {
		const { logChannelId, logScope } = store.dbGuild();
		// required fields check
		if (
			!logChannelId ||
			!logScope ||
			!originalMessage ||
			(originalMessage instanceof Message && logChannelId === originalMessage.channelId)
		) return;
		// scope check
		if (![Scope.Admin, Scope.All].includes(logScope) && isAdmin) return;
		if (![Scope.NonAdmin, Scope.All].includes(logScope) && !isAdmin) return;

		const logChannel = await store.jsChannel(logChannelId) as GuildTextBasedChannel;
		if (!logChannel) return;

		let embeds: EmbedBuilder[] = [];

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
			embeds = embeds.map(embed =>
				new EmbedBuilder({ ...embed.data }).setAuthor({
					name: store.inter.user.displayName,
					iconURL: store.inter.user.displayAvatarURL(),
					url: (originalMessage as any)?.url,
				})
			);
		}

		try {
			return await logChannel.send({ embeds });
		}
		catch (e) {
			// ignore
		}
	}
}