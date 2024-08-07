import type { InteractionReplyOptions, Message } from "discord.js";

import { BUTTONS } from "../buttons/buttons.loader.ts";
import { incrementGuildStat } from "../db/db-scheduled-tasks.ts";
import type { Handler } from "../types/handler.types.ts";
import type { BaseInteraction, ButtonInteraction } from "../types/interaction.types.ts";
import { AdminUtils } from "../utils/admin.utils.ts";
import { InteractionUtils } from "../utils/interaction.utils.ts";
import { LoggingUtils } from "../utils/message-utils/logging.utils.ts";

export class ButtonHandler implements Handler {
	private readonly inter: ButtonInteraction;

	constructor(inter: BaseInteraction) {
		this.inter = inter as ButtonInteraction;
	}

	async handle() {
		await this.inter.deferReply({ ephemeral: true });
		const button = BUTTONS.get(this.inter.customId);
		if (button) {
			this.inter.respond = (message: InteractionReplyOptions | string, log = false) => InteractionUtils.respond(this.inter, button.adminOnly, message, log);
			this.inter.log = (originalMessage: Message | string) => LoggingUtils.log(this.inter.store, button.adminOnly, originalMessage);

			if (button.adminOnly) {
				AdminUtils.verifyIsAdmin(this.inter.store, this.inter.member);
			}

			incrementGuildStat(this.inter.guildId, "buttonsReceived");
			await button.handle(this.inter);
		}
	}
}