import { Collection } from "discord.js";

import { type DbQueue } from "../../db/schema.ts";
import type { UIOption } from "../../types/handler.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { QueueNotFoundError } from "../../utils/error.utils.ts";
import { type AutoCompleteOptions, CustomOption } from "../base-option.ts";

export class QueueOption extends CustomOption {
	static readonly ID = "queue";
	id = QueueOption.ID;

	getAutocompletions = QueueOption.getAutocompletions;

	// force return type to be DbQueue
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<DbQueue>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		const inputString = inter.options.getString(QueueOption.ID);
		if (!inputString) return;

		const scopedQueues = inter.store.dbQueues();

		return QueueOption.findQueue(scopedQueues, inputString);
	}

	static findQueue(dbQueues: Collection<bigint, DbQueue>, idString: string): DbQueue {
		try {
			const queue = dbQueues.get(BigInt(idString));
			if (queue) {
				return queue;
			}
			else {
				throw new QueueNotFoundError();
			}
		}
		catch {
			throw new QueueNotFoundError();
		}
	}

	static async getAutocompletions(options: AutoCompleteOptions): Promise<UIOption[]> {
		const { inter } = options;
		const queues = inter.store.dbQueues();

		return (queues.size > 0)
			? queues.map(queue => ({ name: queue.name, value: queue.id.toString() }))
			: [{ name: "No queues (try /queues add)", value: "" }];
	}
}
