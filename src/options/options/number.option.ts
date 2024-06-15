import { IntegerOption } from "../base-option.ts";

export class NumberOption extends IntegerOption {
	static readonly ID = "number";
	id = NumberOption.ID;
}
