import { QUEUE_TABLE } from "../../db/schema.ts";
import { Scope } from "../../types/db.types.ts";
import { toChoices } from "../../utils/misc.utils.ts";
import { StringOption } from "../base-option.ts";

export class DisplayButtonsOption extends StringOption {
	static readonly ID = "display_buttons";
	id = DisplayButtonsOption.ID;
	choices = toChoices(Scope);
	defaultValue = QUEUE_TABLE.displayButtons.default;
}
