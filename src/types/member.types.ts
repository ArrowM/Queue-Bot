import type { Snowflake } from "discord.js";

export type MemberDeleteBy =
	{ count?: number } |
	{ roleId: Snowflake } |
	{ userId: Snowflake } |
	{ userIds: Snowflake[] };
