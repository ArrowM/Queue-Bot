import { QUEUE_TABLE } from "../../db/schema.ts";
import { BooleanOption } from "../base-option.ts";

export class GamePresenceToggleOption extends BooleanOption {
	static readonly ID = "game_presence_toggle";
	id = GamePresenceToggleOption.ID;
	defaultValue = QUEUE_TABLE.gamePresenceToggle.default;
}
