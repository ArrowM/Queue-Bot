import { LimitedCollection, Message } from "discord.js";

import { CLIENT } from "./CLIENT.ts";

/**
 * This message cache only caches messages from this bot
 * */
export class BotOnlyMessageCollection<K, V> extends LimitedCollection<K, V> {
	public set(key: any, value: any) {
		const msg = value as Message;
		// skip authors that are not the bot
		if (msg.author.id !== CLIENT.user.id) return this;
		// skip if this collection size is 0
		if (this.maxSize === 0) return this;
		// cache item
		super.set(key, value);
		// evict oldest message if collection is full
		if (this.size >= this.maxSize) {
			this.delete(this.keys().next().value);
		}
		return this;
	}
}
