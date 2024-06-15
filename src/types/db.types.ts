import type { DbGuild } from "../db/schema.ts";

export enum LogScope {
	NonAdmin = "non-admin",
	Admin = "admin",
	All = "all",
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
	Green = "#06af00",
	DarkGreen = "#018d01",
	Teal = "#06a17c",
	Aqua = "#06e2ea",
	SkyBlue = "#42aaec",
	Blue = "#0022ff",
	DarkBlue = "#1405d2",
	Indigo = "#410fc4",
	DarkPurple = "#470994",
	Purple = "#6903c9",
	Pink = "#e65af6",
	White = "#FFFFFF",
	LightGrey = "#c2c2c2",
	Grey = "#808080",
	Black = "#000000",
	Random = "Random",
}

export enum MemberDisplayType {
	Mention = "mention",
	Plaintext = "plaintext",
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

export enum ArchivedMemberReason {
	Left = "left",
	Kicked = "kicked",
	Pulled = "pulled",
	NotFound = "not found",
}

export type GuildStat = keyof Omit<DbGuild, "guildId" | "joinTime" | "lastUpdateTime">;