import { QUEUE_TABLE } from "../../db/schema.ts";
import { PullMessageDisplayType } from "../../types/db.types.ts";
import { toChoices } from "../../utils/misc.utils.ts";
import { StringOption } from "../base-option.ts";

export class PullMessageDisplayTypeOption extends StringOption {
	static readonly ID = "pull_message_display_type";
	id = PullMessageDisplayTypeOption.ID;
	defaultValue = QUEUE_TABLE.pullMessageDisplayType.default;
	choices = toChoices(Object.keys(PullMessageDisplayType));
}