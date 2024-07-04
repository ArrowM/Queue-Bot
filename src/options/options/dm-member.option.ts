import { BooleanOption } from "../base-option.ts";

export class DmMemberOption extends BooleanOption {
	static readonly ID = "dm_member";
	id = DmMemberOption.ID;
	defaultValue = false;
}