import type { APIApplicationCommandOptionChoice, ChannelType } from "discord.js";

import { type CHOICE_ALL, CHOICE_SOME } from "./parsing.types.ts";

export interface OptionParams {
	// description of option in Discord UI
	description: string;

	// name of option in Discord UI
	name?: string;
	// whether the option should be autocompleted
	autocomplete?: boolean;
	// types of channels that can be selected
	channelTypes?: readonly ChannelType[];
	// choices for the option
	choices?: APIApplicationCommandOptionChoice<number | string>[];
	// extra values to add to the choices
	extraChoices?: (typeof CHOICE_ALL | typeof CHOICE_SOME)[];
	// default value for the option (shown in description)
	defaultValue?: any;
	// minimum value for number options
	minValue?: number;
	// whether the option is required
	required?: boolean;
}
