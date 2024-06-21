import type { Collection } from "discord.js";

import type { DbPrioritized } from "../../db/schema.ts";
import type { UIOption } from "../../types/handler.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { PrioritizedNotFoundError } from "../../utils/error.utils.ts";
import { type AutoCompleteOptions, CustomOption } from "../base-option.ts";

export class PrioritizedOption extends CustomOption {
	static readonly ID = "prioritized";
	id = PrioritizedOption.ID;

	getAutocompletions = PrioritizedOption.getAutocompletions;

	// force return type to be DbPrioritized
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<DbPrioritized>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		const inputString = inter.options.getString(PrioritizedOption.ID);
		if (!inputString) return;

		const queues = await inter.parser.getScopedQueues();
		const prioritizeds = inter.parser.getScopedPrioritized(queues);

		return PrioritizedOption.findPrioritized(prioritizeds, inputString);
	}

	static findPrioritized(prioritizeds: Collection<bigint, DbPrioritized>, idString: string): DbPrioritized {
		let prioritized: DbPrioritized | undefined;
		try {
			prioritized = prioritizeds.find(entry => entry.id === BigInt(idString));
		}
		catch {
			prioritized = null;
		}
		if (prioritized) {
			return prioritized;
		}
		else {
			throw new PrioritizedNotFoundError();
		}
	}

	static async getAutocompletions(options: AutoCompleteOptions): Promise<UIOption[]> {
		const { inter } = options;
		const queues = await inter.parser.getScopedQueues();
		const prioritizeds = inter.parser.getScopedPrioritized(queues);

		const suggestions: UIOption[] = [];
		for (const prioritized of prioritizeds.values()) {
			const scope = prioritized.queueId ? `in '${queues.get(prioritized.queueId).name}' queue` : "";
			if (prioritized.isRole) {
				const role = await inter.store.jsRole(prioritized.subjectId);
				suggestions.push({
					name: `'${role.name}' role ${scope}`,
					value: prioritized.id.toString(),
				});
			}
			else {
				const member = await inter.store.jsMember(prioritized.subjectId);
				suggestions.push({
					name: `'${member.nickname ?? member.displayName}' user ${scope}`,
					value: prioritized.id.toString(),
				});
			}
		}
		return suggestions;
	}
}