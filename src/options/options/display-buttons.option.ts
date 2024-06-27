import { QUEUE_TABLE } from "../../db/schema.ts";
import { Scope } from "../../types/db.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { toChoices } from "../../utils/misc.utils.ts";
import { StringOption } from "../base-option.ts";

export class ButtonsToggleOption extends StringOption {
	static readonly ID = "buttons_toggles";
	id = ButtonsToggleOption.ID;
	choices = toChoices(Scope);
	defaultValue = QUEUE_TABLE.buttonsToggle.default;

	// force return type to be Scope
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter)?.toLowerCase() as Scope;
	}
}
