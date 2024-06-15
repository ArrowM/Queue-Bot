import { QUEUE_TABLE } from "../../db/schema.ts";
import { BooleanOption } from "../base-option.ts";

export class AutopullToggleOption extends BooleanOption {
	static readonly ID = "autopull_toggle";
	id = AutopullToggleOption.ID;
	defaultValue = QUEUE_TABLE.autopullToggle.default;
}