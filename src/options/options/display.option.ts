import { Collection } from "discord.js";

import type { DbDisplay } from "../../db/schema.ts";
import type { UIOption } from "../../types/handler.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { DisplayNotFoundError } from "../../utils/error.utils.ts";
import { type AutoCompleteOptions, CustomOption } from "../base-option.ts";

export class DisplayOption extends CustomOption {
	static readonly ID = "display_channel";
	id = DisplayOption.ID;

	getAutocompletions = DisplayOption.getAutocompletions;

	// force return type to be DbDisplay
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<DbDisplay>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		const inputString = inter.options.getString(DisplayOption.ID);
		if (!inputString) return;

		const queues = await inter.parser.getScopedQueues();
		const displays = inter.parser.getScopedDisplays(queues);

		return DisplayOption.findDisplay(displays, inputString);
	}

	static findDisplay(displays: Collection<bigint, DbDisplay>, idString: string): DbDisplay {
		try {
			const display = displays.get(BigInt(idString));
			if (display) {
				return display;
			}
			else {
				throw new DisplayNotFoundError();
			}
		}
		catch {
			throw new DisplayNotFoundError();
		}
	}

	static async getAutocompletions(options: AutoCompleteOptions): Promise<UIOption[]> {
		const { inter } = options;
		const queues = await inter.parser.getScopedQueues();
		const displays = inter.parser.getScopedDisplays(queues);

		const suggestions: UIOption[] = [];
		for (const display of displays.values()) {
			const scope = display.queueId ? `'${queues.get(display.queueId).name}' queue` : "all queues";
			const channel = await inter.store.jsChannel(display.displayChannelId);

			suggestions.push({
				name: `${scope} in '${channel.name}' channel`,
				value: display.id.toString(),
			});
		}
		return suggestions;
	}
}