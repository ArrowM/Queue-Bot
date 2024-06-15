import { QUEUE_TABLE } from "../../db/schema.ts";
import { BooleanOption } from "../base-option.ts";

export class InlineToggleOption extends BooleanOption {
	static readonly ID = "inline_toggle";
	id = InlineToggleOption.ID;
	defaultValue = QUEUE_TABLE.inlineToggle.default;
}