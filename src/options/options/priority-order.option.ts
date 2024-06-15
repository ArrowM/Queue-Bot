import { PRIORITIZED_TABLE } from "../../db/schema.ts";
import { IntegerOption } from "../base-option.ts";

export class PriorityOrderOption extends IntegerOption {
	static readonly ID = "priority_order";
	id = PriorityOrderOption.ID;
	defaultValue = PRIORITIZED_TABLE.priorityOrder.default;
}