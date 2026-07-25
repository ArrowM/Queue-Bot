import { QUEUE_TABLE } from "../../db/schema.ts";
import { IntegerOption } from "../base-option.ts";

export class MemberTimeoutOption extends IntegerOption {
	static readonly ID = "member_timeout";
	id = MemberTimeoutOption.ID;
	defaultValue = QUEUE_TABLE.memberTimeout.default;
	min_value = 0;
}
