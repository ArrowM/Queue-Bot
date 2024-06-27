import { QUEUE_TABLE } from "../../db/schema.ts";
import { BooleanOption } from "../base-option.ts";

export class DmMemberToggleOption extends BooleanOption {
	static readonly ID = "dm_on_pull_toggle";
	id = DmMemberToggleOption.ID;
	defaultValue = QUEUE_TABLE.dmMemberToggle.default;
}