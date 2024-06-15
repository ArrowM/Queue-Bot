import { VOICE_TABLE } from "../../db/schema.ts";
import { BooleanOption } from "../base-option.ts";

export class JoinSyncToggleOption extends BooleanOption {
	static readonly ID = "join_sync_toggle";
	id = JoinSyncToggleOption.ID;
	defaultValue = VOICE_TABLE.joinSyncToggle.default;
}