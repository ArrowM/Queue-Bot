import { type Message } from "discord.js";

import { incrementGuildStat } from "../db/db-scheduled-tasks.ts";
import { Queries } from "../db/queries.ts";
import { Store } from "../db/store.ts";
import { DisplayUpdateType } from "../types/db.types.ts";
import type { Handler } from "../types/handler.types.ts";
import { DisplayUtils } from "../utils/display.utils.ts";

export class MessageHandler implements Handler {
	constructor(private message: Message) {
	}

	async handle() {
		const store = new Store(this.message.guild);
		const displays = Queries.selectManyDisplays({ guildId: this.message.guildId, displayChannelId: this.message.channelId });
		if (!displays?.length) return;
		incrementGuildStat(store.guild.id, "commandsReceived");
		for (const display of displays) {
			const queue = store.dbQueues().get(display.queueId);
			if (queue.displayUpdateType === DisplayUpdateType.LatestMessage) {
				DisplayUtils.requestDisplayUpdate(store, queue.id, { displayIds: [display.id], updateTypeOverride: DisplayUpdateType.Replace });
			}
		}
	}
}