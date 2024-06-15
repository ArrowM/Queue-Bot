import { VOICE_CHANNEL_TYPE } from "../../types/misc.types.ts";
import { ChannelOption } from "../base-option.ts";

export class VoiceSourceChannelOption extends ChannelOption {
	static readonly ID = "voice_source_channel";
	id = VoiceSourceChannelOption.ID;
	channelTypes = VOICE_CHANNEL_TYPE;
}