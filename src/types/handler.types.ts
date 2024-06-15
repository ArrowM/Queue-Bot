import type { ApplicationCommandOptionChoiceData } from "discord.js";

export interface Handler {
	handle(): Promise<void>;
}

export type UIOption = ApplicationCommandOptionChoiceData;

export const MAX_SELECT_MENU_OPTIONS = 25;
export const MAX_SLASH_COMMAND_OPTIONS = 25;
