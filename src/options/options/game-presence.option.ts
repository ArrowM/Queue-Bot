import { StringOption } from "../base-option.ts";

export class GamePresenceOption extends StringOption {
	static readonly ID = "game_presence";
	id = GamePresenceOption.ID;
}
