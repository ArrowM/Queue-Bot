import { Collection } from "discord.js";

import type { DbQueue } from "../../db/schema.ts";
import { QueueOption } from "../../options/options/queue.option.ts";
import { QueuesOption } from "../../options/options/queues.option.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";

export class Parser<T extends AutocompleteInteraction | SlashInteraction> {
	cache: Map<string, unknown> = new Map();

	constructor(protected inter: T) {
	}

	async getScopedQueues(): Promise<Collection<bigint, DbQueue>> {
		const queue = await new QueueOption().get(this.inter);
		if (queue) {
			return new Collection([[queue.id, queue]]);
		}

		const queues = await new QueuesOption().get(this.inter);
		if (queues) {
			return queues;
		}

		return this.inter.store.dbQueues();
	}

	getScopedVoices(queues: Collection<bigint, DbQueue>) {
		return this.inter.store.dbVoices().filter(voice =>
			queues.has(voice.queueId),
		);
	}

	getScopedMembers(queues: Collection<bigint, DbQueue>) {
		return this.inter.store.dbMembers().filter(member =>
			queues.has(member.queueId),
		);
	}

	getScopedDisplays(queues: Collection<bigint, DbQueue>) {
		return this.inter.store.dbDisplays().filter(display =>
			queues.has(display.queueId),
		);
	}

	getScopedSchedules(queues: Collection<bigint, DbQueue>) {
		return this.inter.store.dbSchedules().filter(schedule =>
			queues.has(schedule.queueId),
		);
	}

	getScopedBlacklisted(queues: Collection<bigint, DbQueue>) {
		return this.inter.store.dbBlacklisted().filter(blacklisted =>
			queues.has(blacklisted.queueId),
		);
	}

	getScopedWhitelisted(queues: Collection<bigint, DbQueue>) {
		return this.inter.store.dbWhitelisted().filter(whitelisted =>
			queues.has(whitelisted.queueId),
		);
	}

	getScopedPrioritized(queues: Collection<bigint, DbQueue>) {
		return this.inter.store.dbPrioritized().filter(prioritized =>
			(queues.has(prioritized.queueId)),
		);
	}
}
