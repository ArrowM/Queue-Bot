import { QUEUE_TABLE } from "../../db/schema.ts";
import { BooleanOption } from "../base-option.ts";

export class BadgeToggleOption extends BooleanOption {
	static readonly ID = "badge_toggle";
	id = BadgeToggleOption.ID;
	defaultValue = QUEUE_TABLE.badgeToggle.default;
}