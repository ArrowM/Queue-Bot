import { ColorResolvable, Snowflake } from "discord.js";

export interface QueueChannel {
  id: Snowflake;
  auto_fill: number; // 0 off. 1 on.
  color: ColorResolvable;
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
}

export interface DisplayChannel {
  id: Snowflake;
  display_channel_id: Snowflake;
  message_id: Snowflake;
  queue_channel_id: Snowflake;
}

export interface QueueGuild {
  id: Snowflake;
  disable_mentions: boolean;
  disable_roles: boolean;
  enable_alt_prefix: boolean;
  guild_id: Snowflake;
  msg_mode: number;
  prefix?: string;
}

export interface QueueMember {
  id: Snowflake;
  created_at: string; // timestamp
  is_priority: boolean;
  personal_message: string;
  channel_id: Snowflake;
  member_id: Snowflake;
}

export interface BlackWhiteListEntry {
  id: Snowflake;
  queue_channel_id: Snowflake;
  role_member_id: Snowflake;
  type: number; // 0 - blacklisted, 1 - whitelisted
  is_role: boolean;
}

export interface AdminPermission {
  id: Snowflake;
  guild_id: Snowflake;
  role_member_id: Snowflake;
  is_role: boolean;
}

export interface PriorityEntry {
  id: Snowflake;
  guild_id: Snowflake;
  role_member_id: Snowflake;
  is_role: boolean;
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
