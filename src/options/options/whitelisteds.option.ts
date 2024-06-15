import { Collection } from "discord.js";

import type { DbWhitelisted } from "../../db/schema.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { CHOICE_ALL, CHOICE_SOME } from "../../types/parsing.types.ts";
import { SelectMenuTransactor } from "../../utils/message-utils/select-menu-transactor.ts";
import { CustomOption } from "../base-option.ts";
import { WhitelistedOption } from "./whitelisted.option.ts";

export class WhitelistedsOption extends CustomOption {
	static readonly ID = "whitelisted";
	id = WhitelistedsOption.ID;
	extraChoices = [CHOICE_ALL, CHOICE_SOME];

	getAutocompletions = WhitelistedOption.getAutocompletions;

	// force return type to be DbWhitelisted
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<Collection<bigint, DbWhitelisted>>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		const inputString = inter.options.getString(WhitelistedsOption.ID);
		if (!inputString) return;

		const queues = await inter.parser.getScopedQueues();
		const whitelisteds = inter.parser.getScopedWhitelisted(queues);

		switch (inputString) {
			case CHOICE_ALL.value:
				return whitelisteds;
			case CHOICE_SOME.value:
				return await this.getViaSelectMenu(inter as SlashInteraction, whitelisteds);
			default:
				const whitelisted = WhitelistedOption.findWhitelisted(whitelisteds, inputString);
				return whitelisted ? new Collection([[whitelisted.id, whitelisted]]) : null;
		}
	}

	protected async getViaSelectMenu(inter: SlashInteraction, whitelisted: Collection<bigint, DbWhitelisted>): Promise<Collection<bigint, DbWhitelisted>> {
		// build menu
		const label = WhitelistedsOption.ID;
		const options = whitelisted.map(whitelisted => ({
			name: whitelisted.toString(),
			value: whitelisted.id.toString(),
		}));

		// send and receive
		const selectMenuTransactor = new SelectMenuTransactor(inter);
		const result = await selectMenuTransactor.sendAndReceive(label, options);

		// parse result
		const whitelistedIds = result.map(id => BigInt(id));
		const selectedWhitelisteds = whitelisted.filter(whitelisted => whitelistedIds.includes(whitelisted.id));

		// write result
		await selectMenuTransactor.updateWithResult(label, selectedWhitelisteds);

		return selectedWhitelisteds;
	}
}