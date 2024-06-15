import { QUEUE_TABLE } from "../../db/schema.ts";
import { BooleanOption } from "../base-option.ts";

export class LockToggleOption extends BooleanOption {
	static readonly ID = "lock_toggle";
	id = LockToggleOption.ID;
	defaultValue = QUEUE_TABLE.lockToggle.default;
}