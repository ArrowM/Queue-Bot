import { Collection } from "discord.js";

import type { DbDisplay } from "../../db/schema.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { CHOICE_ALL, CHOICE_SOME } from "../../types/parsing.types.ts";
import { SelectMenuTransactor } from "../../utils/message-utils/select-menu-transactor.ts";
import { CustomOption } from "../base-option.ts";
import { DisplayOption } from "./display.option.ts";

export class DisplaysOption extends CustomOption {
	static readonly ID = "display_channels";
	id = DisplayOption.ID;
	extraChoices = [CHOICE_ALL, CHOICE_SOME];

	getAutocompletions = DisplayOption.getAutocompletions;

	// force return type to be Collection<bigint, DbDisplay>
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<Collection<bigint, DbDisplay>>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		const inputString = inter.options.getString(DisplaysOption.ID);
		if (!inputString) return;

		const queues = await inter.parser.getScopedQueues();
		const displays = inter.parser.getScopedDisplays(queues);

		switch (inputString) {
			case CHOICE_ALL.value:
				return displays;
			case CHOICE_SOME.value:
				return await this.getViaSelectMenu(inter as SlashInteraction, displays);
			default:
				const display = DisplayOption.findDisplay(displays, inputString);
				return display ? new Collection([[display.id, display]]) : null;
		}
	}

	protected async getViaSelectMenu(inter: SlashInteraction, displays: Collection<bigint, DbDisplay>): Promise<Collection<bigint, DbDisplay>> {
		// build menu
		const label = DisplaysOption.ID;
		const options = displays.map(display => ({
			name: display.toString(),
			value: display.id.toString(),
		}));

		// send and receive
		const selectMenuTransactor = new SelectMenuTransactor(inter);
		const result = await selectMenuTransactor.sendAndReceive(label, options);

		// parse result
		const displayIds = result.map(id => BigInt(id));
		const selectedDisplays = displays.filter(display => displayIds.includes(display.id));

		// write result
		await selectMenuTransactor.updateWithResult(label, selectedDisplays);

		return selectedDisplays;
	}
}