import { QUEUE_TABLE } from "../../db/schema.ts";
import { DisplayUpdateType } from "../../types/db.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { toChoices } from "../../utils/misc.utils.ts";
import { StringOption } from "../base-option.ts";

export class DisplayUpdateTypeOption extends StringOption {
	static readonly ID = "display_update_type";
	id = DisplayUpdateTypeOption.ID;
	defaultValue = QUEUE_TABLE.displayUpdateType.default;
	choices = toChoices(DisplayUpdateType);

	// force return type to be DisplayUpdateType
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as DisplayUpdateType;
	}
}
