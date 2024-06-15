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

export const CHOICE_ALL = { name: "ALL", value: "all" } as const;
export const CHOICE_SOME = { name: "SOME", value: "some" } as const;

export type Mentionable = GuildMember | Role | User;
export type SelectMenuBuilder = StringSelectMenuBuilder | MentionableSelectMenuBuilder | ChannelSelectMenuBuilder;
export type SelectMenuInteraction =
	StringSelectMenuInteraction
	| MentionableSelectMenuInteraction
	| ChannelSelectMenuInteraction;
