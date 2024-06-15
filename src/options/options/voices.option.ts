import { Collection } from "discord.js";

import type { DbVoice } from "../../db/schema.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { CHOICE_ALL, CHOICE_SOME } from "../../types/parsing.types.ts";
import { SelectMenuTransactor } from "../../utils/message-utils/select-menu-transactor.ts";
import { CustomOption } from "../base-option.ts";
import { VoiceOption } from "./voice.option.ts";

export class VoicesOption extends CustomOption {
	static readonly ID = "voices";
	id = VoicesOption.ID;
	extraChoices = [CHOICE_ALL, CHOICE_SOME];

	getAutocompletions = VoiceOption.getAutocompletions;

	// force return type to be DbVoice
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<Collection<bigint, DbVoice>>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		const inputString = inter.options.getString(VoicesOption.ID);
		if (!inputString) return;

		const queues = await inter.parser.getScopedQueues();
		const voices = inter.parser.getScopedVoices(queues);

		switch (inputString) {
			case CHOICE_ALL.value:
				return voices;
			case CHOICE_SOME.value:
				return await this.getViaSelectMenu(inter as SlashInteraction, voices);
			default:
				const voice = VoiceOption.findVoice(voices, inputString);
				return voice ? new Collection([[voice.id, voice]]) : null;
		}
	}

	protected async getViaSelectMenu(inter: SlashInteraction, voices: Collection<bigint, DbVoice>): Promise<Collection<bigint, DbVoice>> {
		// build menu
		const label = VoicesOption.ID;
		const options = voices.map(voice => ({
			name: voice.toString(),
			value: voice.id.toString(),
		}));

		// send and receive
		const selectMenuTransactor = new SelectMenuTransactor(inter);
		const result = await selectMenuTransactor.sendAndReceive(label, options);

		// parse result
		const voiceIds = result.map(id => BigInt(id));
		const selectedVoices = voices.filter(voice => voiceIds.includes(voice.id));

		// write result
		await selectMenuTransactor.updateWithResult(label, selectedVoices);

		return selectedVoices;
	}
}