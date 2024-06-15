import { LogScope } from "../../types/db.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { toChoices } from "../../utils/misc.utils.ts";
import { StringOption } from "../base-option.ts";

export class LogScopeOption extends StringOption {
	static readonly ID = "log_scope";
	id = LogScopeOption.ID;
	defaultValue = "Off";
	choices = toChoices(LogScope);

	// force return type to be QueueLogLevel
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as LogScope;
	}
}
