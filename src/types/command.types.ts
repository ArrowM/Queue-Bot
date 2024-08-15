import type { SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder } from "discord.js";

export interface Command {
	data: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
	adminOnly: boolean;
	deferResponse: boolean;
}

abstract class CommandBase implements Command {
	readonly adminOnly: boolean;
	deferResponse = true;

	abstract data: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
}

export abstract class EveryoneCommand extends CommandBase {
	readonly adminOnly = false;
}

export abstract class AdminCommand extends CommandBase {
	readonly adminOnly = true;
}
