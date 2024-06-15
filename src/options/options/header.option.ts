import { StringOption } from "../base-option.ts";

export class HeaderOption extends StringOption {
	static readonly ID = "header";
	id = HeaderOption.ID;
}
