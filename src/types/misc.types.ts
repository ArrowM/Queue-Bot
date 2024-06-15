import { ChannelType, type Collection, type Snowflake } from "discord.js";

import type { GuildStat } from "./db.types.ts";

// /  Channel types

export const TEXT_CHANNEL_TYPE = [
	ChannelType.GuildText,
	ChannelType.GuildAnnouncement,
] as const;

export const VOICE_CHANNEL_TYPE = [
	ChannelType.GuildVoice,
	ChannelType.GuildStageVoice,
] as const;

// /  Other

export const TIMEZONES = Intl.supportedValuesOf("timeZone");
export const LOWER_TIMEZONES = TIMEZONES.map(tz => tz.toLowerCase());


export type PendingGuildUpdates = {
	[K in Snowflake]?: {
		[P in GuildStat]?: number;
	};
}

export type ArrayOrCollection<K, V> = V[] | Collection<K, V>;
