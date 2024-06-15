import { TEXT_CHANNEL_TYPE } from "../../types/misc.types.ts";
import { ChannelOption } from "../base-option.ts";

export class MessageChannelOption extends ChannelOption {
	static readonly ID = "message_channel_id";
	id = MessageChannelOption.ID;
	channelTypes = TEXT_CHANNEL_TYPE;
}