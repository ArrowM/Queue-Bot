/* eslint-disable unused-imports/no-unused-vars */
import { ColorResolvable, GuildBasedChannel, Snowflake } from "discord.js";

// ------ TABLES ------

export interface AdminPermission {
  id: number;
  guild_id: Snowflake;
  role_member_id: Snowflake;
  is_role: boolean;
}

export interface BlackWhiteListEntry {
  id: number;
  queue_channel_id: Snowflake;
  role_member_id: Snowflake;
  type: number; // 0 - blacklisted, 1 - whitelisted
  is_role: boolean;
}

export interface DisplayChannel {
  id: number;
  display_channel_id: Snowflake;
  is_inline: boolean;
  message_id: Snowflake;
  queue_channel_id: Snowflake;
}

export interface LastPulled {
  id: number;
  queue_channel_id: Snowflake;
  voice_channel_id: Snowflake;
  member_id: Snowflake;
}

export interface PriorityEntry {
  id: number;
  guild_id: Snowflake;
  role_member_id: Snowflake;
  is_role: boolean;
}

export interface StoredQueue {
  id: number;
  auto_fill: number; // 0 off. 1 on.
  color: ColorResolvable;
  enable_partial_pull: boolean;
  guild_id: Snowflake;
  grace_period: number;
  header: string;
  hide_button: boolean;
  is_locked: boolean;
  max_members: number;
  pull_num: number;
  queue_channel_id: Snowflake;
  role_id: Snowflake;
  target_channel_id: Snowflake;
  mute: boolean;
}

export interface StoredGuild {
  id: number;
  disable_mentions: boolean;
  disable_notifications: boolean;
  disable_roles: boolean;
  guild_id: Snowflake;
  logging_channel_id: Snowflake;
  logging_channel_level: number;
  msg_mode: number;
  role_prefix: string;
  timestamps: string;
}

export interface QueueMember {
  id: number;
  created_at: Date; // Used for queue position
  display_time: Date; // Used for displayed timestamp
  is_priority: boolean;
  personal_message: string;
  channel_id: Snowflake;
  member_id: Snowflake;
}

export interface Schedule {
  id: Snowflake;
  command: ScheduleCommand;
  queue_channel_id: Snowflake;
  schedule: string;
  utc_offset: number;
}

// ------ OTHER ------

export enum ReplaceWith {
  QUEUE_CHANNEL = "QUEUE_CHANNEL",
  QUEUE_CHANNEL_ID = "QUEUE_CHANNEL_ID",
  STORED_QUEUE = "STORED_QUEUE",
  STORED_GUILD = "STORED_GUILD",
}

export enum ScheduleCommand {
  CLEAR = "clear",
  DISPLAY = "display",
  NEXT = "next",
  SHUFFLE = "shuffle",
}

export interface QueuePair {
  stored: StoredQueue;
  channel: GuildBasedChannel;
}

export interface QueueUpdateRequest {
  storedGuild: StoredGuild;
  queueChannel: GuildBasedChannel;
}

export interface ConfigJson {
  token: string;
  clientId: string;
  topGgToken: string;

  color: ColorResolvable;
  databaseType: string;
  databaseHost: string;
  databaseName: string;
  databaseUsername: string;
  databasePassword: string;
  gracePeriod: number;
  permissionsRegexp: string;

  announcementChannelId: Snowflake;
}

export interface Timezone {
  value: string;
  abbr: string;
  offset: number;
  isdst: boolean;
  text: string;
  timezone: string;
}

export enum RequiredType {
  REQUIRED = "REQUIRED",
  OPTIONAL = "OPTIONAL",
}

export enum QueuableTextChannelTypes {
  GUILD_TEXT = "GUILD_TEXT",
  GUILD_NEWS = "GUILD_NEWS",
  GUILD_PUBLIC_THREAD = "GUILD_PUBLIC_THREAD",
}
export const QUEUABLE_TEXT_CHANNELS = [...Object.values(QueuableTextChannelTypes), ...Array(16).keys()];

export enum QueuableVoiceChannelTypes {
  GUILD_VOICE = "GUILD_VOICE",
  GUILD_STAGE_VOICE = "GUILD_STAGE_VOICE",
}
export const QUEUABLE_VOICE_CHANNELS = Object.values(QueuableVoiceChannelTypes);

export const QUEUABLE_CHANNELS = [...QUEUABLE_TEXT_CHANNELS, ...QUEUABLE_VOICE_CHANNELS];
