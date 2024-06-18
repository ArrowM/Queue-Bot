import { StringOption } from "../base-option.ts";

export class CustomCronOption extends StringOption {
	static readonly ID = "custom_cron";
	id = CustomCronOption.ID;
}