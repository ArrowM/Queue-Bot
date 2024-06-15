import { ScheduleCommand } from "../../types/db.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { toChoices } from "../../utils/misc.utils.ts";
import { StringOption } from "../base-option.ts";

export class CommandOption extends StringOption {
	static readonly ID = "command";
	id = CommandOption.ID;
	choices = toChoices(ScheduleCommand);

	// force return type to be ScheduleCommand
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as ScheduleCommand;
	}
}
