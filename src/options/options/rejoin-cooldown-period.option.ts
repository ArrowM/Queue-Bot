import { QUEUE_TABLE } from "../../db/schema.ts";
import { IntegerOption } from "../base-option.ts";

export class RejoinCooldownPeriodOption extends IntegerOption {
	static readonly ID = "rejoin_cooldown_period";
	id = RejoinCooldownPeriodOption.ID;
	defaultValue = QUEUE_TABLE.rejoinCooldownPeriod.default;
	minValue = 0;
}