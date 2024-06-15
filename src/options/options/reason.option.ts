import { StringOption } from "../base-option.ts";

export class ReasonOption extends StringOption {
	static readonly ID = "reason";
	id = ReasonOption.ID;
}