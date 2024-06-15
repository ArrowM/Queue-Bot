import { StringOption } from "../base-option.ts";

export class PullMessageOption extends StringOption {
	static readonly ID = "pull_message";
	id = PullMessageOption.ID;
}