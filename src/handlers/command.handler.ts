import { type InteractionReplyOptions, type Message } from "discord.js";

import { COMMANDS } from "../commands/commands.loader.ts";
import { incrementGuildStat } from "../db/db-scheduled-tasks.ts";
import type { Handler } from "../types/handler.types.ts";
import type { BaseInteraction, SlashInteraction } from "../types/interaction.types.ts";
import { AdminUtils } from "../utils/admin.utils.ts";
import { InteractionUtils } from "../utils/interaction.utils.ts";
import { LoggingUtils } from "../utils/message-utils/logging.utils.ts";
import { Parser } from "../utils/message-utils/parser.ts";

export class CommandHandler implements Handler {
	private readonly inter: SlashInteraction;

	constructor(inter: BaseInteraction) {
		this.inter = inter as SlashInteraction;
		this.inter.parser = new Parser(this.inter);
	}

	async handle() {
		await this.inter.deferReply({ ephemeral: true });

		const subcommandName = (this.inter.options as any)._subcommand;
		const fullCommandName = `${this.inter.commandName}${subcommandName ? `_${subcommandName}` : ""}`.replace(/-/g, "_");
		const command = COMMANDS.get(this.inter.commandName);

		if (command && fullCommandName in command) {
			this.inter.promptConfirmOrCancel = (message: string) => InteractionUtils.promptConfirmOrCancel(this.inter, message);
			this.inter.respond = (message: InteractionReplyOptions | string, log = false) => InteractionUtils.respond(this.inter, command.adminOnly, message, log);
			this.inter.log = (originalMessage: Message | string) => LoggingUtils.log(this.inter.store, command.adminOnly, originalMessage);

			if (command.adminOnly) {
				AdminUtils.verifyIsAdmin(this.inter.store, this.inter.member);
			}

			incrementGuildStat(this.inter.guildId, "commandsReceived");
			await (command as any)[fullCommandName](this.inter);
		}
		else {
			throw new Error(`Could not find ${fullCommandName}()`);
		}
	}
}