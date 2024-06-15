import { IntegerOption } from "../base-option.ts";

export class PositionOption extends IntegerOption {
	static readonly ID = "position";
	id = PositionOption.ID;
	minValue = 1;
}