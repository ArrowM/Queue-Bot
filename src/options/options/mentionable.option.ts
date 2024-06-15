import { MentionableOption as BaseMentionableOption } from "../base-option.ts";

export class MentionableOption extends BaseMentionableOption {
	static readonly ID = "mentionable";
	id = MentionableOption.ID;
}
