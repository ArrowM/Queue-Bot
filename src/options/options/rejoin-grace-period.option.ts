import { QUEUE_TABLE } from "../../db/schema.ts";
import { IntegerOption } from "../base-option.ts";

export class RejoinGracePeriodOption extends IntegerOption {
	static readonly ID = "rejoin_grace_period";
	id = RejoinGracePeriodOption.ID;
	defaultValue = QUEUE_TABLE.rejoinGracePeriod.default;
	minValue = 0;
}
