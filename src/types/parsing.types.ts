import {
	ChannelSelectMenuBuilder,
	ChannelSelectMenuInteraction,
	type GuildMember,
	MentionableSelectMenuBuilder,
	MentionableSelectMenuInteraction,
	type Role,
	StringSelectMenuBuilder,
	StringSelectMenuInteraction,
	type User,
} from "discord.js";

export enum ChoiceType {
	ALL = "all",
	SOME = "some",
}

export const CHOICE_ALL = { name: "ALL", value: ChoiceType.ALL } as const;
export const CHOICE_SOME = { name: "SOME", value: ChoiceType.SOME } as const;

export type Mentionable = GuildMember | Role | User;
export type SelectMenuBuilder = StringSelectMenuBuilder | MentionableSelectMenuBuilder | ChannelSelectMenuBuilder;
export type SelectMenuInteraction =
	StringSelectMenuInteraction
	| MentionableSelectMenuInteraction
	| ChannelSelectMenuInteraction;
