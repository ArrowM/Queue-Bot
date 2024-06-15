import { StringOption } from "../base-option.ts";

export class MessageOption extends StringOption {
	static readonly ID = "message";
	id = MessageOption.ID;
}
