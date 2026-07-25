import { StringOption } from "../base-option.ts";

export class GamePresenceNameOption extends StringOption {
	static readonly ID = "game_presence_name";
	id = GamePresenceNameOption.ID;
}
