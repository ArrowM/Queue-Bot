import { TEXT_CHANNEL_TYPE } from "../../types/misc.types.ts";
import { ChannelOption } from "../base-option.ts";

export class LogChannelOption extends ChannelOption {
	static readonly ID = "log_channel";
	id = LogChannelOption.ID;
	channelTypes = TEXT_CHANNEL_TYPE;
}
