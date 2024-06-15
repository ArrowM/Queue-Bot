import type { Collection } from "discord.js";

import type { DbBlacklisted } from "../../db/schema.ts";
import type { UIOption } from "../../types/handler.types.ts";
import type { AutocompleteInteraction } from "../../types/interaction.types.ts";
import { BlacklistedNotFoundError } from "../../utils/error.utils.ts";
import { type AutoCompleteOptions, CustomOption } from "../base-option.ts";

export class BlacklistedOption extends CustomOption {
	static readonly ID = "blacklisted";
	id = BlacklistedOption.ID;

	getAutocompletions = BlacklistedOption.getAutocompletions;

	// force return type to be DbBlacklisted
	get(inter: AutocompleteInteraction) {
		return super.get(inter) as Promise<DbBlacklisted>;
	}

	protected async getUncached(inter: AutocompleteInteraction) {
		const inputString = inter.options.getString(BlacklistedOption.ID);
		if (!inputString) return;

		const queues = await inter.parser.getScopedQueues();
		const blacklisteds = inter.parser.getScopedBlacklisted(queues);

		return BlacklistedOption.findBlacklisted(blacklisteds, inputString);
	}

	static findBlacklisted(blacklisteds: Collection<bigint, DbBlacklisted>, idString: string): DbBlacklisted {
		try {
			const blacklisted = blacklisteds.find(entry => entry.id === BigInt(idString));
			if (blacklisted) {
				return blacklisted;
			}
			else {
				throw new BlacklistedNotFoundError();
			}
		}
		catch {
			throw new BlacklistedNotFoundError();
		}
	}

	static async getAutocompletions(options: AutoCompleteOptions): Promise<UIOption[]> {
		const { inter } = options;
		const queues = await inter.parser.getScopedQueues();
		const blacklisteds = inter.parser.getScopedBlacklisted(queues);

		const suggestions: UIOption[] = [];
		for (const blacklisted of blacklisteds.values()) {
			const name = blacklisted.isRole
				? (await inter.store.jsRole(blacklisted.subjectId)).name
				: (await inter.store.jsMember(blacklisted.subjectId)).displayName;
			const type = blacklisted.isRole ? "role" : "user";
			const scope = blacklisted.queueId ? ` in '${queues.get(blacklisted.queueId).name}' queue` : "";

			suggestions.push({
				name: `'${name}' ${type}${scope}`,
				value: blacklisted.id.toString(),
			});
		}
		return suggestions;
	}
}