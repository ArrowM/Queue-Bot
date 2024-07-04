import { QUEUE_TABLE } from "../../db/schema.ts";
import { BooleanOption } from "../base-option.ts";

export class DmOnPullToggleOption extends BooleanOption {
	static readonly ID = "dm_on_pull_toggle";
	id = DmOnPullToggleOption.ID;
	defaultValue = QUEUE_TABLE.dmOnPullToggle.default;
}