import { get } from "lodash-es";

import { QUEUE_TABLE } from "../../db/schema.ts";
import { Color } from "../../types/db.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { toChoices } from "../../utils/misc.utils.ts";
import { StringOption } from "../base-option.ts";

export class ColorOption extends StringOption {
	static readonly ID = "color";
	id = ColorOption.ID;
	defaultValue = QUEUE_TABLE.color.default;
	choices = toChoices(Object.keys(Color));

	// force return type to be ColorType
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return get(Color, super.get(inter)) as Color;
	}
}
