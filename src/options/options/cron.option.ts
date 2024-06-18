import { type UIOption } from "../../types/handler.types.ts";
import { StringOption } from "../base-option.ts";

export class CronOption extends StringOption {
	static readonly ID = "cron";
	id = CronOption.ID;
	choices: UIOption[] = [
		{ name: "Custom (set custom_cron option)", value: "custom" },
		{ name: "Every minute", value: "* * * * *" },
		{ name: "Every 15 minutes", value: "*/15 * * * *" },
		{ name: "Every 30 minutes", value: "*/30 * * * *" },
		{ name: "Every hour", value: "0 * * * *" },
		{ name: "Every 2 hours", value: "0 */2 * * *" },
		{ name: "Every 3 hours", value: "0 */3 * * *" },
		{ name: "Every 4 hours", value: "0 */4 * * *" },
		{ name: "Every day at midnight", value: "0 0 * * *" },
		{ name: "Every day at noon", value: "0 12 * * *" },
		{ name: "Every Monday at midnight", value: "0 0 * * 1" },
		{ name: "Every weekday at 9 AM", value: "0 9 * * 1-5" },
		{ name: "Every 1st of the month at midnight", value: "0 0 1 * *" },
	];
}
