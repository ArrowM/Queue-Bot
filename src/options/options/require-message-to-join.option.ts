import { BooleanOption } from "../base-option.ts";

export class RequireMessageToJoinOption extends BooleanOption {
	static readonly ID = "require_message_to_join";
	id = RequireMessageToJoinOption.ID;
	defaultValue = false;
}