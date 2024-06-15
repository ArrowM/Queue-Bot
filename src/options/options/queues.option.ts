import { Collection } from "discord.js";

import type { DbQueue } from "../../db/schema.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { CHOICE_ALL, CHOICE_SOME } from "../../types/parsing.types.ts";
import { SelectMenuTransactor } from "../../utils/message-utils/select-menu-transactor.ts";
import { CustomOption } from "../base-option.ts";
import { QueueOption } from "./queue.option.ts";

export class QueuesOption extends CustomOption {
	static ID = "queues";
	id = QueuesOption.ID;
	extraChoices = [CHOICE_ALL, CHOICE_SOME];

	getAutocompletions = QueueOption.getAutocompletions;

	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<Collection<bigint, DbQueue>>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		const inputString = inter.options.getString(QueuesOption.ID);
		if (!inputString) return;

		const scopedQueues = inter.store.dbQueues();

		switch (inputString) {
			case CHOICE_ALL.value:
				return scopedQueues;
			case CHOICE_SOME.value:
				return await this.getViaSelectMenu(inter as SlashInteraction, scopedQueues);
			default:
				const queue = QueueOption.findQueue(inter.store.dbQueues(), inputString);
				return queue ? new Collection([[queue.id, queue]]) : null;
		}
	}

	protected async getViaSelectMenu(inter: SlashInteraction, queues: Collection<bigint, DbQueue>): Promise<Collection<bigint, DbQueue>> {
		// build menu
		const label = QueuesOption.ID;
		const options = queues.map(queue => ({
			name: queue.name,
			value: queue.id.toString(),
		}));

		// send and receive
		const selectMenuTransactor = new SelectMenuTransactor(inter);
		const result = await selectMenuTransactor.sendAndReceive(label, options);

		// parse result
		const queueIds = result.map(id => BigInt(id));
		const selectedQueues = queues.filter(queue => queueIds.includes(queue.id));

		// write result
		await selectMenuTransactor.updateWithResult(label, selectedQueues);

		return selectedQueues;
	}
}
