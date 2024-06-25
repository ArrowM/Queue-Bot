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
		let whitelisted: DbWhitelisted | undefined;
		try {
			whitelisted = whitelisteds.find(entry => entry.id === BigInt(idString));
		}
		catch {
			whitelisted = null;
		}
		if (whitelisted) {
			return whitelisted;
		}
		else {
			throw new WhitelistedNotFoundError();
		}
	}

	static async getAutocompletions(options: AutoCompleteOptions): Promise<UIOption[]> {
		const { inter } = options;
		const queues = await inter.parser.getScopedQueues();
		const whitelisteds = inter.parser.getScopedWhitelisted(queues);

		const suggestions: UIOption[] = [];
		for (const whitelisted of whitelisteds.values()) {
			const scope = whitelisted.queueId ? `in ${queues.get(whitelisted.queueId).name} queue` : "";
			if (whitelisted.isRole) {
				const role = await inter.store.jsRole(whitelisted.subjectId);
				suggestions.push({
					name: `${role.name} role ${scope}`,
					value: whitelisted.id.toString(),
				});
			}
			else {
				const member = await inter.store.jsMember(whitelisted.subjectId);
				suggestions.push({
					name: `${member.nickname ?? member.displayName} user ${scope}`,
					value: whitelisted.id.toString(),
				});
			}
		}
		return suggestions;
	}
}