import type { Collection } from "discord.js";

import type { DbWhitelisted } from "../../db/schema.ts";
import type { UIOption } from "../../types/handler.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { WhitelistedNotFoundError } from "../../utils/error.utils.ts";
import { type AutoCompleteOptions, CustomOption } from "../base-option.ts";

export class WhitelistedOption extends CustomOption {
	static readonly ID = "whitelisted";
	id = WhitelistedOption.ID;

	getAutocompletions = WhitelistedOption.getAutocompletions;

	// force return type to be DbWhitelisted
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<DbWhitelisted>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		const inputString = inter.options.getString(WhitelistedOption.ID);
		if (!inputString) return;

		const queues = await inter.parser.getScopedQueues();
		const whitelisteds = inter.parser.getScopedWhitelisted(queues);

		return WhitelistedOption.findWhitelisted(whitelisteds, inputString);
	}

	static findWhitelisted(whitelisteds: Collection<bigint, DbWhitelisted>, idString: string): DbWhitelisted {
		try {
			const whitelisted = whitelisteds.find(entry => entry.id === BigInt(idString));
			if (whitelisted) {
				return whitelisted;
			}
			else {
				throw new WhitelistedNotFoundError();
			}
		}
		catch {
			throw new WhitelistedNotFoundError();
		}
	}

	static async getAutocompletions(options: AutoCompleteOptions): Promise<UIOption[]> {
		const { inter } = options;
		const queues = await inter.parser.getScopedQueues();
		const whitelisteds = inter.parser.getScopedWhitelisted(queues);

		const suggestions: UIOption[] = [];
		for (const whitelisted of whitelisteds.values()) {
			const name = whitelisted.isRole
				? inter.store.guild.roles.cache.get(whitelisted.subjectId).name
				: (await inter.store.jsMember(whitelisted.subjectId)).displayName;
			const type = whitelisted.isRole ? "role" : "user";
			const scope = whitelisted.queueId ? ` in '${queues.get(whitelisted.queueId).name}' queue` : "";

			suggestions.push({
				name: `'${name}' ${type}${scope}`,
				value: whitelisted.id.toString(),
			});
		}
		return suggestions;
	}
}