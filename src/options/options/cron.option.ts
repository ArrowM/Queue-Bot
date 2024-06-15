import { StringOption } from "../base-option.ts";

export class CronOption extends StringOption {
	static readonly ID = "cron_schedule";
	id = CronOption.ID;
}
