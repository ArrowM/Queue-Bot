import {
	type AutocompleteInteraction as DiscordAutocompleteInteraction,
	type ButtonInteraction as DiscordButtonInteraction,
	type ChatInputCommandInteraction as DiscordSlashCommandInteration,
	type GuildMember,
	type Interaction as DiscordInteraction,
	type InteractionReplyOptions,
	type Message,
	type ModalSubmitInteraction as DiscordModalSubmitInteraction,
} from "discord.js";

import type { Store } from "../db/store.ts";
import { type Parser } from "../utils/message-utils/parser.ts";

interface BaseProperties {
	store: Store;
	member: GuildMember; // overrides default type of `GuildMember | APIInteractionGuildMember`
}

type AutocompleteProperties = BaseProperties & {
	parser: Parser<AutocompleteInteraction>;
}

type RespondableProperties = BaseProperties & {
	parser: Parser<SlashInteraction>;
	promptConfirmOrCancel?: (message: string) => Promise<boolean>;
	respond: (message: InteractionReplyOptions | string, log?: boolean) => Promise<Message>;
}

type DiscordResponseFn = "send" | "reply" | "followUp";

export type BaseInteraction = Omit<DiscordInteraction, DiscordResponseFn | "respond"> & BaseProperties;
export type AutocompleteInteraction = Omit<DiscordAutocompleteInteraction, DiscordResponseFn> & AutocompleteProperties;
export type ButtonInteraction = Omit<DiscordButtonInteraction, DiscordResponseFn | "respond"> & RespondableProperties;
export type SlashInteraction = Omit<DiscordSlashCommandInteration, DiscordResponseFn | "respond"> & RespondableProperties;
export type ModalInteraction = Omit<DiscordModalSubmitInteraction, DiscordResponseFn | "respond"> & RespondableProperties;
export type AnyInteraction = AutocompleteInteraction | ButtonInteraction | SlashInteraction | ModalInteraction;