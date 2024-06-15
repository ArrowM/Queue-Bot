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
		try {
			const prioritized = prioritizeds.find(entry => entry.id === BigInt(idString));
			if (prioritized) {
				return prioritized;
			}
			else {
				throw new PrioritizedNotFoundError();
			}
		}
		catch {
			throw new PrioritizedNotFoundError();
		}
	}

	static async getAutocompletions(options: AutoCompleteOptions): Promise<UIOption[]> {
		const { inter } = options;
		const queues = await inter.parser.getScopedQueues();
		const prioritizeds = inter.parser.getScopedPrioritized(queues);

		const suggestions: UIOption[] = [];
		for (const prioritized of prioritizeds.values()) {
			const name = prioritized.isRole
				? (await inter.store.jsRole(prioritized.subjectId)).name
				: (await inter.store.jsMember(prioritized.subjectId)).displayName;
			const type = prioritized.isRole ? "role" : "user";
			const scope = prioritized.queueId ? ` in '${queues.get(prioritized.queueId).name}' queue` : "";

			suggestions.push({
				name: `'${name}' ${type}${scope}`,
				value: prioritized.id.toString(),
			});
		}
		return suggestions;
	}
}