import { VOICE_CHANNEL_TYPE } from "../../types/misc.types.ts";
import { ChannelOption } from "../base-option.ts";

export class VoiceDestinationChannelOption extends ChannelOption {
	static readonly ID = "voice_destination_channel";
	id = VoiceDestinationChannelOption.ID;
	channelTypes = VOICE_CHANNEL_TYPE;
}
