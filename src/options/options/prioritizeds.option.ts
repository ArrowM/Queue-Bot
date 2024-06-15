import { Collection } from "discord.js";

import type { DbPrioritized } from "../../db/schema.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { CHOICE_ALL, CHOICE_SOME } from "../../types/parsing.types.ts";
import { SelectMenuTransactor } from "../../utils/message-utils/select-menu-transactor.ts";
import { CustomOption } from "../base-option.ts";
import { PrioritizedOption } from "./prioritized.option.ts";

export class PrioritizedsOption extends CustomOption {
	static readonly ID = "prioritizeds";
	id = PrioritizedsOption.ID;
	extraChoices = [CHOICE_ALL, CHOICE_SOME];

	getAutocompletions = PrioritizedOption.getAutocompletions;

	// force return type to be DbPrioritized
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<Collection<bigint, DbPrioritized>>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		const inputString = inter.options.getString(PrioritizedsOption.ID);
		if (!inputString) return;

		const queues = await inter.parser.getScopedQueues();
		const prioritizeds = inter.parser.getScopedPrioritized(queues);

		switch (inputString) {
			case CHOICE_ALL.value:
				return prioritizeds;
			case CHOICE_SOME.value:
				return await this.getViaSelectMenu(inter as SlashInteraction, prioritizeds);
			default:
				const prioritized = PrioritizedOption.findPrioritized(prioritizeds, inputString);
				return prioritized ? new Collection([[prioritized.id, prioritized]]) : null;
		}
	}

	protected async getViaSelectMenu(inter: SlashInteraction, prioritizeds: Collection<bigint, DbPrioritized>): Promise<Collection<bigint, DbPrioritized>> {
		// build menu
		const label = PrioritizedsOption.ID;
		const options = prioritizeds.map(prioritized => ({
			name: prioritized.toString(),
			value: prioritized.id.toString(),
		}));

		// send and receive
		const selectMenuTransactor = new SelectMenuTransactor(inter);
		const result = await selectMenuTransactor.sendAndReceive(label, options);

		// parse result
		const prioritizedIds = result.map(id => BigInt(id));
		const selectedPrioritizeds = prioritizeds.filter(prioritized => prioritizedIds.includes(prioritized.id));

		// write result
		await selectMenuTransactor.updateWithResult(label, selectedPrioritizeds);

		return selectedPrioritizeds;
	}
}