import { QUEUE_TABLE } from "../../db/schema.ts";
import { BooleanOption } from "../base-option.ts";

export class ButtonsToggleOption extends BooleanOption {
	static readonly ID = "buttons_toggle";
	id = ButtonsToggleOption.ID;
	defaultValue = QUEUE_TABLE.buttonsToggle.default;
}
