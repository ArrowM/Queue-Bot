import { StringOption } from "../base-option.ts";

export class NameOption extends StringOption {
	static readonly ID = "name";
	id = NameOption.ID;
}
