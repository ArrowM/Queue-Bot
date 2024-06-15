import { groupBy } from "lodash-es";
import moize from "moize";

import { MAX_SELECT_MENU_OPTIONS, type UIOption } from "../../types/handler.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { LOWER_TIMEZONES } from "../../types/misc.types.ts";
import { type AutoCompleteOptions, CustomOption } from "../base-option.ts";

export class TimezoneOption extends CustomOption {
	static readonly ID = "timezone";
	id = TimezoneOption.ID;

	getAutocompletions = TimezoneOption.getAutocompletions;

	// force return type to be DbAdmin
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<string>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		return inter.options.getString(TimezoneOption.ID);
	}

	static getCachedAutocompleteSuggestions = moize((lowerSearchText: string): UIOption[] => {
		const filteredTimezones = LOWER_TIMEZONES.filter(tz => tz.includes(lowerSearchText));
		let sampledTimezones: string[];

		if (filteredTimezones.length < MAX_SELECT_MENU_OPTIONS) {
			sampledTimezones = filteredTimezones;
		}
		else {
			sampledTimezones = [];
			const groupedFilteredTimezones = groupBy(filteredTimezones, (timezone) => timezone.split("/")[0]);
			let i = 0;
			while (sampledTimezones.length < MAX_SELECT_MENU_OPTIONS) {
				for (const suggestionGroup of Object.values(groupedFilteredTimezones)) {
					const suggestion = suggestionGroup[i];
					if (suggestion) {
						sampledTimezones.push(suggestion);
						if (sampledTimezones.length === MAX_SELECT_MENU_OPTIONS) {
							break;
						}
					}
				}
				i++;
			}
		}

		return sampledTimezones
			.sort((a, b) => a.localeCompare(b))
			.map(tz => ({ name: tz, value: tz }));
	}, { maxSize: 500 });

	static async getAutocompletions(options: AutoCompleteOptions): Promise<UIOption[]> {
		return TimezoneOption.getCachedAutocompleteSuggestions(options.lowerSearchText);
	}
}
