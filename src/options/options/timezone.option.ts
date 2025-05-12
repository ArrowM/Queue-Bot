import { groupBy } from "lodash-es";

import { MAX_SELECT_MENU_OPTIONS, type UIOption } from "../../types/handler.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { LOWER_TIMEZONES } from "../../types/misc.types.ts";
import { type AutoCompleteOptions, CustomOption } from "../base-option.ts";

export class TimezoneOption extends CustomOption {
	static readonly ID = "timezone";
	id = TimezoneOption.ID;
	defaultValue = process.env.DEFAULT_SCHEDULE_TIMEZONE;

	getAutocompletions = TimezoneOption.getAutocompletions;

	// force return type to be string
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<string>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		return inter.options.getString(TimezoneOption.ID);
	}

	static async getAutocompletions(options: AutoCompleteOptions): Promise<UIOption[]> {
		const filtered = LOWER_TIMEZONES.filter(tz => tz.includes(options.lowerSearchText));
		let sampled: string[] = [];

		if (filtered.length < MAX_SELECT_MENU_OPTIONS) {
			sampled = filtered;
		}
 		else {
			const groups = groupBy(filtered, tz => tz.split("/")[0]);
			for (let i = 0; sampled.length < MAX_SELECT_MENU_OPTIONS; i++) {
				for (const group of Object.values(groups)) {
					const tz = group[i];
					if (tz) sampled.push(tz);
					if (sampled.length === MAX_SELECT_MENU_OPTIONS) break;
				}
			}
		}

		return sampled
			.sort((a, b) => a.localeCompare(b))
			.map(tz => ({ name: tz, value: tz }));
	}
}
