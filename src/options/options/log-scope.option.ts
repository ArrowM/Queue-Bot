import { Scope } from "../../types/db.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { toChoices } from "../../utils/misc.utils.ts";
import { StringOption } from "../base-option.ts";

export class LogScopeOption extends StringOption {
	static readonly ID = "log_scope";
	id = LogScopeOption.ID;
	defaultValue = "Off";
	choices = toChoices(Scope);

	// force return type to be Scope
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter)?.toLowerCase() as Scope;
	}
}
