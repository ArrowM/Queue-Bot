import type { Collection } from "discord.js";

import type { DbVoice } from "../../db/schema.ts";
import type { UIOption } from "../../types/handler.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { VoiceNotFoundError } from "../../utils/error.utils.ts";
import { type AutoCompleteOptions, CustomOption } from "../base-option.ts";

export class VoiceOption extends CustomOption {
	static readonly ID = "voice";
	id = VoiceOption.ID;

	getAutocompletions = VoiceOption.getAutocompletions;

	// force return type to be DbVoice
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<DbVoice>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		const inputString = inter.options.getString(VoiceOption.ID);
		if (!inputString) return;

		const queues = await inter.parser.getScopedQueues();
		const voices = inter.parser.getScopedVoices(queues);

		return VoiceOption.findVoice(voices, inputString);
	}

	static findVoice(voices: Collection<bigint, DbVoice>, idString: string): DbVoice {
		try {
			const voice = voices.find(entry => entry.id === BigInt(idString));
			if (voice) {
				return voice;
			}
			else {
				throw new VoiceNotFoundError();
			}
		}
		catch {
			throw new VoiceNotFoundError();
		}
	}

	static async getAutocompletions(options: AutoCompleteOptions): Promise<UIOption[]> {
		const { inter } = options;
		const queues = await inter.parser.getScopedQueues();
		const voices = inter.parser.getScopedVoices(queues);

		const suggestions: UIOption[] = [];
		for (const voice of voices.values()) {
			const queue = queues.get(voice.queueId);
			const queueName = queue.name;
			const sourceName = (await inter.store.jsChannel(voice.sourceChannelId)).name;
			const destinationName = (await inter.store.jsChannel(queue.voiceDestinationChannelId)).name;

			suggestions.push({
				name: `'${queueName}' queue: '${sourceName}' vc${destinationName ? ` -> '${destinationName}' vc` : ""}`,
				value: voice.id.toString(),
			});
		}

		return suggestions;
	}
}