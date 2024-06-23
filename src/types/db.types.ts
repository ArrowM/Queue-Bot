import type { DbGuild } from "../db/schema.ts";

export enum Scope {
	NonAdmin = "non-admin",
	Admin = "admin",
	All = "all",
	None = "none",
}

export enum ScheduleCommand {
	Clear = "clear",
	Pull = "pull",
	Show = "show",
	Shuffle = "shuffle",
}

export enum Color {
	Raspberry = "#d2075c",
	DarkRed = "#810d05",
	Red = "#FF0000",
	DarkOrange = "#f57a02",
	Orange = "#FFA500",
	Gold = "#ffc400",
	Yellow = "#FFFF00",
	Lime = "#2fff00",
	Green = "#07b200",
	DarkGreen = "#018101",
	Teal = "#06a185",
	Aqua = "#06e2ea",
	SkyBlue = "#42aaec",
	Blue = "#0022ff",
	DarkBlue = "#1405d2",
	Indigo = "#4c1fd5",
	DarkPurple = "#520cb2",
	Purple = "#7003c9",
	Pink = "#e65af6",
	White = "#FFFFFF",
	LightGrey = "#bdbdbd",
	DarkGrey = "#262626",
	Black = "#000000",
	Random = "Random",
}

export enum MemberDisplayType {
	Mention = "mention",
	Username = "username",
	DisplayName = "display_name",
}

export enum DisplayUpdateType {
	Edit = "edit",
	Replace = "replace",
	New = "new",
}

export enum TimestampType {
	Off = "off",
	Date = "date",
	Time = "time",
	DateAndTime = "date and time",
	Relative = "relative",
}

export enum MemberRemovalReason {
	Left = "left",
	Kicked = "kicked",
	Pulled = "pulled",
	NotFound = "not found",
}

export type GuildStat = keyof Omit<DbGuild, "guildId" | "joinTime" | "lastUpdateTime">;