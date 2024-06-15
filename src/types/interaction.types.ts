import {
	type AutocompleteInteraction as DiscordAutocompleteInteraction,
	type ButtonInteraction as DiscordButtonInteraction,
	type ChatInputCommandInteraction as DiscordSlashCommandInteration,
	type GuildMember,
	type Interaction as DiscordInteraction,
	type InteractionReplyOptions,
	type Message,
} from "discord.js";

import type { Store } from "../db/store.ts";
import { type Parser } from "../utils/message-utils/parser.ts";

interface BaseProperties {
	store: Store;
	/** InteractionUtils.respond() */
	respond: (message: (InteractionReplyOptions | string), log?: boolean) => Promise<Message>;
	log: (originalMessage: Message | string) => Promise<Message>;
	member: GuildMember; // overrides default type of `GuildMember | APIInteractionGuildMember`
}

type AutocompleteProperties = BaseProperties & {
	parser: Parser<AutocompleteInteraction>;
}

type SlashProperties = BaseProperties & {
	parser: Parser<SlashInteraction>;
	promptConfirmOrCancel?: (message: string) => Promise<boolean>;
}

export type AnyInteraction = Omit<DiscordInteraction, "send" | "reply" | "followUp"> & BaseProperties;
export type AutocompleteInteraction = Omit<DiscordAutocompleteInteraction, "send" | "reply" | "followUp"> & AutocompleteProperties;
export type ButtonInteraction = Omit<DiscordButtonInteraction, "send" | "reply" | "followUp"> & SlashProperties;
export type SlashInteraction = Omit<DiscordSlashCommandInteration, "send" | "reply" | "followUp"> & SlashProperties;