import { BooleanOption } from "../base-option.ts";

export class BadgeToggleOption extends BooleanOption {
	static readonly ID = "badge_toggle";
	id = BadgeToggleOption.ID;
	defaultValue = true;
}