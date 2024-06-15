import { IntegerOption } from "../base-option.ts";

export class SizeOption extends IntegerOption {
	static readonly ID = "size";
	id = SizeOption.ID;
	defaultValue = "unlimited";
	minValue = 1;
}
