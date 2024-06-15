import { VOICE_TABLE } from "../../db/schema.ts";
import { BooleanOption } from "../base-option.ts";

export class LeaveSyncToggleOption extends BooleanOption {
	static readonly ID = "leave_sync_toggle";
	id = LeaveSyncToggleOption.ID;
	defaultValue = VOICE_TABLE.leaveSyncToggle.default;
}