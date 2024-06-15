import { Collection } from "discord.js";

import type { DbBlacklisted } from "../../db/schema.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { CHOICE_ALL, CHOICE_SOME } from "../../types/parsing.types.ts";
import { SelectMenuTransactor } from "../../utils/message-utils/select-menu-transactor.ts";
import { CustomOption } from "../base-option.ts";
import { BlacklistedOption } from "./blacklisted.option.ts";

export class BlacklistedsOption extends CustomOption {
	static readonly ID = "blacklisteds";
	id = BlacklistedsOption.ID;
	extraChoices = [CHOICE_ALL, CHOICE_SOME];

	getAutocompletions = BlacklistedOption.getAutocompletions;

	// force return type to be DbBlacklisted
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<Collection<bigint, DbBlacklisted>>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		const inputString = inter.options.getString(BlacklistedsOption.ID);
		if (!inputString) return;

		const queues = await inter.parser.getScopedQueues();
		const blacklisteds = inter.parser.getScopedBlacklisted(queues);

		switch (inputString) {
			case CHOICE_ALL.value:
				return blacklisteds;
			case CHOICE_SOME.value:
				return await this.getViaSelectMenu(inter as SlashInteraction, blacklisteds);
			default:
				const blacklisted = BlacklistedOption.findBlacklisted(blacklisteds, inputString);
				return blacklisted ? new Collection([[blacklisted.id, blacklisted]]) : null;
		}
	}

	protected async getViaSelectMenu(inter: SlashInteraction, blacklisteds: Collection<bigint, DbBlacklisted>): Promise<Collection<bigint, DbBlacklisted>> {
		// build menu
		const label = BlacklistedsOption.ID;
		const options = blacklisteds.map(blacklisted => ({
			name: blacklisted.toString(),
			value: blacklisted.id.toString(),
		}));

		// send and receive
		const selectMenuTransactor = new SelectMenuTransactor(inter);
		const result = await selectMenuTransactor.sendAndReceive(label, options);

		// parse result
		const blacklistedIds = result.map(id => BigInt(id));
		const selectedBlacklisteds = blacklisteds.filter(blacklisted => blacklistedIds.includes(blacklisted.id));

		// write result
		await selectMenuTransactor.updateWithResult(label, selectedBlacklisteds);

		return selectedBlacklisteds;
	}
}