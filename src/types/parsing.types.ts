import {
	type GuildMember,
	type Role,
	type User,
} from "discord.js";

export enum ChoiceType {
	ALL = "all",
	SOME = "some",
}

export const CHOICE_ALL = { name: "ALL", value: ChoiceType.ALL } as const;
export const CHOICE_SOME = { name: "SOME", value: ChoiceType.SOME } as const;

export type Mentionable = GuildMember | Role | User;
