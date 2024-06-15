import { QUEUE_TABLE } from "../../db/schema.ts";
import { TimestampType } from "../../types/db.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { toChoices } from "../../utils/misc.utils.ts";
import { StringOption } from "../base-option.ts";

export class TimestampTypeOption extends StringOption {
	static readonly ID = "timestamp_type";
	id = TimestampTypeOption.ID;
	defaultValue = QUEUE_TABLE.memberDisplayType.default;
	choices = toChoices(TimestampType);

	// force return type to be TimestampType
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as TimestampType;
	}
}
